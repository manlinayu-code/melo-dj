// Lyric sentiment analysis for mood inference (L3).
// Simple NLP approach: keyword frequency counting with Chinese + English emotion dictionaries.
// Returns a dominant sentiment classification that feeds into mood auto-tagging.

/** Sentiment classification result */
export interface LyricSentiment {
  /** Dominant emotion category */
  dominant: "happy" | "sad" | "angry" | "romantic" | null;
  /** Raw keyword counts per category */
  counts: { happy: number; sad: number; angry: number; romantic: number };
  /** Score of dominant category (ratio among non-zero categories) */
  score: number;
}

// =============================================================
// Emotion word dictionaries — lightweight, curated
// =============================================================

const POSITIVE_WORDS = new Set([
  // Chinese
  "快乐", "幸福", "甜蜜", "阳光", "美好", "微笑", "拥抱", "开心",
  "欢笑", "温暖", "希望", "彩虹", "飞翔", "自由", "明天", "春天",
  "鲜花", "星星", "大海", "晴天", "灿烂", "美妙", "沉浸", "轻盈",
  "欢快", "喜悦", "陶醉", "升腾", "绽放", "跳动",
  // English
  "love", "happy", "happiness", "smile", "joy", "beautiful", "sweet",
  "sunshine", "dream", "hope", "heaven", "paradise", "bright", "light",
  "dance", "sing", "fly", "free", "golden", "baby", "darling",
]);

const SAD_WORDS = new Set([
  // Chinese
  "悲伤", "眼泪", "孤独", "寂寞", "离开", "失去", "痛", "哭",
  "哭泣", "泪", "伤", "心碎", "遗憾", "回忆", "想念", "思念",
  "夜晚", "黑暗", "寒冷", "雨", "雪", "秋风", "落", "凋零",
  "沉默", "沉没", "远", "逝", "忘", "模糊", "灰色", "空白",
  "破碎", "枯萎", "荒芜", "无尽", "漫长", "深", "沉重",
  // English
  "pain", "cry", "tears", "lonely", "sad", "sadness", "goodbye",
  "miss", "lost", "gone", "dark", "cold", "rain", "winter",
  "broken", "empty", "falling", "fade", "alone", "sorry", "never",
  "hurt", "bleed", "scar", "ghost", "shadow",
]);

const ANGRY_WORDS = new Set([
  // Chinese
  "愤怒", "恨", "疯狂", "燃烧", "呐喊", "咆哮", "怒吼", "挣脱",
  "毁灭", "撕碎", "轰炸", "爆炸", "叛逆", "反抗", "挣扎",
  // English
  "fire", "hate", "rage", "burn", "scream", "fight", "die",
  "destroy", "war", "hell", "devil", "monster", "beast", "mad",
  "riot", "crash",
]);

const ROMANTIC_WORDS = new Set([
  // Chinese
  "浪漫", "吻", "心", "月光", "温柔", "轻轻", "慢慢", "拥抱",
  "依偎", "夜晚", "梦", "呼吸", "耳边", "嘴唇", "眼神", "靠近",
  "触碰", "温热", "沉溺", "染", "飘散",
  // English
  "kiss", "heart", "moon", "gentle", "tender", "forever", "night",
  "touch", "breathe", "close", "hold", "feel", "slow", "whisper",
  "skin", "soft", "warm", "deep", "ocean",
]);

// =============================================================
// Analysis
// =============================================================

/**
 * Analyze lyric text for sentimental leaning.
 * Returns null dominant if no strong signal detected.
 */
export function analyzeLyricSentiment(lyrics: string): LyricSentiment {
  if (!lyrics) {
    return { dominant: null, counts: { happy: 0, sad: 0, angry: 0, romantic: 0 }, score: 0 };
  }

  // Normalize: lowercase, strip punctuation but keep CJK and letters
  const normalized = lyrics
    .toLowerCase()
    .replace(/[，。！？、；：""'']/g, " ")  // Chinese punctuation → space
    .replace(/[,.!?;:'"()\[\]]/g, " ")        // English punctuation → space
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return { dominant: null, counts: { happy: 0, sad: 0, angry: 0, romantic: 0 }, score: 0 };
  }

  // Count keyword occurrences (substring match for Chinese, word-boundary for English)
  let happy = 0, sad = 0, angry = 0, romantic = 0;

  // Chinese multi-char matching: scan the text for each keyword
  for (const word of POSITIVE_WORDS) {
    if (isChineseWord(word)) {
      happy += countOccurrences(normalized, word);
    } else {
      happy += countEnglishWord(normalized, word);
    }
  }
  for (const word of SAD_WORDS) {
    if (isChineseWord(word)) {
      sad += countOccurrences(normalized, word);
    } else {
      sad += countEnglishWord(normalized, word);
    }
  }
  for (const word of ANGRY_WORDS) {
    if (isChineseWord(word)) {
      angry += countOccurrences(normalized, word);
    } else {
      angry += countEnglishWord(normalized, word);
    }
  }
  for (const word of ROMANTIC_WORDS) {
    if (isChineseWord(word)) {
      romantic += countOccurrences(normalized, word);
    } else {
      romantic += countEnglishWord(normalized, word);
    }
  }

  const counts = { happy, sad, angry, romantic };
  const maxCount = Math.max(happy, sad, angry, romantic);
  if (maxCount === 0) {
    return { dominant: null, counts, score: 0 };
  }

  // Determine dominant category
  let dominant: LyricSentiment["dominant"] = null;
  if (happy >= sad && happy >= angry && happy >= romantic) dominant = "happy";
  else if (sad >= happy && sad >= angry && sad >= romantic) dominant = "sad";
  else if (angry >= happy && angry >= sad && angry >= romantic) dominant = "angry";
  else if (romantic >= happy && romantic >= sad && romantic >= angry) dominant = "romantic";

  // Score: how dominant the top category is (0-1)
  const total = happy + sad + angry + romantic;
  const score = maxCount / total;

  return { dominant, counts, score };
}

/**
 * Map lyric sentiment to mood names for inferMoodNames.
 */
export function sentimentToMoods(sentiment: LyricSentiment): string[] {
  if (!sentiment.dominant || sentiment.score < 0.4) return [];
  const { dominant } = sentiment;
  switch (dominant) {
    case "happy":
      return ["Energetic", "Chill"];
    case "sad":
      return ["Heartbreak", "Calm"];
    case "angry":
      return ["Energetic"];
    case "romantic":
      return ["Heartbreak", "Chill"];
    default:
      return [];
  }
}

// =============================================================
// Internal utilities
// =============================================================

function isChineseWord(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

function countOccurrences(text: string, word: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(word, pos)) !== -1) {
    count++;
    pos += word.length;
  }
  return count;
}

function countEnglishWord(text: string, word: string): number {
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
