import { createRouter, publicQuery } from "./middleware";
import { neteaseRouter } from "./routers/netease";
import { chatRouter } from "./routers/chat";
import { fishAudioRouter } from "./routers/fishAudio";
import { mimoTtsRouter } from "./routers/mimoTts";
import { weatherRouter } from "./routers/weather";
import { playlistRouter } from "./routers/playlist";
import { ttsRouter } from "./routers/tts";
import { authRouter } from "./routers/auth";
import { moodRouter } from "./routers/mood";
import { libraryRouter } from "./routers/library";
import { syncRouter } from "./routers/sync";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  netease: neteaseRouter,
  chat: chatRouter,
  fishAudio: fishAudioRouter,
  mimoTts: mimoTtsRouter,
  weather: weatherRouter,
  playlist: playlistRouter,
  tts: ttsRouter,
  auth: authRouter,
  mood: moodRouter,
  library: libraryRouter,
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;
