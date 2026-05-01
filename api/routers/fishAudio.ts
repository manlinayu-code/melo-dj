import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios from "axios";

const FISH_AUDIO_API_URL = "https://api.fish.audio/v1/tts";

export const fishAudioRouter = createRouter({
  // TTS via Fish Audio API - English radio DJ voice
  speak: publicQuery
    .input(z.object({
      text: z.string(),
      referenceId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.FISH_AUDIO_API_KEY || "";
      if (!apiKey) {
        return { success: false, error: "FISH_AUDIO_API_KEY not configured", audioUrl: null };
      }

      try {
        const response = await axios.post(
          FISH_AUDIO_API_URL,
          {
            text: input.text,
            reference_id: input.referenceId || "",
            format: "mp3",
          },
          {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
            timeout: 30000,
          }
        );

        // Convert ArrayBuffer to base64 for tRPC transfer
        const base64 = Buffer.from(response.data).toString("base64");
        const audioUrl = `data:audio/mp3;base64,${base64}`;

        return { success: true, audioUrl, error: null };
      } catch (error: any) {
        console.error("Fish Audio TTS error:", error.message);
        return { success: false, error: error.message, audioUrl: null };
      }
    }),

  // Check if Fish Audio is available
  status: publicQuery
    .query(() => {
      const hasKey = !!process.env.FISH_AUDIO_API_KEY;
      return { available: hasKey, message: hasKey ? "Fish Audio ready" : "FISH_AUDIO_API_KEY not set" };
    }),
});
