import { z } from "zod";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { trackSync, neteaseSessions } from "@db/schema";
import { eq, inArray } from "drizzle-orm";
import { gated } from "../lib/neteaseShared";

import { createRequire } from "module";
const require = createRequire(`${process.cwd()}/package.json`);
// @ts-ignore
const neteaseApi = require("@neteasecloudmusicapienhanced/api");

// =============================================================
// Router
// =============================================================

export const syncRouter = createRouter({
  // ---- Reverse sync: pull Netease liked list → mark local state ----
  reverseLikes: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { success: false, error: "no db", synced: 0 };

    // Get user's Netease session
    const sessionRows = await db
      .select({ cookie: neteaseSessions.cookie, neteaseUid: neteaseSessions.neteaseUid })
      .from(neteaseSessions)
      .where(eq(neteaseSessions.userId, ctx.user.userId))
      .limit(1);

    if (sessionRows.length === 0 || !sessionRows[0].cookie) {
      return { success: false, error: "未绑定网易云账号", synced: 0 };
    }

    const { cookie, neteaseUid } = sessionRows[0];
    if (!neteaseUid) {
      return { success: false, error: "无法获取网易云 UID", synced: 0 };
    }

    // Pull liked song IDs from Netease
    let likedIds: number[] = [];
    try {
      const body = await gated("sync/likelist", async () => {
        const r = await neteaseApi.likelist({ uid: neteaseUid, cookie });
        return r?.body;
      });
      const ids = body?.ids || [];
      likedIds = ids.map((id: any) => Number(id));
      console.log(`[sync/reverseLikes] pulled ${likedIds.length} liked tracks from Netease`);
    } catch (err) {
      console.error("[sync/reverseLikes] fetch likelist:", err);
      return { success: false, error: `获取喜欢列表失败: ${(err as Error).message}`, synced: 0 };
    }

    if (likedIds.length === 0) {
      return { success: true, synced: 0, message: "网易云喜欢列表为空" };
    }

    // Upsert into track_sync in batches (MySQL IN clause limit)
    const BATCH_SIZE = 500;
    const now = new Date();

    for (let i = 0; i < likedIds.length; i += BATCH_SIZE) {
      const batch = likedIds.slice(i, i + BATCH_SIZE);
      const values = batch.map((neteaseId) => ({
        neteaseId,
        neteaseLiked: true,
        meloFav: false,
        lastSyncedAt: now,
      }));

      try {
        await db
          .insert(trackSync)
          .values(values)
          .onConflictDoUpdate({
            target: [trackSync.neteaseId],
            set: {
              neteaseLiked: true,
              lastSyncedAt: now,
            },
          });
      } catch (err) {
        console.error(`[sync/reverseLikes] batch insert error:`, (err as Error).message);
      }
    }

    return { success: true, synced: likedIds.length, total: likedIds.length };
  }),

  // ---- Get sync state for specific neteaseIds ----
  getSyncState: authedQuery
    .input(z.object({ neteaseIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db || input.neteaseIds.length === 0) return { states: {} };

      const rows = await db
        .select({
          neteaseId: trackSync.neteaseId,
          neteaseLiked: trackSync.neteaseLiked,
          meloFav: trackSync.meloFav,
        })
        .from(trackSync)
        .where(inArray(trackSync.neteaseId, input.neteaseIds));

      const states: Record<number, { neteaseLiked: boolean; meloFav: boolean }> = {};
      for (const r of rows) {
        states[r.neteaseId] = {
          neteaseLiked: r.neteaseLiked || false,
          meloFav: r.meloFav || false,
        };
      }
      return { states };
    }),

  // ---- Mark a track as Melo DJ favorite (forward sync) ----
  markFav: authedQuery
    .input(z.object({ neteaseId: z.number(), fav: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) return { success: false };

      try {
        await db
          .insert(trackSync)
          .values({
            neteaseId: input.neteaseId,
            meloFav: input.fav,
            neteaseLiked: false,
          })
          .onConflictDoUpdate({
            target: [trackSync.neteaseId],
            set: { meloFav: input.fav },
          });
        return { success: true };
      } catch (err) {
        console.error("[sync/markFav] error:", (err as Error).message);
        return { success: false };
      }
    }),
});
