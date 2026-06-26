import cron from "node-cron";
import { getDb } from "../queries/connection";
import { neteaseSessions, trackSync } from "@db/schema";
import { eq } from "drizzle-orm";
import { gated } from "./neteaseShared";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// @ts-ignore
const neteaseApi = require("@neteasecloudmusicapienhanced/api");

// =============================================================
// Single-user reverse sync
// =============================================================

async function syncUserLikes(userId: number): Promise<{ synced: number; error?: string }> {
  const db = getDb();
  if (!db) return { synced: 0, error: "no db" };

  // Get user's Netease session
  const sessionRows = await db
    .select({ cookie: neteaseSessions.cookie, neteaseUid: neteaseSessions.neteaseUid })
    .from(neteaseSessions)
    .where(eq(neteaseSessions.userId, userId))
    .limit(1);

  if (sessionRows.length === 0 || !sessionRows[0].cookie) {
    return { synced: 0, error: "未绑定网易云账号" };
  }

  const { cookie, neteaseUid } = sessionRows[0];
  if (!neteaseUid) {
    return { synced: 0, error: "无法获取网易云 UID" };
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
  } catch (err) {
    return { synced: 0, error: `获取喜欢列表失败: ${(err as Error).message}` };
  }

  if (likedIds.length === 0) {
    return { synced: 0 };
  }

  // Batch upsert into track_sync
  const now = new Date();
  const BATCH_SIZE = 500;

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
      console.error(`[sync/cron] batch insert error for user ${userId}:`, (err as Error).message);
    }
  }

  return { synced: likedIds.length };
}

// =============================================================
// All-user sync
// =============================================================

async function syncAllUsers(): Promise<{
  users: number;
  tracks: number;
  errors: number;
  durationMs: number;
}> {
  const db = getDb();
  if (!db) {
    console.log("[sync/cron] No DB connection, skipping sync");
    return { users: 0, tracks: 0, errors: 0, durationMs: 0 };
  }

  const startedAt = Date.now();

  // Find all users who have bound Netease
  const sessions = await db
    .select({ userId: neteaseSessions.userId })
    .from(neteaseSessions);

  if (sessions.length === 0) {
    console.log("[sync/cron] No users with Netease sessions, skipping");
    return { users: 0, tracks: 0, errors: 0, durationMs: Date.now() - startedAt };
  }

  let totalTracks = 0;
  let totalErrors = 0;

  for (const { userId } of sessions) {
    try {
      const result = await syncUserLikes(userId);
      totalTracks += result.synced;
      if (result.error) {
        totalErrors++;
        console.warn(`[sync/cron] user ${userId}: ${result.error}`);
      }
    } catch (err) {
      totalErrors++;
      console.error(`[sync/cron] user ${userId} unexpected error:`, (err as Error).message);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[sync/cron] done in ${(durationMs / 1000).toFixed(1)}s | users=${sessions.length} | tracks=${totalTracks} | errors=${totalErrors}`
  );

  return { users: sessions.length, tracks: totalTracks, errors: totalErrors, durationMs };
}

// =============================================================
// Cron scheduler
// =============================================================

let cronTask: cron.ScheduledTask | null = null;
let isRunning = false;

export function startCron(): void {
  const intervalMin = parseInt(process.env.SYNC_CRON_INTERVAL || "30", 10);
  if (intervalMin <= 0) {
    console.log("[sync/cron] SYNC_CRON_INTERVAL=0, cron disabled");
    return;
  }

  // node-cron: every N minutes
  const cronExpr = `*/${intervalMin} * * * *`;
  console.log(`[sync/cron] Starting cron: every ${intervalMin} min (${cronExpr})`);

  cronTask = cron.schedule(cronExpr, async () => {
    if (isRunning) {
      console.log("[sync/cron] Previous sync still running, skipping this tick");
      return;
    }

    isRunning = true;
    try {
      await syncAllUsers();
    } catch (err) {
      console.error("[sync/cron] syncAllUsers crashed:", (err as Error).message);
    } finally {
      isRunning = false;
    }
  });
}

export function stopCron(): void {
  if (cronTask) {
    cronTask.stop();
    console.log("[sync/cron] Cron stopped");
    cronTask = null;
  }
}
