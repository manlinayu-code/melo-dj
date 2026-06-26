import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios, { AxiosError } from "axios";

const FISH_API_URL = "https://api.fish.audio/v1/tts";

// =============================================================
// Model selection
// s2-pro is the recommended model: higher quality, multi-speaker
// support, [bracket] natural-language emotion tags, and
// prosody.normalize_loudness. s1 is the legacy option.
// =============================================================
const DEFAULT_MODEL = "s2-pro";

// =============================================================
// Voice presets — map "gender" / "voice" name to Fish.Audio model_id.
// These IDs are stable Fish.Audio voice references; override via the
// `voice` field if a more specific model_id is required.
// =============================================================
export const FISH_VOICES = {
  female: "faccba1a8ac54016bcfc02761285e67f", // English warm female
  male: process.env.FISH_AUDIO_MALE_VOICE_ID || "ef9c79b62ef34530bf452c0e50e3c260", // 低沉性感男声
  default: "faccba1a8ac54016bcfc02761285e67f",
} as const;

export type FishVoiceConfig = {
  voice?: string;
  speed?: number;
  gender?: "male" | "female";
  /** S2-Pro: natural-language emotion / style hint, injected as [bracket] tags */
  styleHint?: string;
  model?: string;
};

export function resolveFishModelId(cfg: FishVoiceConfig): string {
  if (cfg.voice && cfg.voice.length > 0) return cfg.voice;
  if (cfg.gender === "male") return FISH_VOICES.male;
  if (cfg.gender === "female") return FISH_VOICES.female;
  return FISH_VOICES.default;
}

// =============================================================
// S2-Pro emotion injection
// If a styleHint is provided and model supports it, wrap text
// with [bracket] natural-language emotion tags.
// S1 uses (parenthesis) syntax but we default to S2-Pro.
// Default style hint can be overridden via FISH_AUDIO_STYLE_HINT.
// =============================================================
const DEFAULT_STYLE_HINT = process.env.FISH_AUDIO_STYLE_HINT || "gentle, warm, soft";
const DEFAULT_SPEED = parseFloat(process.env.FISH_AUDIO_SPEED || "0.9");

function applyEmotionTags(text: string, cfg: FishVoiceConfig, model?: string): string {
  let styleHint = cfg.styleHint;
  if (!styleHint || styleHint.length === 0) {
    styleHint = DEFAULT_STYLE_HINT;
  }
  if (!styleHint || styleHint.length === 0) return text;
  const isS1 = model === "s1";
  const tag = isS1 ? `(${styleHint})` : `[${styleHint}]`;
  return `${tag} ${text}`;
}

// =============================================================
// In-memory cache — keyed by (text + voice + speed + styleHint).
// 5 min TTL. Avoids re-billing on quick re-speaks.
// =============================================================
type CacheEntry = { audioBase64: string; expiresAt: number };
const CACHE_TTL_MS = 5 * 60 * 1000;
const ttsCache = new Map<string, CacheEntry>();

function cacheKey(text: string, modelId: string, speed: number, styleHint?: string): string {
  const style = styleHint ?? "";
  return `${modelId}::${speed}::${style}::${text}`;
}

function cacheGet(key: string): string | null {
  const hit = ttsCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    ttsCache.delete(key);
    return null;
  }
  return hit.audioBase64;
}

function cacheSet(key: string, audioBase64: string): void {
  ttsCache.set(key, { audioBase64, expiresAt: Date.now() + CACHE_TTL_MS });
  if (ttsCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of ttsCache) {
      if (v.expiresAt < now) ttsCache.delete(k);
    }
  }
}

// =============================================================
// Core synth — returns base64 mp3 or throws.
// =============================================================
export async function synthesizeFish(
  text: string,
  cfg: FishVoiceConfig,
): Promise<{ audioBase64: string; modelId: string; cached: boolean }> {
  const apiKey = process.env.FISH_AUDIO_API_KEY || "";
  if (!apiKey) {
    throw new Error("FISH_AUDIO_API_KEY not configured");
  }

  const modelId = resolveFishModelId(cfg);
  const model = cfg.model || DEFAULT_MODEL;
  const rawSpeed = typeof cfg.speed === "number" && isFinite(cfg.speed) ? cfg.speed : 1.0;
  // Apply env-configured default speed when user hasn't touched the slider (tRPC default is 1.0)
  const speed = rawSpeed === 1.0 ? DEFAULT_SPEED : rawSpeed;
  const styledText = applyEmotionTags(text, cfg, model);
  const key = cacheKey(styledText, modelId, speed, cfg.styleHint);

  const cached = cacheGet(key);
  if (cached) {
    console.log(`[fishAudio] cache hit (model=${model}, voice=${modelId}, len=${text.length})`);
    return { audioBase64: cached, modelId, cached: true };
  }

  console.log(
    `[fishAudio] synth start (model=${model}, voice=${modelId}, speed=${speed}, style=${cfg.styleHint ?? "none"}, len=${text.length})`,
  );

  const response = await axios.post(
    FISH_API_URL,
    {
      text: styledText,
      reference_id: modelId,
      format: "mp3",
      // ---- quality knobs ----
      temperature: 0.7,         // balanced expressiveness (0-1)
      top_p: 0.7,               // nucleus sampling diversity
      repetition_penalty: 1.2,  // reduce audio pattern repeats
      // ---- chunking ----
      chunk_length: 300,
      min_chunk_length: 50,
      condition_on_previous_chunks: true,
      early_stop_threshold: 1,
      // ---- prosody (speed/volume) ----
      prosody: {
        speed,
        volume: 0,
        normalize_loudness: true, // S2-Pro only — consistent perceived volume
      },
      // ---- latency-quality trade-off ----
      latency: "normal", // best quality; "balanced" / "low" if latency matters
      // ---- text normalization ----
      normalize: true,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model, // API requires model selection via header
      },
      responseType: "arraybuffer",
      timeout: 30000,
    },
  );

  const buf = response.data as ArrayBuffer | Buffer;
  const audioBase64 = Buffer.from(buf as Buffer).toString("base64");
  if (!audioBase64) throw new Error("Fish.Audio returned empty audio");

  cacheSet(key, audioBase64);
  console.log(`[fishAudio] synth ok (bytes=${audioBase64.length})`);
  return { audioBase64, modelId, cached: false };
}

function describeAxiosError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data && typeof data === "object") {
      const msg = (data as { message?: string }).message;
      if (msg) return msg;
    }
    return err.message;
  }
  return (err as Error)?.message || "TTS failed";
}

export const fishAudioRouter = createRouter({
  speak: publicQuery
    .input(
      z.object({
        text: z.string().min(1).max(2500),
        referenceId: z.string().optional(),
        voice: z.string().optional(),
        gender: z.enum(["male", "female"]).optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
        styleHint: z.string().max(200).optional(),
        model: z.enum(["s1", "s2-pro"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const apiKey = process.env.FISH_AUDIO_API_KEY || "";
      if (!apiKey) {
        return { success: false, error: "FISH_AUDIO_API_KEY not configured", audioBase64: null };
      }

      try {
        const { audioBase64 } = await synthesizeFish(input.text, {
          voice: input.referenceId || input.voice,
          gender: input.gender,
          speed: input.speed,
          styleHint: input.styleHint,
          model: input.model,
        });
        return { success: true, audioBase64, error: null };
      } catch (err) {
        const msg = describeAxiosError(err);
        console.error("[fishAudio] TTS error:", msg);
        return { success: false, error: msg, audioBase64: null };
      }
    }),

  status: publicQuery.query(() => {
    const hasKey = !!process.env.FISH_AUDIO_API_KEY;
    return {
      available: hasKey,
      model: DEFAULT_MODEL,
      message: hasKey ? `Fish Audio ready (${DEFAULT_MODEL})` : "FISH_AUDIO_API_KEY not set",
    };
  }),
});
