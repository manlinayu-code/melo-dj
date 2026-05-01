import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { search, song_url, song_detail, lyric, playlist_detail } from "@neteasecloudmusicapienhanced/api";

export const neteaseRouter = createRouter({
  search: publicQuery
    .input(z.object({
      keywords: z.string(),
      limit: z.number().optional().default(20),
      offset: z.number().optional().default(0),
      type: z.number().optional().default(1), // 1 = song
    }))
    .query(async ({ input }) => {
      const result = await search({
        keywords: input.keywords,
        limit: input.limit,
        offset: input.offset,
        type: input.type,
      });
      return result.body;
    }),

  songUrl: publicQuery
    .input(z.object({
      id: z.union([z.string(), z.number()]),
      br: z.union([z.string(), z.number()]).optional(),
    }))
    .query(async ({ input }) => {
      const result = await song_url({
        id: input.id,
        br: input.br,
      });
      return result.body;
    }),

  songDetail: publicQuery
    .input(z.object({
      ids: z.string(),
    }))
    .query(async ({ input }) => {
      const result = await song_detail({
        ids: input.ids,
      });
      return result.body;
    }),

  lyric: publicQuery
    .input(z.object({
      id: z.union([z.string(), z.number()]),
    }))
    .query(async ({ input }) => {
      const result = await lyric({
        id: input.id,
      });
      return result.body;
    }),

  playlist: publicQuery
    .input(z.object({
      id: z.union([z.string(), z.number()]),
    }))
    .query(async ({ input }) => {
      const result = await playlist_detail({
        id: input.id,
      });
      return result.body;
    }),
});
