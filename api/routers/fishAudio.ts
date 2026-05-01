import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios from "axios";

const FISH_API_URL = "https://api.fish.audio/v1/tts";

export const fishAudioRouter = createRouter({
  speak: publicQuery
    .input(
      z.object({
        text: z.string().min(1).max(1000),
        referenceId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const apiKey = process.env.FISH_AUDIO_API_KEY || "";
      if (!apiKey) {
        return { success: false, error: "FISH_AUDIO_API_KEY not configured", audioBase64: null };
      }

      try {
        const response = await axios.post(
          FISH_API_URL,
          {
            text: input.text,
            reference_id: input.referenceId || undefined,
            format: "mp3",
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
            timeout: 30000,
          }
        );

        const audioBase64 = Buffer.from(response.data).toString("base64");
        return { success: true, audioBase64, error: null };
      } catch (err: any) {
        console.error("[fishAudio] TTS error:", err?.message || err);
        return {
          success: false,
          error: err?.response?.data?.message || err?.message || "TTS failed",
          audioBase64: null,
        };
      }
    }),

  status: publicQuery.query(() => {
    const hasKey = !!process.env.FISH_AUDIO_API_KEY;
    return {
      available: hasKey,
      message: hasKey ? "Fish Audio ready" : "FISH_AUDIO_API_KEY not set",
    };
  }),
});
