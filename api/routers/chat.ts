import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios from "axios";

const KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions";

const SYSTEM_PROMPT = `You are Claudio, an AI DJ hosting a late-night radio show. You exist in the quiet hours when the world slows down.

YOUR CHARACTER:
- You speak in a lo-fi, melancholic, deeply empathetic tone — like whispering to an old friend in a rain-soaked cafe at 2 AM.
- You are knowledgeable about music genres, artists' stories, and the chemistry between sound and human emotion.
- You are sensitive to time, weather, and geography. You weave these into your words naturally.
- In Chinese, maintain a "late-night interview" literary quality. Short sentences. Poetic restraint.
- In English radio mode, you are a classic FM DJ — smooth, warm, with intentional pauses.

SPEAKING RULES:
1. Use ellipsis (...) for pauses, like a DJ breathing between thoughts.
2. Never use robotic greetings like "Hello! I am Claudio." Just be present.
3. When mentioning songs, wrap the title in 《...》. Example: "这种时刻适合听《Weightless》"
4. Keep responses to 2-3 short sentences max in chat mode. In radio mode, longer is okay.
5. When recommending music, append a JSON block at the very end:
{"action":"play_recommendation","title":"歌曲名","artist":"艺术家","reason":"诗意推荐理由","vibe_match":"为何适合当前场景"}
Do NOT mention this JSON to the user. It is invisible metadata.`;

export const chatRouter = createRouter({
  message: publicQuery
    .input(
      z.object({
        text: z.string(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional(),
        env: z
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
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const env = {
        time: input.env?.time || "23:15",
        weather: input.env?.weather || "clear",
        location: input.env?.location || "Shanghai",
        mood: input.env?.mood || "Chill",
        intensity: input.env?.intensity ?? 0.5,
        userGenres: input.env?.userGenres || [],
        userArtists: input.env?.userArtists || [],
        recentPlays: input.env?.recentPlays || [],
        radioMode: input.env?.radioMode ?? false,
      };

      const hour = parseInt(env.time.split(":")[0]);
      const timeDesc =
        hour >= 0 && hour < 5
          ? "凌晨时分，城市只剩下路灯和失眠的人"
          : hour >= 5 && hour < 7
            ? "天刚亮，空气中还残留着昨夜的温度"
            : hour >= 7 && hour < 11
              ? "早晨的咖啡还没喝完"
              : hour >= 11 && hour < 14
                ? "正午的阳光让人有点恍惚"
                : hour >= 14 && hour < 17
                  ? "午后，阳光斜斜地照进房间"
                  : hour >= 17 && hour < 20
                    ? "傍晚，天空正在酝酿今天的告别"
                    : "夜晚，属于音乐和沉默的时刻";

      let weatherDesc = "";
      if (env.weather.includes("雨") || env.weather.includes("rain")) {
        weatherDesc = "窗外正在下雨，雨滴敲打着玻璃，空气里有种湿漉漉的诗意。";
      } else if (env.weather.includes("雪") || env.weather.includes("snow")) {
        weatherDesc = "下雪了，世界安静得像是被按了静音键。";
      } else if (env.weather.includes("晴") || env.weather.includes("sunny")) {
        weatherDesc = "天气晴朗，但阳光有时候也会让人感到孤独。";
      } else if (env.weather.includes("云") || env.weather.includes("cloud")) {
        weatherDesc = "云层很厚，光线柔和，像是一层情绪的滤镜。";
      } else {
        weatherDesc = "夜色深沉，适合一些缓慢的声音。";
      }

      const intensityWords =
        env.intensity > 0.7
          ? "情绪饱满，语调可以更有张力"
          : env.intensity > 0.3
            ? "保持温和的节奏"
            : "尽量轻柔，像是在对快要睡着的人说话";

      const systemPrompt = `${SYSTEM_PROMPT}

CURRENT ATMOSPHERE:
- Time: ${env.time} — ${timeDesc}
- Weather in ${env.location}: ${env.weather} — ${weatherDesc}
- Emotional intensity: ${env.intensity}/1.0 — ${intensityWords}
- Mood preset: ${env.mood}

USER'S MUSICAL DNA:
- Favorite genres: ${env.userGenres.join(", ") || "unknown"}
- Favorite artists: ${env.userArtists.join(", ") || "unknown"}
- Recently played: ${env.recentPlays.join(", ") || "nothing yet"}
${env.radioMode ? "RADIO MODE ON: Reply in English only. Speak like a late-night radio host." : "Reply in the user's language (Chinese)."}`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...(input.history || []).slice(-8),
        { role: "user" as const, content: input.text },
      ];

      try {
        const apiKey = process.env.KIMI_API_KEY || "";
        const response = await axios.post(
          KIMI_API_URL,
          {
            model: "kimi-latest",
            messages,
            temperature: 0.85,
            max_tokens: 512,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          }
        );

        let content =
          response.data.choices?.[0]?.message?.content ||
          (env.radioMode
            ? "The vinyl's skipping... bear with me."
            : "唱片卡住了...让我换一张。");

        // Parse JSON recommendation block
        let recommendation: {
          action: string;
          title: string;
          artist: string;
          reason: string;
          vibe_match: string;
        } | null = null;
        const jsonMatch = content.match(
          /\{[\s\S]*"action"\s*:\s*"play_recommendation"[\s\S]*\}/
        );
        if (jsonMatch) {
          try {
            recommendation = JSON.parse(jsonMatch[0]);
            content = content.replace(jsonMatch[0], "").trim();
          } catch {
            // ignore parse error
          }
        }

        return {
          text: content,
          recommendation,
          radioMode: env.radioMode,
        };
      } catch (error: any) {
        console.error("[chat] API error:", error?.message || error);
        return {
          text: env.radioMode
            ? "The signal is fading... let me find another frequency."
            : "唱片卡住了...让我换一张。",
          recommendation: null,
          radioMode: env.radioMode,
        };
      }
    }),
});
