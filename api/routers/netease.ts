import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { neteaseSessions } from "@db/schema";
import { eq } from "drizzle-orm";
import { createRequire } from "module";

// @neteasecloudmusicapienhanced/api is a CommonJS package.
const require = createRequire(`${process.cwd()}/package.json`);
// @ts-ignore
const neteaseApi = require("@neteasecloudmusicapienhanced/api");

// =============================================================
// GD Studio Music API — public multi-source aggregator
// Docs: https://music-api.gdstudio.xyz/api.php
// Rate limit: 50 req / 5 min. Stable sources: netease, kuwo, joox, bilibili.
// =============================================================
const GD_API_BASE = "https://music-api.gdstudio.xyz/api.php";

interface GdSearchItem {
  id: string;
  name: string;
  artist: string[];
  album: string;
  pic_id: string;
  url_id: string;
  lyric_id: string;
  source: string;
  from: string;
}

async function gdSearch(keywords: string, count = 20): Promise<GdSearchItem[]> {
  const url = `${GD_API_BASE}?types=search&source=netease&name=${encodeURIComponent(keywords)}&count=${count}`;
  console.log(`[gd] search: "${keywords}"`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as GdSearchItem[];
  } catch (err) {
    console.log(`[gd] search failed: ${(err as Error).message}`);
    return [];
  }
}

async function gdSongUrl(source: string, id: string, br = 320): Promise<string | null> {
  const url = `${GD_API_BASE}?types=url&source=${source}&id=${id}&br=${br}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

async function gdLyric(source: string, id: string): Promise<string | null> {
  const url = `${GD_API_BASE}?types=lyric&source=${source}&id=${id}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.lyric || null;
  } catch {
    return null;
  }
}

// =============================================================
// Rate limiter — rolling-window, max 10 requests / 1000 ms across
// all callers of this server process. Keeps us from being banned.
// =============================================================
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 1000;
const rateWindow: number[] = [];

async function rateLimitGate(): Promise<void> {
  while (true) {
    const now = Date.now();
    while (rateWindow.length > 0 && now - rateWindow[0] > RATE_LIMIT_WINDOW_MS) {
      rateWindow.shift();
    }
    if (rateWindow.length < RATE_LIMIT_MAX) {
      rateWindow.push(now);
      return;
    }
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - rateWindow[0]) + 5;
    await new Promise((r) => setTimeout(r, Math.max(20, waitMs)));
  }
}

// =============================================================
// withTimeout: wraps a promise in a 5s AbortController-style race.
// Used because @neteasecloudmusicapienhanced/api does not expose
// an AbortSignal hook; we still bound wait time on the caller side.
// =============================================================
const DEFAULT_TIMEOUT_MS = 5000;

async function withTimeout<T>(p: Promise<T>, ms = DEFAULT_TIMEOUT_MS, label = "netease"): Promise<T> {
  return await Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[${label}] timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function gated<T>(label: string, fn: () => Promise<T>): Promise<T> {
  await rateLimitGate();
  return await withTimeout(fn(), DEFAULT_TIMEOUT_MS, label);
}

// =============================================================
// Types
// =============================================================
type NeteaseSong = {
  id: number;
  name: string;
  artists?: { id: number; name: string }[];
  ar?: { id: number; name: string }[];
  album?: { id: number; name: string; picUrl?: string };
  al?: { id: number; name: string; picUrl?: string };
  duration?: number;
  dt?: number;
};

export type ParsedLyricLine = { time: number; text: string };

// =============================================================
// Helpers
// =============================================================
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\(\)（）\[\]【】《》"'`~!@#\$%\^&\*\-_=+,.:;?/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(candidate: string, target: string): boolean {
  const c = normalize(candidate);
  const t = normalize(target);
  if (!c || !t) return false;
  return c.includes(t) || t.includes(c);
}

function pickArtistName(song: NeteaseSong): string {
  const arr = song.artists || song.ar || [];
  return arr[0]?.name || "";
}

async function neteaseSearch(keywords: string, type: number, limit: number, cookie?: string) {
  return gated("netease/search", async () => {
    const result = await neteaseApi.search({ keywords, type, limit, offset: 0, cookie });
    return result?.body;
  });
}

async function neteaseSongUrlV1(id: string | number, level: string, cookie?: string) {
  return gated("netease/song_url_v1", async () => {
    const fn = neteaseApi.song_url_v1 || neteaseApi.song_url;
    const result = await fn({ id, level, cookie });
    return result?.body;
  });
}

async function neteaseSongUrlBr(id: string | number, br: number, cookie?: string) {
  return gated("netease/song_url", async () => {
    const result = await neteaseApi.song_url({ id, br, cookie });
    return result?.body;
  });
}

async function neteaseLyric(id: string | number, cookie?: string) {
  return gated("netease/lyric", async () => {
    const result = await neteaseApi.lyric({ id, cookie });
    return result?.body;
  });
}

// =============================================================
// LRC parsing — tolerant to [mm:ss], [mm:ss.x], [mm:ss.xx], [mm:ss.xxx]
// Skip metadata-only tags. Skip blank text lines.
// =============================================================
const META_TAGS = new Set(["ar", "ti", "al", "by", "offset", "re", "ve", "au", "length"]);
const TIME_TAG_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG_RE = /^\[([a-zA-Z]+):([^\]]*)\]\s*$/;

export function parseLrc(raw: string): ParsedLyricLine[] {
  if (!raw || typeof raw !== "string") return [];
  const lines = raw.split(/\r?\n/);
  const out: ParsedLyricLine[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const metaMatch = line.match(META_TAG_RE);
    if (metaMatch && META_TAGS.has(metaMatch[1].toLowerCase())) continue;

    TIME_TAG_RE.lastIndex = 0;
    const tags: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = TIME_TAG_RE.exec(line)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] || "0";
      const frac = parseInt(fracStr.padEnd(3, "0").slice(0, 3), 10);
      const ms = (min * 60 + sec) * 1000 + frac;
      tags.push(ms);
    }
    if (tags.length === 0) continue;

    const text = line.replace(TIME_TAG_RE, "").trim();
    if (!text) continue;

    for (const t of tags) out.push({ time: t, text });
  }

  out.sort((a, b) => a.time - b.time);
  return out;
}

// =============================================================
// Strategies
// =============================================================
async function searchTrackImpl(
  title: string,
  artist: string | undefined,
  cookie: string | undefined,
): Promise<NeteaseSong | null> {
  // (a) "title artist" exact-ish, type=1 single
  const queryA = artist ? `${title} ${artist}` : title;
  console.log(`[netease] searchTrack: strategy A "${queryA}"`);
  try {
    const a = await neteaseSearch(queryA, 1, 10, cookie);
    const songs: NeteaseSong[] = a?.result?.songs || [];
    if (songs.length > 0) {
      // Prefer fuzzy artist match if artist provided
      if (artist) {
        const matched = songs.find((s) => fuzzyMatch(pickArtistName(s), artist));
        if (matched) return matched;
      }
      return songs[0];
    }
  } catch (err) {
    console.log(`[netease] strategy A failed: ${(err as Error).message}`);
  }

  // (b) fuzzy: title only
  console.log(`[netease] searchTrack: strategy B "${title}"`);
  try {
    const b = await neteaseSearch(title, 1, 20, cookie);
    const songs: NeteaseSong[] = b?.result?.songs || [];
    if (songs.length > 0) {
      if (artist) {
        const matched = songs.find((s) => fuzzyMatch(pickArtistName(s), artist));
        if (matched) return matched;
      }
      return songs[0];
    }
  } catch (err) {
    console.log(`[netease] strategy B failed: ${(err as Error).message}`);
  }

  // (c) artist top tracks via artist search
  if (artist) {
    console.log(`[netease] searchTrack: strategy C artist="${artist}"`);
    try {
      const c = await neteaseSearch(artist, 100, 10, cookie); // type=100: artists
      const artists = c?.result?.artists || [];
      const artistId = artists[0]?.id;
      if (artistId) {
        const more = await gated("netease/artists", async () => {
          const fn = neteaseApi.artist_top_song || neteaseApi.artists;
          if (!fn) return null;
          const r = await fn({ id: artistId, cookie });
          return r?.body;
        });
        const songs: NeteaseSong[] = more?.songs || more?.hotSongs || [];
        const matched = songs.find((s) => fuzzyMatch(s.name, title));
        if (matched) return matched;
      }
    } catch (err) {
      console.log(`[netease] strategy C failed: ${(err as Error).message}`);
    }
  }

  // (d) GD Studio API fallback — multi-source aggregator
  console.log(`[gd] searchTrack: strategy D "${title}" / "${artist || ""}"`);
  try {
    const gdItems = await gdSearch(title, 20);
    if (gdItems.length > 0) {
      let best: GdSearchItem | undefined;
      if (artist) {
        best = gdItems.find((item) =>
          item.artist.some((a) => fuzzyMatch(a, artist)),
        );
      }
      if (!best) best = gdItems[0];
      console.log(`[gd] searchTrack: matched "${best.name}" by ${best.artist.join("/")}`);
      const dSong: NeteaseSong = {
        id: parseInt(best.id, 10) || 0,
        name: best.name,
        ar: best.artist.map((a) => ({ id: 0, name: a })),
        al: { id: 0, name: best.album, picUrl: best.pic_id ? `${GD_API_BASE}?types=pic&source=netease&id=${best.pic_id}&size=500` : "" },
        dt: 0,
      };
      return dSong;
    }
  } catch (err) {
    console.log(`[gd] searchTrack: strategy D failed: ${(err as Error).message}`);
  }

  console.log(`[netease] searchTrack: no result for "${title}" / "${artist || ""}"`);
  return null;
}

async function getPlayUrlImpl(
  songId: string | number,
  cookie: string | undefined,
): Promise<{ url: string | null; br?: number; size?: number; level?: string }> {
  // Bitrate fallback ladder: lossless → 320 → 192 → default.
  const bitrates: number[] = [999000, 320000, 192000];
  for (const br of bitrates) {
    try {
      const body = await neteaseSongUrlBr(songId, br, cookie);
      const item = body?.data?.[0];
      if (item?.url) {
        console.log(`[netease] getPlayUrl ${songId} ok @ br=${br}`);
        return { url: item.url, br: item.br, size: item.size };
      }
    } catch (err) {
      console.log(`[netease] getPlayUrl br=${br} failed: ${(err as Error).message}`);
    }
  }

  // Default — no br
  try {
    const body = await neteaseSongUrlBr(songId, 0, cookie);
    const item = body?.data?.[0];
    if (item?.url) {
      console.log(`[netease] getPlayUrl ${songId} ok @ default`);
      return { url: item.url, br: item.br, size: item.size };
    }
  } catch (err) {
    console.log(`[netease] getPlayUrl default failed: ${(err as Error).message}`);
  }

  // Anonymous endpoint variant — try song_url_v1 with level=standard, no cookie
  try {
    const body = await neteaseSongUrlV1(songId, "standard", undefined);
    const item = body?.data?.[0];
    if (item?.url) {
      console.log(`[netease] getPlayUrl ${songId} ok @ anonymous v1`);
      return { url: item.url, br: item.br, size: item.size, level: "standard" };
    }
  } catch (err) {
    console.log(`[netease] getPlayUrl anonymous failed: ${(err as Error).message}`);
  }

  console.log(`[netease] getPlayUrl ${songId} all attempts produced null url (region-locked?)`);
  return { url: null };
}

// =============================================================
// Router
// =============================================================
export const neteaseRouter = createRouter({
  // ---- Legacy procedures (kept for backward compat with frontend) ----
  search: publicQuery
    .input(
      z.object({
        keywords: z.string(),
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0),
        type: z.number().optional().default(1),
        cookie: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const body = await gated("netease/search", async () => {
          const r = await neteaseApi.search({
            keywords: input.keywords,
            limit: input.limit,
            offset: input.offset,
            type: input.type,
            cookie: input.cookie,
          });
          return r?.body;
        });
        return body || { result: { songs: [], songCount: 0 }, code: 200 };
      } catch (err) {
        const msg = (err as Error).message || "search failed";
        console.error("[netease/search] error:", msg);
        return { result: { songs: [], songCount: 0 }, code: 500 };
      }
    }),

  songUrl: publicQuery
    .input(
      z.object({
        id: z.union([z.string(), z.number()]),
        br: z.union([z.string(), z.number()]).optional(),
        cookie: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        // Use the robust ladder by default; if br explicit, honour it first.
        const cookie = input.cookie;
        if (input.br !== undefined) {
          const body = await neteaseSongUrlBr(input.id, Number(input.br) || 0, cookie);
          const item = body?.data?.[0];
          if (item?.url) return body;
          // fall through to ladder if null
        }
        const resolved = await getPlayUrlImpl(input.id, cookie);
        return {
          code: 200,
          data: [
            {
              id: typeof input.id === "string" ? Number(input.id) : input.id,
              url: resolved.url,
              br: resolved.br ?? null,
              size: resolved.size ?? null,
              level: resolved.level ?? null,
            },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message || "songUrl failed";
        console.error("[netease/songUrl] error:", msg);
        return { data: [], code: 500 };
      }
    }),

  songDetail: publicQuery
    .input(z.object({ ids: z.string(), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const body = await gated("netease/song_detail", async () => {
          const r = await neteaseApi.song_detail({ ids: input.ids, cookie: input.cookie });
          return r?.body;
        });
        return body || { songs: [], code: 200 };
      } catch (err) {
        console.error("[netease/songDetail] error:", (err as Error).message);
        return { songs: [], code: 500 };
      }
    }),

  lyric: publicQuery
    .input(z.object({ id: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const body = await neteaseLyric(input.id, input.cookie);
        return body || { code: 200 };
      } catch (err) {
        console.error("[netease/lyric] error:", (err as Error).message);
        return { code: 500 };
      }
    }),

  playlist: publicQuery
    .input(z.object({ id: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const body = await gated("netease/playlist_detail", async () => {
          const r = await neteaseApi.playlist_detail({ id: input.id, cookie: input.cookie });
          return r?.body;
        });
        return body || { playlist: { tracks: [], name: "" }, code: 200 };
      } catch (err) {
        console.error("[netease/playlist] error:", (err as Error).message);
        return { playlist: { tracks: [] }, code: 500 };
      }
    }),

  userPlaylists: publicQuery
    .input(z.object({ uid: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const body = await gated("netease/user_playlist", async () => {
          const r = await neteaseApi.user_playlist({ uid: input.uid, limit: 50, cookie: input.cookie });
          return r?.body;
        });
        return body || { playlist: [], code: 200 };
      } catch (err) {
        console.error("[netease/userPlaylists] error:", (err as Error).message);
        return { playlist: [], code: 500 };
      }
    }),

  // ---- New: robust resolver consumed by chat router / future callers ----
  searchTrack: publicQuery
    .input(
      z.object({
        title: z.string().min(1),
        artist: z.string().optional(),
        cookie: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const song = await searchTrackImpl(input.title, input.artist, input.cookie);
        if (!song) return { found: false as const, song: null };
        return {
          found: true as const,
          song: {
            id: song.id,
            name: song.name,
            artist: pickArtistName(song),
            album: (song.album || song.al)?.name || "",
            coverUrl: (song.album || song.al)?.picUrl || "",
            duration: song.duration ?? song.dt ?? 0,
          },
        };
      } catch (err) {
        const msg = (err as Error).message || "searchTrack failed";
        console.error("[netease/searchTrack] error:", msg);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  getPlayUrl: publicQuery
    .input(z.object({ songId: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const resolved = await getPlayUrlImpl(input.songId, input.cookie);
        return resolved;
      } catch (err) {
        const msg = (err as Error).message || "getPlayUrl failed";
        console.error("[netease/getPlayUrl] error:", msg);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  // ---- New: parsed lyrics ----
  getLyrics: publicQuery
    .input(z.object({ songId: z.union([z.string(), z.number()]), cookie: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const body = await neteaseLyric(input.songId, input.cookie);
        const raw: string = body?.lrc?.lyric || "";
        const lines = parseLrc(raw);
        return { lines, raw };
      } catch (err) {
        const msg = (err as Error).message || "getLyrics failed";
        console.warn("[netease/getLyrics] soft-fail:", msg);
        // graceful: never throw on missing lyrics
        return { lines: [] as ParsedLyricLine[], raw: "" };
      }
    }),

  // =============================================================
  // QR Code Login
  // =============================================================
  qrKey: publicQuery.query(async () => {
    try {
      const body = await gated("netease/qr_key", async () => {
        const r = await neteaseApi.login_qr_key({});
        return r?.body;
      });
      return body || { code: 500 };
    } catch (err) {
      console.error("[netease/qrKey] error:", (err as Error).message);
      return { code: 500 };
    }
  }),

  qrCreate: publicQuery
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      try {
        const body = await gated("netease/qr_create", async () => {
          const r = await neteaseApi.login_qr_create({ key: input.key, qrimg: true });
          return r?.body;
        });
        return body || { code: 500 };
      } catch (err) {
        console.error("[netease/qrCreate] error:", (err as Error).message);
        return { code: 500 };
      }
    }),

  qrCheck: publicQuery
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      try {
        const body = await gated("netease/qr_check", async () => {
          const r = await neteaseApi.login_qr_check({ key: input.key });
          return r?.body;
        });
        return body || { code: 500 };
      } catch (err) {
        console.error("[netease/qrCheck] error:", (err as Error).message);
        return { code: 500 };
      }
    }),

  saveQrSession: authedQuery
    .input(
      z.object({
        cookie: z.string(),
        nickname: z.string().optional(),
        avatar: z.string().optional(),
        uid: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { success: false };
      try {
        await db
          .insert(neteaseSessions)
          .values({
            userId: ctx.user.userId,
            cookie: input.cookie,
            nickname: input.nickname || null,
            avatar: input.avatar || null,
            neteaseUid: input.uid || null,
          })
          .onConflictDoUpdate({
            target: [neteaseSessions.userId],
            set: {
              cookie: input.cookie,
              nickname: input.nickname || null,
              avatar: input.avatar || null,
              neteaseUid: input.uid || null,
              updatedAt: new Date(),
            },
          });
        return { success: true };
      } catch {
        return { success: false };
      }
    }),

  // =============================================================
  // Phone Login
  // =============================================================
  loginPhone: authedQuery
    .input(
      z.object({
        phone: z.string(),
        password: z.string(),
        countrycode: z.string().optional().default("86"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const body = await gated("netease/login_cellphone", async () => {
          const r = await neteaseApi.login_cellphone({
            phone: input.phone,
            password: input.password,
            countrycode: input.countrycode,
          });
          return r?.body;
        });
        if (!body || body.code !== 200) {
          return { success: false, error: body?.msg || "Login failed", profile: null };
        }
        const db = getDb();
        if (db) {
          const cookie = body.cookie || "";
          const profile = body.profile || {};
          await db
            .insert(neteaseSessions)
            .values({
              userId: ctx.user.userId,
              cookie,
              neteaseUid: String(profile.userId || ""),
              nickname: profile.nickname || null,
              avatar: profile.avatarUrl || null,
              phone: input.phone,
            })
            .onConflictDoUpdate({
              target: [neteaseSessions.userId],
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
            uid: body.profile?.userId,
            nickname: body.profile?.nickname,
            avatar: body.profile?.avatarUrl,
          },
        };
      } catch (err) {
        const msg = (err as Error).message || "Login failed";
        console.error("[netease/loginPhone] error:", msg);
        return { success: false, error: msg, profile: null };
      }
    }),

  mySession: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { session: null };
    const rows = await db
      .select()
      .from(neteaseSessions)
      .where(eq(neteaseSessions.userId, ctx.user.userId))
      .limit(1);
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

  // ---- Like / Unlike a track on Netease ----
  likeTrack: authedQuery
    .input(
      z.object({
        id: z.union([z.string(), z.number()]),
        like: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { success: false, error: "no db" };
      const rows = await db
        .select({ cookie: neteaseSessions.cookie })
        .from(neteaseSessions)
        .where(eq(neteaseSessions.userId, ctx.user.userId))
        .limit(1);
      if (rows.length === 0 || !rows[0].cookie) {
        return { success: false, error: "未绑定网易云账号" };
      }
      const cookie = rows[0].cookie;
      try {
        const body = await gated("netease/like", async () => {
          const r = await neteaseApi.like({
            id: input.id,
            like: input.like,
            cookie,
          });
          return r?.body;
        });
        if (body?.code === 200) {
          console.log(`[netease/like] ${input.id} like=${input.like} ok`);
          return { success: true };
        }
        console.warn(`[netease/like] ${input.id} code=${body?.code} msg=${body?.msg}`);
        return { success: false, error: body?.msg || "操作失败" };
      } catch (err) {
        const msg = (err as Error).message || "like failed";
        console.error("[netease/like] error:", msg);
        return { success: false, error: msg };
      }
    }),

  // ---- GD Studio API search (public multi-source fallback) ----
  gdSearch: publicQuery
    .input(
      z.object({
        keywords: z.string().min(1),
        count: z.number().optional().default(20),
      }),
    )
    .query(async ({ input }) => {
      const items = await gdSearch(input.keywords, input.count);
      return {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          artist: item.artist,
          album: item.album,
          picUrl: item.pic_id
            ? `${GD_API_BASE}?types=pic&source=${item.source}&id=${item.pic_id}&size=500`
            : "",
          source: item.source,
          lyricId: item.lyric_id,
        })),
      };
    }),

  // ---- GD Studio API song URL ----
  gdSongUrl: publicQuery
    .input(
      z.object({
        source: z.string().default("netease"),
        id: z.string(),
        br: z.number().optional().default(320),
      }),
    )
    .query(async ({ input }) => {
      const url = await gdSongUrl(input.source, input.id, input.br);
      return { url };
    }),

  // ---- GD Studio API lyric ----
  gdLyric: publicQuery
    .input(
      z.object({
        source: z.string().default("netease"),
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const raw = await gdLyric(input.source, input.id);
      if (!raw) return { lines: [] as ParsedLyricLine[], raw: "" };
      const lines = parseLrc(raw);
      return { lines, raw };
    }),
});
