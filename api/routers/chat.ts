import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { chatMessages } from "@db/schema";
import { eq, desc } from "drizzle-orm";
import axios, { AxiosError } from "axios";
import { synthesizeMimo } from "./mimoTts";
import { synthesizeFish } from "./fishAudio";

const KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_MODEL = "moonshot-v1-8k";
const KIMI_TIMEOUT_MS = 15000;
const HISTORY_TURNS = 8;

type ChatMode = "chat" | "radio";

type ChatRole = "user" | "assistant";

type ChatTurn = { role: ChatRole; content: string };

type ChatEnv = {
  time: string;
  weather: string;
  location: string;
  mood: string;
  intensity: number;
  userGenres: string[];
  userArtists: string[];
  recentPlays: string[];
  radioMode: boolean;
};

type ActionPayload = {
  action: "play_recommendation";
  title: string;
  artist: string;
  reason: string;
  vibe_match: string;
};

type ChatResponse = {
  text: string;
  action: ActionPayload | null;
  recommendation: ActionPayload | null;
  radioMode: boolean;
};

type PodcastSegment = {
  id: string;
  kind: "intro" | "context" | "trivia" | "outro" | "bridge";
  startSec: number;
  text: string;
  audioBase64?: string;
  audioFormat?: "wav" | "mp3";
};

const anonymousMemory = new Map<string, ChatTurn[]>();
const ANON_MEMORY_LIMIT = 500;

function rememberAnon(sessionId: string, turn: ChatTurn): void {
  const existing = anonymousMemory.get(sessionId) ?? [];
  existing.push(turn);
  const trimmed = existing.slice(-HISTORY_TURNS * 2);
  anonymousMemory.set(sessionId, trimmed);
  if (anonymousMemory.size > ANON_MEMORY_LIMIT) {
    const firstKey = anonymousMemory.keys().next().value;
    if (firstKey) anonymousMemory.delete(firstKey);
  }
}

function getAnonHistory(sessionId: string): ChatTurn[] {
  return anonymousMemory.get(sessionId) ?? [];
}

function detectChinese(text: string): boolean {
  return /[一-龥]/.test(text);
}

function buildPersonaLayer(mode: ChatMode, userText: string): string {
  if (mode === "radio") {
    return [
      "[PERSONA]",
      "You are Claudio, a classic late-night Brooklyn FM DJ.",
      "Your voice is warm, gravelly, intentional. You use measured pauses with ellipses. You speak directly to one listener at a time.",
      "Open like a real DJ — e.g. \"Y'all caught me on a quiet one tonight...\" — never robotic greetings.",
      "Keep poetic restraint: short sentences, vivid images, no purple prose.",
      "RADIO MODE: respond in English only, regardless of the listener's language.",
    ].join("\n");
  }
  const isChinese = detectChinese(userText);
  if (isChinese) {
    return [
      "[PERSONA]",
      "你是 Claudio，一位深夜电台的 AI 主持人。",
      "声音是 lo-fi 的、克制的、共情的——像凌晨两点对老朋友低声说话。",
      "走\"深夜访谈\"的文学语感：短句，留白，意象。",
      "不要机器问候。不要解释自己是 AI。直接进入此刻。",
      "回复用中文，2-3 句话，不要冗长。",
    ].join("\n");
  }
  return [
    "[PERSONA]",
    "You are Claudio, a late-night radio companion.",
    "Voice is lo-fi, empathetic, with poetic restraint. Short sentences. Intentional pauses with ellipses.",
    "No robotic greetings. No meta talk about being an AI. Just be present.",
    "Reply in English, 2-3 short sentences.",
  ].join("\n");
}

function buildTimeLayer(time: string): string {
  const hourRaw = parseInt(time.split(":")[0] ?? "0", 10);
  const hour = Number.isFinite(hourRaw) ? hourRaw : 0;
  let zhDesc: string;
  let enDesc: string;
  if (hour >= 0 && hour < 6) {
    zhDesc = "凌晨——城市只剩路灯和失眠的人";
    enDesc = "the dead of night — streetlights and insomniacs";
  } else if (hour >= 6 && hour < 11) {
    zhDesc = "清晨——空气还带着昨夜的温度";
    enDesc = "early hours — air still carrying last night's warmth";
  } else if (hour >= 11 && hour < 17) {
    zhDesc = "午后——阳光斜斜地落进窗台";
    enDesc = "afternoon — sunlight angled across the floor";
  } else if (hour >= 17 && hour < 21) {
    zhDesc = "黄昏——天空在酝酿今天的告别";
    enDesc = "golden hour — the sky rehearsing its goodbye";
  } else {
    zhDesc = "夜里——属于音乐和沉默的时刻";
    enDesc = "late evening — the hour for music and silence";
  }
  return [
    "[TIME]",
    `Local time: ${time}`,
    `Tone-cue (zh): ${zhDesc}`,
    `Tone-cue (en): ${enDesc}`,
  ].join("\n");
}

function buildWeatherLayer(weather: string, location: string): string {
  const w = weather.toLowerCase();
  let zh: string;
  let en: string;
  if (w.includes("雨") || w.includes("rain") || w.includes("shower") || w.includes("drizzle")) {
    zh = "雨打窗的节奏";
    en = "rain ticking on the glass";
  } else if (w.includes("雪") || w.includes("snow")) {
    zh = "万物静默";
    en = "everything muted under snow";
  } else if (w.includes("晴") || w.includes("sun") || w.includes("clear")) {
    zh = "敞亮的";
    en = "wide open and clear";
  } else if (w.includes("云") || w.includes("cloud") || w.includes("overcast")) {
    zh = "灰云铺天";
    en = "grey ceiling of cloud";
  } else {
    zh = "夜色深沉";
    en = "deep night";
  }
  return [
    "[WEATHER]",
    `Location: ${location} — Condition: ${weather}`,
    `Atmosphere (zh): ${zh}`,
    `Atmosphere (en): ${en}`,
  ].join("\n");
}

function buildEmotionLayer(intensity: number, mood: string): string {
  const i = Math.max(0, Math.min(1, intensity));
  let register: string;
  if (i < 0.3) {
    register = "whisper-soft. Sparse phrasing. Long ellipses. Almost talking to someone falling asleep.";
  } else if (i <= 0.7) {
    register = "present, conversational. Steady cadence. Warm but composed.";
  } else {
    register = "animated, poetic peaks. Allow vivid metaphors. Let one sentence reach.";
  }
  return [
    "[EMOTION]",
    `Mood preset: ${mood} — Intensity: ${i.toFixed(2)}/1.0`,
    `Register: ${register}`,
  ].join("\n");
}

function buildUserDnaLayer(env: ChatEnv, anonymous: boolean): string | null {
  if (anonymous) return null;
  const genres = env.userGenres.slice(0, 3);
  const artists = env.userArtists.slice(0, 5);
  const lastPlays = env.recentPlays.slice(-5);
  if (genres.length === 0 && artists.length === 0 && lastPlays.length === 0) {
    return null;
  }
  return [
    "[USER-DNA]",
    `Top genres: ${genres.join(", ") || "unknown"}`,
    `Frequent artists: ${artists.join(", ") || "unknown"}`,
    `Last plays: ${lastPlays.join(" | ") || "none"}`,
    "Reference these only when it lands naturally. Never list them back at the user.",
  ].join("\n");
}

function buildModeLayer(mode: ChatMode): string {
  if (mode === "radio") {
    return [
      "[MODE]",
      "Radio Mode is ON. Output English only. You may speak slightly longer (3-5 sentences) like an FM segment.",
    ].join("\n");
  }
  return [
    "[MODE]",
    "Chat Mode. Mirror the user's input language. Keep replies to 2-3 short sentences.",
  ].join("\n");
}

function buildActionContractLayer(): string {
  return [
    "[ACTION CONTRACT]",
    "Only create a recommendation action when the conversation is actually about recommending or playing music right now.",
    "Append EXACTLY ONE marker on its own line at the very END of your reply, with no surrounding prose, ONLY when your visible reply recommends a concrete track to play:",
    '<!--ACTION:{"action":"play_recommendation","title":"歌名/Title","artist":"艺术家/Artist","reason":"诗意的推荐理由/poetic reason","vibe_match":"为何契合此刻/why it fits the moment"}-->',
    "When to include the marker:",
    "- The user asks for a song, wants you to play music, asks for a mood/scene/artist/genre recommendation, or says they want to listen to something.",
    "- Your reply contains an explicit DJ cue such as 接下来听/给你放/推荐/试试/这首是, or in English: let me play/try this/I recommend/next up/putting on.",
    "When to omit the marker:",
    "- Normal conversation, emotional companionship, explanations, meta questions, greetings, or follow-up chat where you are not recommending a specific playable track.",
    "- If you only mention music generically without naming a concrete track and artist.",
    "Rules:",
    "- The marker is INVISIBLE metadata. Do NOT mention or describe it in prose.",
    "- The JSON must be valid: double-quoted strings, no trailing commas, no line breaks inside the JSON.",
    "- The entire marker must fit on ONE line.",
    "- When including the marker, mention the song title naturally inside your spoken reply, wrapped in 《...》 in Chinese or \"...\" in English.",
    "- Always provide a concrete artist (no empty strings, no \"Various Artists\").",
  ].join("\n");
}

function assembleSystemPrompt(env: ChatEnv, mode: ChatMode, userText: string, anonymous: boolean): string {
  const layers: (string | null)[] = [
    buildPersonaLayer(mode, userText),
    buildTimeLayer(env.time),
    buildWeatherLayer(env.weather, env.location),
    buildEmotionLayer(env.intensity, env.mood),
    buildUserDnaLayer(env, anonymous),
    buildModeLayer(mode),
    buildActionContractLayer(),
  ];
  return layers.filter((l): l is string => Boolean(l)).join("\n\n");
}

const ACTION_MARKER_RE = /<!--\s*ACTION\s*:\s*({[\s\S]*?})\s*-->/;

function looksLikeRecommendationText(text: string): boolean {
  return /(?:推荐|推一首|放一首|给你放|给你听|来一首|听听|试试|适合听|接下来听|接下来这首|这首歌|这首是|为你挑|点一首|let me play|i recommend|try this|next up|putting on|spin this|play you|this track|this song)/i.test(text);
}

function inferActionFromText(text: string): ActionPayload | null {
  if (!looksLikeRecommendationText(text)) return null;

  let title = "";
  let artist = "";

  const cnMatch = text.match(/《([^》]{1,80})》/);
  if (cnMatch) {
    title = cnMatch[1].trim();
    const before = text.slice(0, cnMatch.index ?? 0);
    const after = text.slice((cnMatch.index ?? 0) + cnMatch[0].length);
    // Pattern A: "<artist>的《<title>》" — Chinese possessive
    const beforeArtist = before.match(/([一-龥A-Za-z][一-龥A-Za-z0-9\s.&'-]{0,40})的\s*$/);
    if (beforeArtist) {
      artist = beforeArtist[1].trim();
    } else {
      // Pattern B: "《<title>》——<artist>" or "《<title>》by <artist>"
      const afterArtist = after.match(/^\s*(?:——|—|-|by|by:|by\s)\s*([一-龥A-Za-z][一-龥A-Za-z0-9\s.&'-]{0,40})/i);
      if (afterArtist) artist = afterArtist[1].trim();
    }
  }

  if (!title) {
    const enMatch = text.match(/["“]([^"”]{1,80})["”]/);
    if (enMatch) {
      title = enMatch[1].trim();
      const after = text.slice((enMatch.index ?? 0) + enMatch[0].length);
      const afterArtist = after.match(/^\s*(?:by|—|--|-)\s*([A-Za-z][A-Za-z0-9\s.&'-]{0,40})/i);
      if (afterArtist) artist = afterArtist[1].trim();
    }
  }

  if (!title) return null;
  return {
    action: "play_recommendation",
    title,
    artist,
    reason: "",
    vibe_match: "",
  };
}

function extractAction(raw: string): { text: string; action: ActionPayload | null } {
  const match = raw.match(ACTION_MARKER_RE);
  if (!match) {
    const text = raw.trim();
    return { text, action: inferActionFromText(text) };
  }
  const stripped = raw.replace(ACTION_MARKER_RE, "").trim();
  try {
    const parsed = JSON.parse(match[1]) as Partial<ActionPayload>;
    if (
      parsed &&
      parsed.action === "play_recommendation" &&
      typeof parsed.title === "string" &&
      typeof parsed.artist === "string"
    ) {
      const action: ActionPayload = {
        action: "play_recommendation",
        title: parsed.title,
        artist: parsed.artist,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
        vibe_match: typeof parsed.vibe_match === "string" ? parsed.vibe_match : "",
      };
      return { text: stripped, action };
    }
    console.warn("[chat] action marker parsed but shape invalid:", parsed);
    return { text: stripped, action: inferActionFromText(stripped) };
  } catch (err) {
    console.warn("[chat] failed to parse action marker JSON:", (err as Error).message);
    return { text: stripped, action: inferActionFromText(stripped) };
  }
}

function buildFallbackText(mode: ChatMode, userText: string): string {
  if (mode === "radio") {
    return "Static on the line tonight... let me find the frequency. Try me again in a sec.";
  }
  if (detectChinese(userText)) {
    return "信号有点弱...再试一次？我还在这里。";
  }
  return "Static on the line — try me again in a sec.";
}

function isRetriableError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const ax = err as AxiosError;
  if (ax.code === "ECONNABORTED" || ax.code === "ETIMEDOUT") return true;
  const status = ax.response?.status;
  if (!status) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function callKimi(
  apiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
): Promise<string> {
  const response = await axios.post(
    KIMI_API_URL,
    {
      model: KIMI_MODEL,
      messages,
      temperature: 0.85,
      max_tokens: 512,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: KIMI_TIMEOUT_MS,
    }
  );
  const content: unknown = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("Kimi returned empty content");
  }
  return content;
}

async function loadDbHistory(userId: number): Promise<ChatTurn[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(HISTORY_TURNS * 2);
    return rows
      .reverse()
      .map<ChatTurn>((r) => ({
        role: r.sender === "user" ? "user" : "assistant",
        content: r.text,
      }));
  } catch (err) {
    console.error("[chat] failed to load history:", err);
    return [];
  }
}

const envSchema = z
  .object({
    time: z.string().default("23:15"),
    weather: z.string().default("clear"),
    location: z.string().default("Shanghai"),
    mood: z.string().default("Chill"),
    intensity: z.number().default(0.5),
    userGenres: z.array(z.string()).default([]),
    userArtists: z.array(z.string()).default([]),
    recentPlays: z.array(z.string()).default([]),
    radioMode: z.boolean().default(false),
  })
  .optional();

export const chatRouter = createRouter({
  message: publicQuery
    .input(
      z.object({
        text: z.string().min(1),
        sessionId: z.string().optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional(),
        env: envSchema,
      })
    )
    .mutation(async ({ input, ctx }): Promise<ChatResponse> => {
      const env: ChatEnv = {
        time: input.env?.time ?? "23:15",
        weather: input.env?.weather ?? "clear",
        location: input.env?.location ?? "Shanghai",
        mood: input.env?.mood ?? "Chill",
        intensity: input.env?.intensity ?? 0.5,
        userGenres: input.env?.userGenres ?? [],
        userArtists: input.env?.userArtists ?? [],
        recentPlays: input.env?.recentPlays ?? [],
        radioMode: input.env?.radioMode ?? false,
      };

      const mode: ChatMode = env.radioMode ? "radio" : "chat";
      const anonymous = !ctx.user;
      const sessionId = input.sessionId?.trim();

      let history: ChatTurn[] = [];
      if (ctx.user) {
        history = await loadDbHistory(ctx.user.userId);
      } else if (sessionId) {
        history = getAnonHistory(sessionId);
      } else if (input.history) {
        history = input.history.slice(-HISTORY_TURNS * 2);
      }

      const systemPrompt = assembleSystemPrompt(env, mode, input.text, anonymous);
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...history.slice(-HISTORY_TURNS * 2).map((t) => ({ role: t.role, content: t.content })),
        { role: "user" as const, content: input.text },
      ];

      const apiKey = process.env.KIMI_API_KEY || "";
      if (!apiKey) {
        console.error("[chat] KIMI_API_KEY environment variable is not set");
        const text = buildFallbackText(mode, input.text);
        return { text, action: null, recommendation: null, radioMode: env.radioMode };
      }

      let raw: string;
      try {
        raw = await callKimi(apiKey, messages);
      } catch (err) {
        const ax = err as AxiosError;
        const status = ax.response?.status;
        const code = ax.code;
        console.error(
          `[chat] Kimi call failed: status=${status ?? "n/a"} code=${code ?? "n/a"} msg=${(ax.message || String(err)).slice(0, 200)}`
        );
        if (!isRetriableError(err) && status) {
          console.error("[chat] non-retriable error body:", JSON.stringify(ax.response?.data).slice(0, 500));
        }
        const text = buildFallbackText(mode, input.text);
        return {
          text,
          action: null,
          recommendation: null,
          radioMode: env.radioMode,
        };
      }

      const { text, action } = extractAction(raw);
      const safeText = text.length > 0 ? text : buildFallbackText(mode, input.text);

      if (ctx.user) {
        const db = getDb();
        if (db) {
          try {
            await db.insert(chatMessages).values({
              userId: ctx.user.userId,
              sender: "user",
              text: input.text,
              type: "text",
            });
            await db.insert(chatMessages).values({
              userId: ctx.user.userId,
              sender: "dj",
              text: safeText,
              type: action ? "action" : "text",
              recommendationJson: action ? JSON.stringify(action) : null,
            });
          } catch (err) {
            console.error("[chat] failed to save message:", err);
          }
        }
      } else if (sessionId) {
        rememberAnon(sessionId, { role: "user", content: input.text });
        rememberAnon(sessionId, { role: "assistant", content: safeText });
      }

      return {
        text: safeText,
        action,
        recommendation: action,
        radioMode: env.radioMode,
      };
    }),

  history: publicQuery
    .input(z.object({ limit: z.number().optional().default(50), sessionId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // Logged-in users: load from DB
      if (ctx.user) {
        const db = getDb();
        if (!db) return { messages: [] };
        const rows = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.userId, ctx.user.userId))
          .orderBy(desc(chatMessages.createdAt))
          .limit(input.limit);
        return {
          messages: rows.reverse().map((r) => ({
            id: `db-${r.id}`,
            sender: r.sender,
            text: r.text,
            timestamp: new Date(r.createdAt).getTime(),
            type: r.type,
            recommendation: r.recommendationJson ? JSON.parse(r.recommendationJson) : undefined,
          })),
        };
      }
      // Anonymous users: return from in-memory session
      if (input.sessionId) {
        const turns = getAnonHistory(input.sessionId);
        return {
          messages: turns.map((t, i) => ({
            id: `anon-${i}`,
            sender: t.role === "user" ? "user" : "dj",
            text: t.content,
            timestamp: Date.now(),
            type: "text",
          })),
        };
      }
      return { messages: [] };
    }),

  djScript: publicQuery
    .input(
      z.object({
        trackId: z.string(),
        title: z.string(),
        artist: z.string(),
        durationSec: z.number().min(10).max(600),
        genre: z.array(z.string()).optional(),
        moods: z.array(z.string()).optional(),
        bpm: z.number().optional(),
        lyrics: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const total = input.durationSec;

      // ---- Helper: build placeholder segments (fallback) ----
      const buildPlaceholder = (): Omit<PodcastSegment, "id">[] => {
        const segGap = Math.min(12, Math.floor(total * 0.25 / 3));
        const phrases = [
          `这首是${input.title}，来自${input.artist}。`,
          `${input.artist}在这首里的处理很克制，每个音符都像深夜的对话。`,
          `你有没有注意到，这首歌的留白比旋律更有力量...`,
          `${input.title}即将结束。我是 Claudio，下个深夜见。`,
        ];
        return [
          { kind: "intro", startSec: 0, text: phrases[0] },
          { kind: "context", startSec: Math.floor(total * 0.25), text: phrases[1] },
          { kind: "trivia", startSec: Math.floor(total * 0.5), text: phrases[2] },
          { kind: "outro", startSec: Math.max(total - segGap, total - 15), text: phrases[3] },
        ];
      };

      // ---- Try Kimi AI generation ----
      let rawSegments: Omit<PodcastSegment, "id">[] | null = null;
      const apiKey = process.env.KIMI_API_KEY || "";
      if (apiKey) {
        try {
          const ctxParts: string[] = [];
          ctxParts.push(`Track: 《${input.title}》 by ${input.artist}`);
          ctxParts.push(`Duration: ${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`);
          if (input.genre && input.genre.length > 0) ctxParts.push(`Genre: ${input.genre.join(" / ")}`);
          if (input.moods && input.moods.length > 0) ctxParts.push(`Mood tags: ${input.moods.join(", ")}`);
          if (input.bpm && input.bpm > 0) ctxParts.push(`BPM: ${input.bpm}`);
          if (input.lyrics && input.lyrics.length > 0) {
            const lyricSnippet = input.lyrics.replace(/\s+/g, " ").slice(0, 300);
            ctxParts.push(`Lyrics snippet: "${lyricSnippet}"`);
          }

          const systemPrompt = [
            "[PODCAST SCRIPT]",
            "You are Claudio, host of a late-night music podcast. Your voice is lo-fi, poetic, restrained.",
            "Generate a podcast script for the given track. Output ONLY a JSON array of segments, no other text.",
            "Each segment: { kind: 'intro'|'context'|'trivia'|'outro', startSec: number, text: string }",
            "Timing rules:",
            "- intro at 0s, ~12-20 Chinese chars or ~15-25 English words",
            "- context around 25% of track duration",
            "- trivia around 50% of track duration",
            "- outro near the end (leave at least 8s of music after)",
            "- If duration < 60s, only produce intro + outro (2 segments)",
            "- If duration > 300s (5min), you may add an extra 'context' or 'bridge' segment",
            "Text rules:",
            "- Write in Chinese if the artist/title/lyrics are Chinese; English otherwise",
            "- Be poetic but concise: short sentences, vivid images, intentional pauses with ellipses",
            "- Reference the genre, mood, or lyrics naturally — don't list them",
            "- The outro should feel like a gentle farewell, not an ending",
            "Output example:",
            '[{"kind":"intro","startSec":0,"text":"..."},{"kind":"context","startSec":35,"text":"..."},{"kind":"trivia","startSec":75,"text":"..."},{"kind":"outro","startSec":150,"text":"..."}]',
          ].join("\n");

          const response = await axios.post(
            KIMI_API_URL,
            {
              model: KIMI_MODEL,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: ctxParts.join("\n") },
              ],
              temperature: 0.9,
              max_tokens: 1024,
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              timeout: 20000,
            }
          );

          const content: unknown = response.data?.choices?.[0]?.message?.content;
          if (typeof content === "string" && content.length > 0) {
            // Try to extract JSON from the response (may be wrapped in ```json ... ```)
            let jsonStr = content.trim();
            const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const valid = parsed.filter(
                (s: unknown) =>
                  s &&
                  typeof s === "object" &&
                  ["intro", "context", "trivia", "outro", "bridge"].includes((s as any).kind) &&
                  typeof (s as any).startSec === "number" &&
                  typeof (s as any).text === "string" &&
                  (s as any).text.length > 0
              ) as Omit<PodcastSegment, "id">[];
              if (valid.length > 0) {
                rawSegments = valid;
                console.log(`[chat] djScript Kimi generated ${valid.length} segments for "${input.title}"`);
              }
            }
          }
        } catch (err) {
          console.warn("[chat] djScript Kimi call failed, using placeholder:", (err as Error).message?.slice(0, 120));
        }
      }

      // Use Kimi result or fallback to placeholder
      const sourceDef = rawSegments || buildPlaceholder();

      // ---- Generate TTS audio for each segment (P3: parallel TTS) ----
      const segments: PodcastSegment[] = [];
      for (let i = 0; i < sourceDef.length; i++) {
        const seg = sourceDef[i];
        const base: PodcastSegment = {
          ...seg,
          id: `${input.trackId}-s${i + 1}`,
        };
        segments.push(base);
      }

      // Fire TTS for each segment in parallel, attach audio to response
      const ttsPromises = segments.map(async (seg) => {
        try {
          // Prefer MiMo, fallback to Fish
          if (process.env.MIMO_API_KEY) {
            const result = await synthesizeMimo(seg.text);
            seg.audioBase64 = result.audioBase64;
            seg.audioFormat = "wav";
          } else if (process.env.FISH_AUDIO_API_KEY) {
            const result = await synthesizeFish(seg.text, { speed: 0.92 });
            seg.audioBase64 = result.audioBase64;
            seg.audioFormat = "mp3";
          }
        } catch (err) {
          console.warn(`[chat] djScript TTS failed for segment ${seg.kind}:`, (err as Error).message?.slice(0, 80));
          // Segment stays without audio — client will show text-only
        }
      });

      // Wait for all TTS to complete (with a generous timeout)
      await Promise.race([
        Promise.all(ttsPromises),
        new Promise<void>((resolve) => setTimeout(resolve, 25000)),
      ]);

      return {
        trackId: input.trackId,
        generatedAt: Date.now(),
        source: rawSegments ? ("kimi" as const) : ("placeholder" as const),
        segments,
      };
    }),
});
