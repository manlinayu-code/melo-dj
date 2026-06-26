import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { synthesizeFish } from "./fishAudio";
import { synthesizeMimo } from "./mimoTts";

// =============================================================
// TTS dispatcher
// - mode = "mimo"    → call MiMo V2.5 TTS (deep male, zh+en auto).
//                      If MIMO_API_KEY missing → PRECONDITION_FAILED.
//                      If synth fails       → fallback to browser.
// - mode = "fish"    → call Fish.Audio. Same shape of fallback.
// - mode = "browser" → directly tell client to use Web Speech API.
// - mode = "auto"    → priority: mimo > fish > browser by API keys.
//                      On failure of higher provider, cascade down.
//
// Response is a discriminated union on `source`:
//   { source: "mimo",    audioBase64, format: "wav", voice, cached }
//   { source: "fish",    audioBase64, format: "mp3", voice, cached }
//   { source: "browser", text, voice, lang, rate, reason? }
// =============================================================

type TtsResponse =
  | {
      source: "mimo";
      audioBase64: string;
      format: "wav";
      voice: string;
      cached: boolean;
    }
  | {
      source: "fish";
      audioBase64: string;
      format: "mp3";
      voice: string;
      cached: boolean;
    }
  | {
      source: "browser";
      text: string;
      voice: string | null;
      lang: string;
      rate: number;
      reason?: string;
    };

const speakInput = z.object({
  text: z.string().min(1).max(2500),
  mode: z.enum(["auto", "mimo", "fish", "browser"]).optional().default("auto"),
  voice: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  speed: z.number().min(0.5).max(2.0).optional().default(1.0),
  lang: z.string().optional().default("zh-CN"),
  styleHint: z.string().max(200).optional(),
});

type SpeakInput = z.infer<typeof speakInput>;

function browserResponse(input: SpeakInput, reason?: string): TtsResponse {
  return {
    source: "browser",
    text: input.text,
    voice: input.voice ?? null,
    lang: input.lang,
    rate: input.speed,
    reason,
  };
}

export const ttsRouter = createRouter({
  settings: publicQuery.query(() => {
    const mimoAvailable = !!process.env.MIMO_API_KEY;
    const fishAvailable = !!process.env.FISH_AUDIO_API_KEY;
    const preferredSource = mimoAvailable ? "mimo" : fishAvailable ? "fish" : "browser";
    return {
      voice: {
        name: "Melo DJ Voice",
        lang: "zh-CN",
        pitch: 0.9,
        rate: 0.95,
      },
      mimoAvailable,
      fishAvailable,
      preferredSource,
    };
  }),

  speak: publicQuery.input(speakInput).mutation(async ({ input }): Promise<TtsResponse> => {
    const mimoAvailable = !!process.env.MIMO_API_KEY;
    const fishAvailable = !!process.env.FISH_AUDIO_API_KEY;

    if (input.mode === "mimo" && !mimoAvailable) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "MiMo TTS not configured (MIMO_API_KEY missing)",
      });
    }
    if (input.mode === "fish" && !fishAvailable) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Fish.Audio TTS not configured (FISH_AUDIO_API_KEY missing)",
      });
    }

    // Build attempt order. Each provider attempted in sequence;
    // first success returns, failures cascade to the next.
    const order: Array<"mimo" | "fish" | "browser"> = (() => {
      if (input.mode === "browser") return ["browser"];
      if (input.mode === "mimo") return ["mimo", "browser"];
      if (input.mode === "fish") return ["fish", "browser"];
      // auto
      const seq: Array<"mimo" | "fish" | "browser"> = [];
      if (mimoAvailable) seq.push("mimo");
      if (fishAvailable) seq.push("fish");
      seq.push("browser");
      return seq;
    })();

    let lastReason: string | undefined;

    for (const provider of order) {
      if (provider === "browser") {
        if (lastReason) {
          console.log(`[tts] dispatcher → browser (after fallback: ${lastReason})`);
        } else {
          console.log("[tts] dispatcher → browser");
        }
        return browserResponse(input, lastReason);
      }

      if (provider === "mimo") {
        try {
          const r = await synthesizeMimo(input.text, {
            voice: input.voice,
            styleHint: input.styleHint,
          });
          if (!r.audioBase64) throw new Error("empty audio from MiMo");
          console.log(`[tts] dispatcher → mimo (voice=${r.voice}, cached=${r.cached})`);
          return {
            source: "mimo",
            audioBase64: r.audioBase64,
            format: r.format,
            voice: r.voice,
            cached: r.cached,
          };
        } catch (err) {
          lastReason = (err as Error)?.message || "mimo synth failed";
          console.warn(`[tts] mimo failed: ${lastReason}`);
          // continue to next provider in the order
        }
      } else if (provider === "fish") {
        try {
          const r = await synthesizeFish(input.text, {
            voice: input.voice,
            gender: input.gender,
            speed: input.speed,
            styleHint: input.styleHint,
          });
          if (!r.audioBase64) throw new Error("empty audio from Fish.Audio");
          console.log(`[tts] dispatcher → fish (model=${r.modelId}, cached=${r.cached})`);
          return {
            source: "fish",
            audioBase64: r.audioBase64,
            format: "mp3",
            voice: r.modelId,
            cached: r.cached,
          };
        } catch (err) {
          lastReason = (err as Error)?.message || "fish synth failed";
          console.warn(`[tts] fish failed: ${lastReason}`);
          // continue to next provider in the order
        }
      }
    }

    // Order always ends with "browser" so this is unreachable; keep for type safety.
    return browserResponse(input, lastReason);
  }),
});
