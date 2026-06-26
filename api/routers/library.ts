import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { localTracks } from "@db/schema";
import { eq } from "drizzle-orm";
import { gated } from "../lib/neteaseShared";
import { inferMoodNames, tagTrack } from "./mood";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
// @ts-ignore
const neteaseApi = require("@neteasecloudmusicapienhanced/api");

// =============================================================
// Helpers
// =============================================================

/** Split comma-separated ID string into batches of max 500. */
function batchIds(ids: number[], size = 500): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}

/** Convert playlist genre tags to normalized genre list. */
function tagsToGenres(tags: string[]): string[] {
  return tags
    .filter((t) => t && t.trim())
    .map((t) => t.trim());
}

type NeteaseSong = {
  id: number;
  name: string;
  ar?: { id: number; name: string }[];
  al?: { id: number; name: string; picUrl?: string };
  dt?: number;
  pop?: number;
  publishTime?: number;
};

type NeteasePlaylist = {
  id: number;
  name: string;
  tags: string[];
  trackIds: { id: number }[];
  tracks: NeteaseSong[];
};

// =============================================================
// Router
// =============================================================

export const libraryRouter = createRouter({
  // ---- Import a playlist into the local library ----
  importPlaylist: authedQuery
    .input(
      z.object({
        playlistId: z.union([z.string(), z.number()]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) return { success: false, error: "no db", imported: 0 };

      // 1. Fetch playlist detail
      let playlist: NeteasePlaylist;
      try {
        const body = await gated("library/playlist_detail", async () => {
          const r = await neteaseApi.playlist_detail({ id: input.playlistId });
          return r?.body;
        });
        playlist = body?.playlist;
        if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
          return { success: false, error: "歌单不存在或为空", imported: 0 };
        }
      } catch (err) {
        console.error("[library/importPlaylist] fetch playlist:", err);
        return { success: false, error: `获取歌单失败: ${(err as Error).message}`, imported: 0 };
      }

      const playlistTags = playlist.tags || [];
      const genresFromTags = tagsToGenres(playlistTags);
      console.log(
        `[library/importPlaylist] "${playlist.name}" ${playlist.tracks.length} tracks, tags: [${genresFromTags.join(", ")}]`,
      );

      // 2. Batch song_detail for pop, publishTime enrichment
      const trackIds = playlist.tracks.map((t) => t.id);
      const enrichedMap = new Map<number, { pop?: number; publishTime?: number }>();

      for (const batch of batchIds(trackIds)) {
        try {
          const idsStr = batch.join(",");
          const body = await gated("library/song_detail", async () => {
            const r = await neteaseApi.song_detail({ ids: idsStr });
            return r?.body;
          });
          const songs: NeteaseSong[] = body?.songs || [];
          for (const s of songs) {
            enrichedMap.set(s.id, {
              pop: s.pop,
              publishTime: s.publishTime,
            });
          }
        } catch (err) {
          console.log(`[library/importPlaylist] song_detail batch failed: ${(err as Error).message}`);
          // Continue with next batch
        }
      }

      // 3. Insert / update into local_tracks
      let imported = 0;
      const moodPayloads: { neteaseId: number; genres: string[]; artist: string; durationSec: number }[] = [];

      for (const track of playlist.tracks) {
        const artistName = (track.ar && track.ar.length > 0) ? track.ar.map((a) => a.name).join(", ") : "未知";
        const durationSec = Math.floor((track.dt || 0) / 1000);
        const enriched = enrichedMap.get(track.id) || {};

        const genres = [...genresFromTags]; // playlist tags as genre proxy

        try {
          await db
            .insert(localTracks)
            .values({
              neteaseId: track.id,
              title: track.name,
              artist: artistName,
              album: track.al?.name || "",
              coverUrl: track.al?.picUrl || "",
              durationSec,
              genre: genres,
              pop: enriched.pop ?? null,
              publishTime: enriched.publishTime ?? null,
              sourcePlaylistId: playlist.id,
              sourcePlaylistName: playlist.name,
            })
            .onConflictDoUpdate({
              target: [localTracks.neteaseId],
              set: {
                title: track.name,
                artist: artistName,
                album: track.al?.name || "",
                coverUrl: track.al?.picUrl || "",
                durationSec,
                genre: genres,
                pop: enriched.pop ?? null,
                publishTime: enriched.publishTime ?? null,
                sourcePlaylistId: playlist.id,
                sourcePlaylistName: playlist.name,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              },
            });
          imported++;

          // Collect for mood auto-tagging
          moodPayloads.push({
            neteaseId: track.id,
            genres,
            artist: artistName,
            durationSec,
          });
        } catch (err) {
          console.error(`[library/importPlaylist] insert ${track.id}:`, (err as Error).message);
        }
      }

      // 4. Auto-tag moods (fire-and-forget pattern, but we await here since we want the result)
      let tagged = 0;
      for (const payload of moodPayloads) {
        const moodNames = inferMoodNames(payload.genres, payload.artist, payload.durationSec);
        if (moodNames.length > 0) {
          await tagTrack(payload.neteaseId, moodNames, db);
          tagged++;
        }
      }

      return {
        success: true,
        imported,
        tagged,
        playlistName: playlist.name,
        playlistTags: genresFromTags,
      };
    }),

  // ---- List enriched metadata for given neteaseIds ----
  getEnriched: publicQuery
    .input(z.object({ neteaseIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db || input.neteaseIds.length === 0) return { tracks: [] };
      const rows = await db
        .select()
        .from(localTracks)
        .where(sql`${localTracks.neteaseId} IN (${input.neteaseIds.join(",")})`);
      return {
        tracks: rows.map((r) => ({
          neteaseId: r.neteaseId,
          title: r.title,
          artist: r.artist,
          album: r.album,
          coverUrl: r.coverUrl,
          durationSec: r.durationSec,
          genre: r.genre || [],
          pop: r.pop,
          publishTime: r.publishTime,
          sourcePlaylistName: r.sourcePlaylistName,
        })),
      };
    }),

  // ---- List all tracks in the local library ----
  list: publicQuery
    .input(z.object({ limit: z.number().optional().default(50), offset: z.number().optional().default(0) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return { tracks: [], total: 0 };
      const rows = await db.select().from(localTracks).limit(input.limit).offset(input.offset);
      const [countRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(localTracks);
      return {
        tracks: rows.map((r) => ({
          neteaseId: r.neteaseId,
          title: r.title,
          artist: r.artist,
          album: r.album,
          coverUrl: r.coverUrl,
          durationSec: r.durationSec,
          genre: r.genre || [],
          pop: r.pop,
          sourcePlaylistName: r.sourcePlaylistName,
        })),
        total: Number(countRow?.count || 0),
      };
    }),

  // ---- Get stats about the local library ----
  stats: publicQuery.query(async () => {
    const db = getDb();
    if (!db) return { totalTracks: 0, totalPlaylists: 0 };
    const [trackCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(localTracks);
    const playlistRows = await db
      .selectDistinct({ playlistId: localTracks.sourcePlaylistId })
      .from(localTracks);
    return {
      totalTracks: Number(trackCount?.count || 0),
      totalPlaylists: playlistRows.length,
    };
  }),
});
