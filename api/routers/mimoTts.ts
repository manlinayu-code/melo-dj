import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios, { AxiosError } from "axios";

const MIMO_API_URL = "https://api.xiaomimimo.com/v1/chat/completions";
const MIMO_MODEL = "mimo-v2.5-tts";
const MIMO_TIMEOUT_MS = 30000;

// =============================================================
// MiMo V2.5 preset voices.
// 中文低沉成熟男声: 白桦 (mature male)
// 英文沉稳低沉男声: Dean (steady male)
// 其他保留以备扩展
// =============================================================
export const MIMO_VOICES = {
  zh_male_deep: "白桦",
  zh_male_sunny: "苏打",
  zh_female_lively: "冰糖",
  zh_female_intellectual: "茉莉",
  en_male_steady: "Dean",
  en_male_sunny: "Milo",
  en_female_lively: "Mia",
  en_female_sweet: "Chloe",
} as const;

export type MimoVoiceConfig = {
  voice?: string;        // 显式 voice id，会覆盖语言自动选择
  styleHint?: string;    // 自然语言风格描述（Director Mode）
};

const ZH_REGEX = /[一-龥]/;

export function pickMimoVoice(text: string, override?: string): string {
  if (override && override.length > 0) return override;
  return ZH_REGEX.test(text) ? MIMO_VOICES.zh_male_deep : MIMO_VOICES.en_male_steady;
}

// =============================================================
// In-memory cache — keyed by (voice + text). 5 min TTL.
// =============================================================
type CacheEntry = { audioBase64: string; expiresAt: number };
const CACHE_TTL_MS = 5 * 60 * 1000;
const mimoCache = new Map<string, CacheEntry>();

function cacheKey(text: string, voice: string): string {
  return `${voice}::${text}`;
}

function cacheGet(key: string): string | null {
  const hit = mimoCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    mimoCache.delete(key);
    return null;
  }
  return hit.audioBase64;
}

function cacheSet(key: string, audioBase64: string): void {
  mimoCache.set(key, { audioBase64, expiresAt: Date.now() + CACHE_TTL_MS });
  if (mimoCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of mimoCache) {
      if (v.expiresAt < now) mimoCache.delete(k);
    }
  }
}

// =============================================================
// Core synth — returns base64 wav or throws.
// =============================================================
export async function synthesizeMimo(
  text: string,
  cfg: MimoVoiceConfig = {},
): Promise<{ audioBase64: string; format: "wav"; voice: string; cached: boolean }> {
  const apiKey = process.env.MIMO_API_KEY || "";
  if (!apiKey) {
    throw new Error("MIMO_API_KEY not configured");
  }

  const voice = pickMimoVoice(text, cfg.voice);
  const key = cacheKey(text, voice);

  const cached = cacheGet(key);
  if (cached) {
    console.log(`[mimoTts] cache hit (voice=${voice}, len=${text.length})`);
    return { audioBase64: cached, format: "wav", voice, cached: true };
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (cfg.styleHint && cfg.styleHint.length > 0) {
    messages.push({ role: "user", content: cfg.styleHint });
  }
  messages.push({ role: "assistant", content: text });

  console.log(`[mimoTts] synth start (voice=${voice}, len=${text.length})`);
  const response = await axios.post(
    MIMO_API_URL,
    {
      model: MIMO_MODEL,
      messages,
      audio: { format: "wav", voice },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: MIMO_TIMEOUT_MS,
    },
  );

  const audioBase64 = response.data?.choices?.[0]?.message?.audio?.data;
  if (!audioBase64 || typeof audioBase64 !== "string") {
    throw new Error("MiMo returned empty audio data");
  }

  cacheSet(key, audioBase64);
  console.log(`[mimoTts] synth ok (voice=${voice}, bytes=${audioBase64.length})`);
  return { audioBase64, format: "wav", voice, cached: false };
}

function describeAxiosError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data && typeof data === "object") {
      const direct = (data as { message?: string }).message;
      if (direct) return direct;
      const nested = (data as { error?: { message?: string } }).error?.message;
      if (nested) return nested;
    }
    if (err.code === "ECONNABORTED") return "MiMo TTS timeout";
    return err.message;
  }
  return (err as Error)?.message || "MiMo TTS failed";
}

export const mimoTtsRouter = createRouter({
  speak: publicQuery
    .input(
      z.object({
        text: z.string().min(1).max(2500),
        voice: z.string().optional(),
        styleHint: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const apiKey = process.env.MIMO_API_KEY || "";
      if (!apiKey) {
        return {
          success: false,
          error: "MIMO_API_KEY not configured",
          audioBase64: null,
          format: null,
          voice: null,
        };
      }
      try {
        const result = await synthesizeMimo(input.text, {
          voice: input.voice,
          styleHint: input.styleHint,
        });
        return {
          success: true,
          audioBase64: result.audioBase64,
          format: result.format,
          voice: result.voice,
          cached: result.cached,
          error: null,
        };
      } catch (err) {
        const msg = describeAxiosError(err);
        console.error("[mimoTts] TTS error:", msg);
        return {
          success: false,
          error: msg,
          audioBase64: null,
          format: null,
          voice: null,
        };
      }
    }),

  status: publicQuery.query(() => {
    const hasKey = !!process.env.MIMO_API_KEY;
    return {
      available: hasKey,
      message: hasKey ? "MiMo TTS ready" : "MIMO_API_KEY not set",
      voices: MIMO_VOICES,
    };
  }),
});
