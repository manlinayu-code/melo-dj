import { createRouter, publicQuery } from "../middleware";

export const ttsRouter = createRouter({
  // Return voice settings for browser TTS
  settings: publicQuery
    .query(() => {
      return {
        voice: {
          name: "Melo DJ Voice",
          lang: "zh-CN",
          pitch: 0.9,
          rate: 0.95,
        },
      };
    }),
});
