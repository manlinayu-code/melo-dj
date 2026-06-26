import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { playHistory, playQueue, userPreferences } from "@db/schema";
import { eq, desc, asc, and } from "drizzle-orm";

const queueItemSchema = z.object({
  trackId: z.string().optional(),
  neteaseId: z.number().optional(),
  trackTitle: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  sourceUrl: z.string().optional(),
  coverUrl: z.string().optional(),
  durationSec: z.number().optional(),
});

export const playlistRouter = createRouter({
  // Analyze user's music taste from their playlist data
  analyze: publicQuery
    .input(z.object({
      tracks: z.array(z.object({
        name: z.string(),
        artist: z.string(),
        genre: z.string().optional(),
        playCount: z.number().optional(),
      })).optional(),
    }))
    .query(({ input }) => {
      const tracks = input.tracks || [];
      const artistCounts: Record<string, number> = {};
      const genreCounts: Record<string, number> = {};
      const hourCounts: Record<number, number> = {};

      tracks.forEach((t) => {
        const artists = t.artist.split(/[,/、&]/).map((a) => a.trim());
        artists.forEach((a) => {
          artistCounts[a] = (artistCounts[a] || 0) + (t.playCount || 1);
        });
        if (t.genre) {
          const genres = t.genre.split(/[,/、 ]/);
          genres.forEach((g) => {
            if (g.trim()) genreCounts[g.trim()] = (genreCounts[g.trim()] || 0) + 1;
          });
        }
      });

      const topArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }));

      const totalPlays = tracks.reduce((sum, t) => sum + (t.playCount || 1), 0);
      const diversity = tracks.length > 0 ? Object.keys(artistCounts).length / tracks.length : 0;

      const timeProfile = {
        nightOwl: hourCounts[0] + hourCounts[1] + hourCounts[2] + hourCounts[3] || 0,
        morning: hourCounts[7] + hourCounts[8] + hourCounts[9] || 0,
        afternoon: hourCounts[13] + hourCounts[14] + hourCounts[15] || 0,
        evening: hourCounts[19] + hourCounts[20] + hourCounts[21] || 0,
      };

      const dominantTime = Object.entries(timeProfile)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'evening';

      const energyGenres = ['rock', 'electronic', 'hip-hop', 'metal', 'dance', 'edm', 'trap'];
      const chillGenres = ['classical', 'jazz', 'ambient', 'lo-fi', 'folk', 'acoustic', 'piano'];

      let energy = 0.5;
      topGenres.forEach((g) => {
        if (energyGenres.some((eg) => g.name.toLowerCase().includes(eg))) energy += 0.1;
        if (chillGenres.some((cg) => g.name.toLowerCase().includes(cg))) energy -= 0.1;
      });
      energy = Math.max(0, Math.min(1, energy));

      return {
        topArtists,
        topGenres,
        totalTracks: tracks.length,
        totalPlays,
        diversity: Math.round(diversity * 100) / 100,
        dominantTime,
        energy: Math.round(energy * 100) / 100,
        tasteProfile: {
          exploratory: diversity > 0.3 ? 'high' : diversity > 0.15 ? 'medium' : 'low',
          loyalty: topArtists[0]?.count / (totalPlays || 1) > 0.2 ? 'high' : 'medium',
          nocturnal: dominantTime === 'nightOwl',
        },
      };
    }),

  savePlay: authedQuery
    .input(
      z.object({
        songId: z.string(),
        title: z.string(),
        artist: z.string(),
        album: z.string().optional(),
        cover: z.string().optional(),
        duration: z.number().optional(),
        completed: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { success: false };
      try {
        await db.insert(playHistory).values({
          userId: ctx.user.userId,
          songId: input.songId,
          title: input.title,
          artist: input.artist,
          album: input.album || null,
          cover: input.cover || null,
          duration: input.duration || null,
          completed: input.completed ?? false,
        });
        return { success: true };
      } catch (err) {
        console.error("[playlist/savePlay] error:", err);
        return { success: false };
      }
    }),

  history: authedQuery
    .input(z.object({ limit: z.number().optional().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { history: [] };
      const rows = await db
        .select()
        .from(playHistory)
        .where(eq(playHistory.userId, ctx.user.userId))
        .orderBy(desc(playHistory.playedAt))
        .limit(input.limit);
      return {
        history: rows.map((r) => ({
          id: r.id,
          songId: r.songId,
          title: r.title,
          artist: r.artist,
          album: r.album,
          cover: r.cover,
          duration: r.duration,
          playedAt: new Date(r.playedAt).getTime(),
          completed: r.completed,
        })),
      };
    }),

  // Alias for clarity — same shape as `history`
  getHistory: authedQuery
    .input(z.object({ limit: z.number().min(1).max(200).optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { history: [] };
      const rows = await db
        .select()
        .from(playHistory)
        .where(eq(playHistory.userId, ctx.user.userId))
        .orderBy(desc(playHistory.playedAt))
        .limit(input.limit);
      return {
        history: rows.map((r) => ({
          id: r.id,
          songId: r.songId,
          title: r.title,
          artist: r.artist,
          album: r.album,
          cover: r.cover,
          duration: r.duration,
          playedAt: new Date(r.playedAt).getTime(),
          completed: r.completed,
        })),
      };
    }),

  // Naive genre derivation: artist as proxy. Real genre data is a follow-up.
  topGenres: authedQuery
    .input(z.object({ limit: z.number().min(1).max(50).optional().default(8) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { topGenres: [], topArtists: [] };
      const rows = await db
        .select()
        .from(playHistory)
        .where(eq(playHistory.userId, ctx.user.userId))
        .orderBy(desc(playHistory.playedAt))
        .limit(500);
      const artistCounts: Record<string, number> = {};
      rows.forEach((r) => {
        const parts = (r.artist || "").split(/[,/、&]/).map((a) => a.trim()).filter(Boolean);
        parts.forEach((a) => {
          artistCounts[a] = (artistCounts[a] || 0) + 1;
        });
      });
      const topArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, input.limit)
        .map(([name, count]) => ({ name, count }));
      // Genre proxy === top artists for now
      return { topGenres: topArtists, topArtists };
    }),

  getQueue: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { queue: [] };
    const rows = await db
      .select()
      .from(playQueue)
      .where(eq(playQueue.userId, ctx.user.userId))
      .orderBy(asc(playQueue.position));
    return {
      queue: rows.map((r) => ({
        id: r.id,
        position: r.position,
        trackId: r.trackId,
        neteaseId: r.neteaseId,
        trackTitle: r.trackTitle,
        artist: r.artist,
        album: r.album,
        sourceUrl: r.sourceUrl,
        coverUrl: r.coverUrl,
        durationSec: r.durationSec,
        addedAt: r.addedAt instanceof Date ? r.addedAt.getTime() : Number(r.addedAt),
      })),
    };
  }),

  setQueue: authedQuery
    .input(z.object({ items: z.array(queueItemSchema) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { success: false };
      try {
        await db.delete(playQueue).where(eq(playQueue.userId, ctx.user.userId));
        if (input.items.length > 0) {
          await db.insert(playQueue).values(
            input.items.map((it, i) => ({
              userId: ctx.user.userId,
              position: i,
              trackId: it.trackId || null,
              neteaseId: it.neteaseId ?? null,
              trackTitle: it.trackTitle,
              artist: it.artist,
              album: it.album || null,
              sourceUrl: it.sourceUrl || null,
              coverUrl: it.coverUrl || null,
              durationSec: it.durationSec ?? null,
            }))
          );
        }
        return { success: true, count: input.items.length };
      } catch (err) {
        console.error("[playlist/setQueue] error:", err);
        return { success: false };
      }
    }),

  reorderQueue: authedQuery
    .input(z.object({ fromIndex: z.number().int().min(0), toIndex: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { success: false };
      if (input.fromIndex === input.toIndex) return { success: true };
      try {
        const rows = await db
          .select()
          .from(playQueue)
          .where(eq(playQueue.userId, ctx.user.userId))
          .orderBy(asc(playQueue.position));
        if (
          input.fromIndex >= rows.length ||
          input.toIndex >= rows.length ||
          input.fromIndex < 0 ||
          input.toIndex < 0
        ) {
          return { success: false, error: "Index out of range" };
        }
        const reordered = [...rows];
        const [moved] = reordered.splice(input.fromIndex, 1);
        reordered.splice(input.toIndex, 0, moved);
        for (let i = 0; i < reordered.length; i++) {
          await db
            .update(playQueue)
            .set({ position: i })
            .where(and(eq(playQueue.id, reordered[i].id), eq(playQueue.userId, ctx.user.userId)));
        }
        return { success: true };
      } catch (err) {
        console.error("[playlist/reorderQueue] error:", err);
        return { success: false };
      }
    }),

  getPreferences: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { preferences: null };
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, ctx.user.userId))
      .limit(1);
    if (rows.length === 0) {
      return {
        preferences: {
          moodDefault: "Chill",
          intensityDefault: 0.5,
          language: "zh",
          ttsVoice: null,
          ttsProvider: "auto",
          theme: "dark",
          radioMode: false,
          genres: [],
          artists: [],
          moods: [],
        },
      };
    }
    const r = rows[0];
    return {
      preferences: {
        moodDefault: r.moodPreset || "Chill",
        intensityDefault: r.intensity ?? 0.5,
        language: r.language || "zh",
        ttsVoice: r.ttsVoice || null,
        ttsProvider: r.ttsProvider || "auto",
        theme: r.theme || "dark",
        radioMode: r.radioMode ?? false,
        genres: r.genres || [],
        artists: r.artists || [],
        moods: r.moods || [],
      },
    };
  }),

  setPreferences: authedQuery
    .input(
      z.object({
        moodDefault: z.string().max(32).optional(),
        intensityDefault: z.number().min(0).max(1).optional(),
        language: z.string().max(8).optional(),
        ttsVoice: z.string().max(64).nullable().optional(),
        ttsProvider: z.enum(["auto", "mimo", "fish", "browser"]).optional(),
        theme: z.string().max(16).optional(),
        radioMode: z.boolean().optional(),
        genres: z.array(z.string()).optional(),
        artists: z.array(z.string()).optional(),
        moods: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { success: false };
      try {
        const existing = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, ctx.user.userId))
          .limit(1);

        const values: Record<string, unknown> = {};
        if (input.moodDefault !== undefined) values.moodPreset = input.moodDefault;
        if (input.intensityDefault !== undefined) values.intensity = input.intensityDefault;
        if (input.language !== undefined) values.language = input.language;
        if (input.ttsVoice !== undefined) values.ttsVoice = input.ttsVoice;
        if (input.ttsProvider !== undefined) values.ttsProvider = input.ttsProvider;
        if (input.theme !== undefined) values.theme = input.theme;
        if (input.radioMode !== undefined) values.radioMode = input.radioMode;
        if (input.genres !== undefined) values.genres = input.genres;
        if (input.artists !== undefined) values.artists = input.artists;
        if (input.moods !== undefined) values.moods = input.moods;

        if (existing.length > 0) {
          await db
            .update(userPreferences)
            .set(values)
            .where(eq(userPreferences.userId, ctx.user.userId));
        } else {
          await db.insert(userPreferences).values({
            userId: ctx.user.userId,
            ...values,
          });
        }
        return { success: true };
      } catch (err) {
        console.error("[playlist/setPreferences] error:", err);
        return { success: false };
      }
    }),
});
