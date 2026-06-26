import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { moods, trackMoods } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";
import { analyzeLyricSentiment, sentimentToMoods } from "../lib/lyricSentiment";

// =============================================================
// Genre → Mood mapping rules
// =============================================================
const GENRE_MOOD_MAP: Record<string, string[]> = {
  // Calm — slow, ambient, atmospheric
  ambient: ["Calm"],
  "new age": ["Calm"],
  soundtrack: ["Calm"],
  "post-rock": ["Calm"],
  drone: ["Calm"],

  // Chill — relaxed, groovy, after-hours
  jazz: ["Chill"],
  blues: ["Chill"],
  soul: ["Chill"],
  "r&b": ["Chill"],
  lofi: ["Chill"],
  indie: ["Chill"],
  acoustic: ["Chill"],
  "bossa nova": ["Chill"],
  reggae: ["Chill"],
  "trip-hop": ["Chill"],
  downtempo: ["Chill"],

  // Energetic — upbeat, high BPM, driving
  rock: ["Energetic"],
  metal: ["Energetic"],
  punk: ["Energetic"],
  electronic: ["Energetic"],
  house: ["Energetic"],
  dance: ["Energetic"],
  edm: ["Energetic"],
  pop: ["Energetic"],
  "hip-hop": ["Energetic"],
  "hip hop": ["Energetic"],
  rap: ["Energetic"],
  "drum and bass": ["Energetic"],
  techno: ["Energetic"],
  trance: ["Energetic"],
  "dance-pop": ["Energetic"],
  "k-pop": ["Energetic"],
  "j-pop": ["Energetic"],
  funk: ["Energetic"],
  disco: ["Energetic"],
  latin: ["Energetic"],
  afrobeat: ["Energetic"],

  // Heartbreak — emotional, slow, narrative
  ballad: ["Heartbreak"],
  "singer-songwriter": ["Heartbreak"],
  folk: ["Heartbreak", "Chill"],
  "alt-country": ["Heartbreak"],
  emo: ["Heartbreak"],
  "dream pop": ["Heartbreak"],
  shoegaze: ["Heartbreak"],
  slowcore: ["Heartbreak"],

  // Focus — instrumental, minimal, classical
  classical: ["Focus", "Calm"],
  piano: ["Focus", "Calm"],
  instrumental: ["Focus"],
  minimal: ["Focus"],
  "study music": ["Focus"],
};

function normalizeGenre(g: string): string {
  return g.toLowerCase().trim().replace(/\s+/g, " ");
}

export function inferMoodNames(genres: string[], artist?: string, durationSec?: number, bpm?: number): string[] {
  const moodSet = new Set<string>();

  // Signal 1: Genre mapping
  for (const g of genres) {
    const key = normalizeGenre(g);
    if (key === "search") continue; // skip placeholder
    const mapped = GENRE_MOOD_MAP[key];
    if (mapped) {
      for (const m of mapped) moodSet.add(m);
    }
  }

  // Signal 2: Duration hints (fallback when genre is unknown)
  if (moodSet.size === 0 && durationSec && durationSec > 0) {
    if (durationSec > 420) {
      // > 7 min: likely ambient, classical, or epic — suggest Calm or Focus
      moodSet.add("Calm");
      moodSet.add("Focus");
    } else if (durationSec < 120) {
      // < 2 min: interlude, punk, or lo-fi — too ambiguous to tag reliably
      // leave empty
    }
    // 2-7 min: most common range, no duration-based inference
  }

  // Signal 3: BPM (strongest physical signal, can override or refine)
  if (bpm && bpm > 0) {
    if (bpm > 140) {
      // Fast = high energy, almost always Energetic
      moodSet.add("Energetic");
    } else if (bpm < 75) {
      // Slow = could be Calm, Chill, or Heartbreak
      if (moodSet.size === 0) {
        moodSet.add("Calm");
        moodSet.add("Chill");
        moodSet.add("Heartbreak");
      }
      // If genre already assigned, slow BPM confirms but doesn't override
    }
    // 75-140 BPM: mid-tempo, BPM doesn't strongly indicate a single mood
  }

  return Array.from(moodSet);
}

export async function tagTrack(neteaseId: number, moodNames: string[], db: ReturnType<typeof getDb>) {
  if (!db || moodNames.length === 0) return;
  try {
    // Resolve mood names to IDs
    const moodRows = await db
      .select({ id: moods.id, name: moods.name })
      .from(moods);
    const nameToId = new Map(moodRows.map((r) => [r.name, r.id]));

    for (const moodName of moodNames) {
      const moodId = nameToId.get(moodName);
      if (!moodId) continue;
      await db
        .insert(trackMoods)
        .values({ neteaseId, moodId, confidence: 1.0 })
        .onConflictDoUpdate({
          target: [trackMoods.neteaseId, trackMoods.moodId],
          set: { confidence: sql`GREATEST(track_moods.confidence, 1.0)` },
        });
    }
  } catch (err) {
    console.error(`[mood] tagTrack ${neteaseId} error:`, (err as Error).message);
  }
}

// =============================================================
// Router
// =============================================================
export const moodRouter = createRouter({
  // ---- List all moods ----
  list: publicQuery.query(async () => {
    const db = getDb();
    if (!db) return { moods: [] as any[] };
    const rows = await db.select().from(moods).orderBy(moods.id);
    return {
      moods: rows.map((r) => ({
        id: r.id,
        name: r.name,
        nameZh: r.nameZh,
        description: r.description,
        icon: r.icon,
        color: r.color,
      })),
    };
  }),

  // ---- Auto-tag a batch of tracks by neteaseId ----
  autoTag: publicQuery
    .input(
      z.object({
        tracks: z.array(
          z.object({
            neteaseId: z.number(),
            genres: z.array(z.string()).optional().default([]),
            artist: z.string().optional(),
            durationSec: z.number().optional(),
            bpm: z.number().optional(),
            lyrics: z.string().optional(),
          }),
        ),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return { tagged: 0 };
      let count = 0;
      for (const track of input.tracks) {
        if (!track.neteaseId) continue;
        // Signal 1-3: genre + duration + BPM
        const signalMoods = inferMoodNames(track.genres || [], track.artist, track.durationSec, track.bpm);

        // Signal 4: Lyric sentiment (if lyrics provided)
        let sentimentMoods: string[] = [];
        if (track.lyrics) {
          const sentiment = analyzeLyricSentiment(track.lyrics);
          sentimentMoods = sentimentToMoods(sentiment);
          if (sentiment.dominant) {
            console.log(
              `[mood/autoTag] neteaseId=${track.neteaseId} lyric sentiment: ${sentiment.dominant} (score=${sentiment.score.toFixed(2)}, counts=(${sentiment.counts.happy},${sentiment.counts.sad},${sentiment.counts.angry},${sentiment.counts.romantic})) → [${sentimentMoods.join(", ")}]`,
            );
          }
        }

        // Merge: signals + sentiment, deduplicate
        const mergedMoods = [...new Set([...signalMoods, ...sentimentMoods])];
        if (mergedMoods.length === 0) continue;
        await tagTrack(track.neteaseId, mergedMoods, db);
        count++;
      }
      return { tagged: count };
    }),

  // ---- Get moods for a specific track ----
  forTrack: publicQuery
    .input(
      z.object({
        neteaseId: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return { moods: [] as any[] };
      const rows = await db
        .select({
          id: moods.id,
          name: moods.name,
          nameZh: moods.nameZh,
          icon: moods.icon,
          color: moods.color,
        })
        .from(trackMoods)
        .innerJoin(moods, eq(trackMoods.moodId, moods.id))
        .where(eq(trackMoods.neteaseId, input.neteaseId));
      return { moods: rows };
    }),

  // ---- Batch get moods for multiple tracks ----
  forTracks: publicQuery
    .input(
      z.object({
        neteaseIds: z.array(z.number()),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return { moods: [] as any[] };
      if (input.neteaseIds.length === 0) return { moods: [] };
      const rows = await db
        .select({
          neteaseId: trackMoods.neteaseId,
          id: moods.id,
          name: moods.name,
          nameZh: moods.nameZh,
          icon: moods.icon,
          color: moods.color,
        })
        .from(trackMoods)
        .innerJoin(moods, eq(trackMoods.moodId, moods.id))
        .where(sql`${trackMoods.neteaseId} IN (${input.neteaseIds.join(",")})`);
      return { moods: rows };
    }),

  // ---- Get tracks by mood ----
  tracksByMood: publicQuery
    .input(
      z.object({
        moodName: z.string(),
        limit: z.number().optional().default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return { neteaseIds: [] as number[] };
      const rows = await db
        .select({ neteaseId: trackMoods.neteaseId })
        .from(trackMoods)
        .innerJoin(moods, eq(trackMoods.moodId, moods.id))
        .where(eq(moods.name, input.moodName))
        .orderBy(sql`RAND()`)
        .limit(input.limit);
      return {
        neteaseIds: rows.map((r) => r.neteaseId),
      };
    }),
});
