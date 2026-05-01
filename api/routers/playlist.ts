import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { playHistory } from "@db/schema";
import { eq, desc } from "drizzle-orm";

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
});
