import { createRouter, publicQuery } from "./middleware";
import { neteaseRouter } from "./routers/netease";
import { chatRouter } from "./routers/chat";
import { fishAudioRouter } from "./routers/fishAudio";
import { weatherRouter } from "./routers/weather";
import { playlistRouter } from "./routers/playlist";
import { ttsRouter } from "./routers/tts";
import { authRouter } from "./routers/auth";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  netease: neteaseRouter,
  chat: chatRouter,
  fishAudio: fishAudioRouter,
  weather: weatherRouter,
  playlist: playlistRouter,
  tts: ttsRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
