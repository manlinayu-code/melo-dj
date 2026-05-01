import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";

// @neteasecloudmusicapienhanced/api is a CommonJS package.
// Use require to avoid ESM/CJS interop issues.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const neteaseApi = require("@neteasecloudmusicapienhanced/api");

export const neteaseRouter = createRouter({
  search: publicQuery
    .input(
      z.object({
        keywords: z.string(),
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0),
        type: z.number().optional().default(1),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.search({
          keywords: input.keywords,
          limit: input.limit,
          offset: input.offset,
          type: input.type,
        });
        return (
          result?.body || {
            result: { songs: [], songCount: 0 },
            code: 200,
          }
        );
      } catch (err: any) {
        console.error("[netease/search] error:", err?.message || err);
        return { result: { songs: [], songCount: 0 }, code: 500 };
      }
    }),

  songUrl: publicQuery
    .input(
      z.object({
        id: z.union([z.string(), z.number()]),
        br: z.union([z.string(), z.number()]).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.song_url({
          id: input.id,
          br: input.br,
        });
        return result?.body || { data: [], code: 200 };
      } catch (err: any) {
        console.error("[netease/songUrl] error:", err?.message || err);
        return { data: [], code: 500 };
      }
    }),

  songDetail: publicQuery
    .input(z.object({ ids: z.string() }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.song_detail({ ids: input.ids });
        return result?.body || { songs: [], code: 200 };
      } catch (err: any) {
        console.error("[netease/songDetail] error:", err?.message || err);
        return { songs: [], code: 500 };
      }
    }),

  lyric: publicQuery
    .input(z.object({ id: z.union([z.string(), z.number()]) }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.lyric({ id: input.id });
        return result?.body || { code: 200 };
      } catch (err: any) {
        console.error("[netease/lyric] error:", err?.message || err);
        return { code: 500 };
      }
    }),

  playlist: publicQuery
    .input(z.object({ id: z.union([z.string(), z.number()]) }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.playlist_detail({
          id: input.id,
        });
        return (
          result?.body || {
            playlist: { tracks: [], name: "" },
            code: 200,
          }
        );
      } catch (err: any) {
        console.error("[netease/playlist] error:", err?.message || err);
        return { playlist: { tracks: [] }, code: 500 };
      }
    }),

  // User playlist analysis
  userPlaylists: publicQuery
    .input(z.object({ uid: z.union([z.string(), z.number()]) }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.user_playlist({
          uid: input.uid,
          limit: 50,
        });
        return result?.body || { playlist: [], code: 200 };
      } catch (err: any) {
        console.error("[netease/userPlaylists] error:", err?.message || err);
        return { playlist: [], code: 500 };
      }
    }),
});
