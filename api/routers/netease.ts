import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { neteaseSessions } from "@db/schema";
import { eq } from "drizzle-orm";

// @neteasecloudmusicapienhanced/api is a CommonJS package.
// @ts-ignore
const neteaseApi = require("@neteasecloudmusicapienhanced/api");

function getNeteaseCookie(userId?: number): string | undefined {
  if (!userId) return undefined;
  // NOTE: In production with async db, this should be awaited.
  // For now we return undefined and handle cookie via request params.
  return undefined;
}

export const neteaseRouter = createRouter({
  search: publicQuery
    .input(
      z.object({
        keywords: z.string(),
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0),
        type: z.number().optional().default(1),
        cookie: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.search({
          keywords: input.keywords,
          limit: input.limit,
          offset: input.offset,
          type: input.type,
          cookie: input.cookie,
        });
        return result?.body || { result: { songs: [], songCount: 0 }, code: 200 };
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
        cookie: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.song_url({
          id: input.id,
          br: input.br,
          cookie: input.cookie,
        });
        return result?.body || { data: [], code: 200 };
      } catch (err: any) {
        console.error("[netease/songUrl] error:", err?.message || err);
        return { data: [], code: 500 };
      }
    }),

  songDetail: publicQuery
    .input(z.object({ ids: z.string(), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.song_detail({ ids: input.ids, cookie: input.cookie });
        return result?.body || { songs: [], code: 200 };
      } catch (err: any) {
        console.error("[netease/songDetail] error:", err?.message || err);
        return { songs: [], code: 500 };
      }
    }),

  lyric: publicQuery
    .input(z.object({ id: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.lyric({ id: input.id, cookie: input.cookie });
        return result?.body || { code: 200 };
      } catch (err: any) {
        console.error("[netease/lyric] error:", err?.message || err);
        return { code: 500 };
      }
    }),

  playlist: publicQuery
    .input(z.object({ id: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.playlist_detail({ id: input.id, cookie: input.cookie });
        return result?.body || { playlist: { tracks: [], name: "" }, code: 200 };
      } catch (err: any) {
        console.error("[netease/playlist] error:", err?.message || err);
        return { playlist: { tracks: [] }, code: 500 };
      }
    }),

  userPlaylists: publicQuery
    .input(z.object({ uid: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const result = await neteaseApi.user_playlist({ uid: input.uid, limit: 50, cookie: input.cookie });
        return result?.body || { playlist: [], code: 200 };
      } catch (err: any) {
        console.error("[netease/userPlaylists] error:", err?.message || err);
        return { playlist: [], code: 500 };
      }
    }),

  loginPhone: authedQuery
    .input(z.object({ phone: z.string(), password: z.string(), countrycode: z.string().optional().default("86") }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await neteaseApi.login_cellphone({
          phone: input.phone,
          password: input.password,
          countrycode: input.countrycode,
        });
        const body = result?.body;
        if (!body || body.code !== 200) {
          return { success: false, error: body?.msg || "Login failed", profile: null };
        }

        // Save cookie to database
        const db = getDb();
        if (db) {
          const cookie = body.cookie || "";
          const profile = body.profile || {};
          await db.insert(neteaseSessions).values({
            userId: ctx.user.userId,
            cookie,
            neteaseUid: String(profile.userId || ""),
            nickname: profile.nickname || null,
            avatar: profile.avatarUrl || null,
            phone: input.phone,
          }).onDuplicateKeyUpdate({
            set: {
              cookie,
              neteaseUid: String(profile.userId || ""),
              nickname: profile.nickname || null,
              avatar: profile.avatarUrl || null,
              phone: input.phone,
              updatedAt: new Date(),
            },
          });
        }

        return {
          success: true,
          profile: {
            uid: profile.userId,
            nickname: profile.nickname,
            avatar: profile.avatarUrl,
          },
        };
      } catch (err: any) {
        console.error("[netease/loginPhone] error:", err?.message || err);
        return { success: false, error: err?.message || "Login failed", profile: null };
      }
    }),

  mySession: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { session: null };
    const rows = await db.select().from(neteaseSessions).where(eq(neteaseSessions.userId, ctx.user.userId)).limit(1);
    if (rows.length === 0) return { session: null };
    const s = rows[0];
    return {
      session: {
        nickname: s.nickname,
        avatar: s.avatar,
        neteaseUid: s.neteaseUid,
        phone: s.phone,
      },
    };
  }),

  logoutNetease: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { success: false };
    try {
      await db.delete(neteaseSessions).where(eq(neteaseSessions.userId, ctx.user.userId));
      return { success: true };
    } catch {
      return { success: false };
    }
  }),
});
