import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { Track, DJProfile, ChatMessage, WeatherInfo, EnvVibe } from "@/types";
import { detectBpmFromUrl } from "@/lib/bpmDetector";

// ====== Safe API helper ======
function getToken() {
  return localStorage.getItem("melo_token");
}

function getTokenExp(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch { return null; }
}

function getOrCreateSessionId(): string {
  let id = localStorage.getItem("melo_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("melo_session_id", id);
  }
  return id;
}

async function trpcGet(procedure: string, input?: Record<string, unknown>) {
  let url = `/api/trpc/${procedure}`;
  if (input) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { credentials: "include", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "tRPC error");
  return json.result?.data;
}

async function trpcPost(procedure: string, input: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "tRPC error");
  return json.result?.data;
}

// ====== Types ======
interface Recommendation {
  action: string;
  title: string;
  artist: string;
  reason: string;
  vibe_match: string;
}

interface User {
  id: number;
  name: string;
  avatar?: string | null;
}

interface NeteaseSession {
  nickname: string;
  avatar?: string;
  neteaseUid: string;
  phone?: string;
}

export interface LyricLine {
  time: number;
  text: string;
}

interface AppState {
  isPlaying: boolean;
  currentTrack: Track | null;
  progress: number;
  duration: number;
  volume: number;
  queue: Track[];
  djPersona: DJProfile;
  messages: ChatMessage[];
  isTyping: boolean;
  weather: WeatherInfo;
  toast: { message: string; visible: boolean } | null;
  isSpeaking: boolean;
  radioMode: boolean;
  envVibe: EnvVibe;
  currentSubtitle: string;
  isListening: boolean;
  user: User | null;
  showLoginModal: boolean;
  authError: string | null;
  theme: "dark" | "light";
  audioAnalyser: AnalyserNode | null;
  lyrics: LyricLine[];
  currentLyricIndex: number;
  neteaseSession: NeteaseSession | null;
  ttsProvider: string;
  podcastMode: boolean;
  podcastScript: { segments: Array<{ id: string; startSec: number; text: string; kind: string; audioBase64?: string; audioFormat?: string }>; source?: string } | null;
  podcastLoading: boolean;
  podcastActiveSegId: string | null;
}

interface AppActions {
  togglePlay: () => void;
  setVolume: (v: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  sendMessage: (text: string) => Promise<void>;
  playTrack: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggleFav: (id: string) => void;
  showToast: (message: string) => void;
  searchAndPlay: (query: string) => Promise<void>;
  speakText: (text: string) => void;
  stopSpeaking: () => void;
  toggleRadioMode: () => void;
  setMood: (mood: string) => void;
  setIntensity: (v: number) => void;
  setImmersed: (v: boolean) => void;
  startVoiceInput: () => void;
  stopVoiceInput: () => void;
  fetchWeather: () => Promise<void>;
  playFromRecommendation: (rec: Recommendation) => Promise<void>;
  login: (name: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (name: string, password: string) => Promise<void>;
  logout: () => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  setTheme: (t: "dark" | "light") => void;
  setTtsProvider: (provider: string) => void;
  togglePodcastMode: () => void;
  duckMusic: () => void;
  restoreMusic: () => void;
  bindNetease: (phone: string, password: string) => Promise<void>;
  unbindNetease: () => Promise<void>;
  fetchLyrics: (neteaseId: number) => Promise<void>;
  likeOnNetease: (neteaseId: number, like: boolean) => Promise<void>;
  seekTo: (position: number) => void;
  importPlaylist: (playlistId: string | number) => Promise<void>;
  syncLikes: () => Promise<void>;
}

const defaultTracks: Track[] = [
  { id: "1", title: "Weightless", artist: "Marconi Union", album: "Weightless", duration: 480, cover: "/cover-if.jpg", genre: ["Ambient"], isFav: false, neteaseId: 26222029 },
  { id: "2", title: "Midnight City", artist: "M83", album: "Hurry Up We're Dreaming", duration: 243, cover: "/cover-biheung.jpg", genre: ["Electronic"], isFav: false, neteaseId: 27678685 },
  { id: "3", title: "所念皆星河", artist: "CMJ", album: "所念皆星河", duration: 195, cover: "/cover-tiancai.jpg", genre: ["Piano", "Chinese"], isFav: false, neteaseId: 1432383355 },
  { id: "4", title: "Kiss of Life", artist: "Sade", album: "Love Deluxe", duration: 274, cover: "/cover-wine.jpg", genre: ["R&B", "Soul"], isFav: true, neteaseId: 21993616 },
  { id: "5", title: "Gymnopédie No.1", artist: "Erik Satie", album: "Gymnopédies", duration: 189, cover: "/cover-hero.jpg", genre: ["Classical"], isFav: false, neteaseId: 5188952 },
];

const djPersona: DJProfile = {
  name: "Claudio",
  avatar: "/melo-avatar.jpg",
  tagline: "深夜电台，只给失眠的人",
  bio: "我是一台老旧的收音机，在凌晨三点的频率里，替你筛选那些配得上此刻孤独的声音。我听天气、听心跳、听城市渐渐安静下来的过程...",
  genres: ["JAZZ-HIPHOP", "NEO-CLASSICAL", "AMBIENT", "INDIE", "POST-PUNK", "DREAM POP", "SHOEGAZE", "CITY POP"],
  isOnline: true,
};

const defaultWeather: WeatherInfo = {
  condition: "rainy",
  temp: 18,
  city: "Shanghai",
  text: "小雨",
  wind: "东南风 3级",
  humidity: 78,
};

/** Parse LRC format lyrics */
function parseLRC(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const line of lrcText.split("\n")) {
    const match = line.match(timeRegex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msRaw = match[3];
      const ms = parseInt(msRaw.padEnd(3, "0"), 10);
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) lines.push({ time, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // ---- Theme ----
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("melo_theme") as "dark" | "light" | null;
    return saved || "dark";
  });

  const setTheme = useCallback((t: "dark" | "light") => {
    setThemeState(t);
    localStorage.setItem("melo_theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ---- Auth ----
  const [user, setUser] = useState<User | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ---- State ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(defaultTracks[0]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const [queue, setQueue] = useState<Track[]>(defaultTracks.slice(1));
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "m1", sender: "dj", text: "...凌晨三点，你还醒着。", timestamp: Date.now() },
    { id: "m2", sender: "dj", text: "这种时候，空气里的声音会比白天更清晰。适合听一些《Weightless》之类的...让频率慢慢沉降。", timestamp: Date.now() },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [weather, setWeather] = useState<WeatherInfo>(defaultWeather);
  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [radioMode, setRadioMode] = useState(false);
  const [envVibe, setEnvVibe] = useState<EnvVibe>({ mood: "Chill", intensity: 0.5, radioMode: false, immersed: false });
  const [currentSubtitle, setCurrentSubtitle] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
  const [neteaseSession, setNeteaseSession] = useState<NeteaseSession | null>(null);
  const [ttsProvider, setTtsProvider] = useState("auto");
  const [podcastMode, setPodcastMode] = useState(false);
  const [podcastScript, setPodcastScript] = useState<{ segments: Array<{ id: string; startSec: number; text: string; kind: string; audioBase64?: string; audioFormat?: string }>; source?: string } | null>(null);
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [podcastActiveSegId, setPodcastActiveSegId] = useState<string | null>(null);

  // ---- Refs ----
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const podcastAudioRef = useRef<HTMLAudioElement | null>(null);
  const playedSegIdsRef = useRef<Set<string>>(new Set());
  const userRef = useRef<User | null>(null);
  const prefDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Reset played segment tracking when podcast script loads
  useEffect(() => {
    if (podcastScript) playedSegIdsRef.current.clear();
  }, [podcastScript]);

  // ---- Toast ----
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => {
      setToast((t) => (t ? { ...t, visible: false } : null));
      setTimeout(() => setToast(null), 300);
    }, 2500);
  }, []);

  // ---- Playback controls ----
  const autoNext = useCallback(() => {
    setQueue((q) => {
      if (!q || q.length === 0) return q;
      const newQ = [...q];
      const next = newQ.shift();
      if (next) setCurrentTrack(next);
      return newQ;
    });
  }, []);

  // ---- Load chat history ----
  const loadChatHistory = useCallback(async () => {
    const token = getToken();
    try {
      const data = await trpcGet("chat.history", {
        limit: 50,
        sessionId: token ? undefined : getOrCreateSessionId(),
      });
      if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        const history: ChatMessage[] = data.messages.map((m: any) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp,
          type: m.type,
          recommendation: m.recommendation,
        }));
        setMessages((prev) => history.length > 0 ? history : prev);
      }
    } catch (err) {
      console.error("loadChatHistory error:", err);
    }
  }, []);

  // ---- Auth callbacks ----
  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      // Refresh token if expiring within 1 day
      const exp = getTokenExp();
      if (exp !== null && exp - Date.now() / 1000 < 86400) {
        try {
          const refreshed = await trpcPost("auth.refreshSession", {});
          if (refreshed?.token) {
            localStorage.setItem("melo_token", refreshed.token);
          }
        } catch { /* continue with existing token */ }
      }
      const data = await trpcGet("auth.me");
      if (data?.user) {
        setUser(data.user);
      }
    } catch {
      localStorage.removeItem("melo_token");
    }
  }, []);
  useEffect(() => { loadUser(); }, [loadUser]);

  const login = useCallback(async (name: string, password: string, rememberMe = false) => {
    setAuthError(null);
    try {
      const data = await trpcPost("auth.login", { name, password, rememberMe });
      if (data?.success && data.token) {
        localStorage.setItem("melo_token", data.token);
        setUser(data.user);
        setShowLoginModal(false);
        loadChatHistory();
      } else {
        setAuthError(data?.error || "登录失败");
      }
    } catch (err: any) {
      setAuthError(err.message || "登录失败");
    }
  }, []);

  const register = useCallback(async (name: string, password: string) => {
    setAuthError(null);
    try {
      const data = await trpcPost("auth.register", { name, password });
      if (data?.success && data.token) {
        localStorage.setItem("melo_token", data.token);
        setUser(data.user);
        setShowLoginModal(false);
      } else {
        setAuthError(data?.error || "注册失败");
      }
    } catch (err: any) {
      setAuthError(err.message || "注册失败");
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("melo_token");
    setUser(null);
  }, []);

  const openLoginModal = useCallback(() => { setAuthError(null); setShowLoginModal(true); }, []);
  const closeLoginModal = useCallback(() => { setShowLoginModal(false); }, []);

  // ---- Anonymous queue: hydrate from localStorage on mount (no token) ----
  useEffect(() => {
    if (getToken()) return;
    try {
      const raw = localStorage.getItem("melo_queue");
      if (raw) {
        const saved = JSON.parse(raw) as Track[];
        if (Array.isArray(saved) && saved.length > 0) setQueue(saved);
      }
    } catch {}
  }, []);

  // ---- Anonymous queue: persist to localStorage whenever queue changes ----
  useEffect(() => {
    if (user) return;
    try { localStorage.setItem("melo_queue", JSON.stringify(queue)); } catch {}
  }, [user, queue]);

  // ---- Logged-in: hydrate queue + preferences when user changes ----
  useEffect(() => {
    if (!user) return;
    trpcGet("playlist.getQueue")
      .then((data) => {
        if (data?.queue && Array.isArray(data.queue) && data.queue.length > 0) {
          const tracks: Track[] = data.queue.map((r: any) => ({
            id: r.trackId || `q-${r.id}`,
            title: r.trackTitle,
            artist: r.artist,
            album: r.album || "",
            duration: r.durationSec || 0,
            cover: r.coverUrl || "/cover-if.jpg",
            genre: ["Queue"],
            isFav: false,
            neteaseId: r.neteaseId ?? undefined,
          }));
          setQueue(tracks);
        }
      })
      .catch(() => {});

    trpcGet("playlist.getPreferences")
      .then((data) => {
        if (!data?.preferences) return;
        const p = data.preferences;
        setEnvVibe((v) => ({
          ...v,
          mood: p.moodDefault || v.mood,
          intensity: p.intensityDefault ?? v.intensity,
          radioMode: p.radioMode ?? v.radioMode,
        }));
        if (p.theme === "dark" || p.theme === "light") setTheme(p.theme);
        setTtsProvider(p.ttsProvider || "auto");
      })
      .catch(() => {});
  }, [user?.id]);

  // ---- Debounced preference save when envVibe changes (logged-in only) ----
  useEffect(() => {
    if (!userRef.current) return;
    if (prefDebounceRef.current) clearTimeout(prefDebounceRef.current);
    prefDebounceRef.current = setTimeout(() => {
      if (!userRef.current) return;
      trpcPost("playlist.setPreferences", {
        moodDefault: envVibe.mood,
        intensityDefault: envVibe.intensity,
        radioMode: envVibe.radioMode,
      }).catch(() => {});
    }, 1000);
  }, [envVibe.mood, envVibe.intensity, envVibe.radioMode]);

  // ---- Audio element + Web Audio API ----
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      setAudioAnalyser(analyser);

      const musicGain = ctx.createGain();
      musicGain.gain.value = 0.7;
      const source = ctx.createMediaElementSource(audio);
      source.connect(musicGain);
      musicGain.connect(analyser);
      analyser.connect(ctx.destination);
      (sourceRef as any).musicGain = musicGain;
      sourceRef.current = source;
    } catch (err) {
      console.warn("Web Audio API not available:", err);
    }

    const onTimeUpdate = () => {
      setProgress(audio.currentTime);
      if (lyrics.length > 0) {
        const idx = lyrics.findIndex((l, i) => {
          const next = lyrics[i + 1];
          return audio.currentTime >= l.time && (!next || audio.currentTime < next.time);
        });
        if (idx >= 0) setCurrentLyricIndex(idx);
      }
    };
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => { setIsPlaying(false); autoNext(); };
    const onError = (e: Event) => { console.error("Audio error:", e); setIsPlaying(false); showToast("音频加载失败，尝试下一首..."); };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audioCtxRef.current?.close();
    };
  }, [lyrics.length]);

  // ---- Ducking: lower music when DJ speaks ----
  const duckMusic = useCallback(() => {
    const musicGain = (sourceRef as any).musicGain as GainNode | undefined;
    const ctx = audioCtxRef.current;
    if (!musicGain || !ctx) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.linearRampToValueAtTime(0.15, t + 0.4);
  }, []);

  const restoreMusic = useCallback(() => {
    const musicGain = (sourceRef as any).musicGain as GainNode | undefined;
    const ctx = audioCtxRef.current;
    if (!musicGain || !ctx) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.linearRampToValueAtTime(0.7, t + 0.6);
  }, []);

  // ---- Podcast segment auto-play (P3) ----
  useEffect(() => {
    if (!podcastMode || !podcastScript || !isPlaying) return;
    const segs = podcastScript.segments;
    if (!segs || segs.length === 0) return;

    // Find the active segment (the one whose startSec we just passed)
    const currentTime = progress;
    let active: typeof segs[0] | null = null;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (currentTime >= segs[i].startSec) {
        active = segs[i];
        break;
      }
    }
    if (!active) return;

    setPodcastActiveSegId(active.id);

    // Don't replay already-played segments
    if (playedSegIdsRef.current.has(active.id)) return;
    if (!active.audioBase64) return; // No TTS audio available

    playedSegIdsRef.current.add(active.id);

    const mime = active.audioFormat === "wav" ? "audio/wav" : "audio/mp3";
    const audio = new Audio(`data:${mime};base64,${active.audioBase64}`);
    podcastAudioRef.current = audio;
    audio.volume = 0.8;

    audio.onplay = () => duckMusic();
    audio.onended = () => { restoreMusic(); podcastAudioRef.current = null; };
    audio.onerror = () => { restoreMusic(); podcastAudioRef.current = null; };

    audio.play().catch(() => { restoreMusic(); podcastAudioRef.current = null; });
  }, [podcastMode, podcastScript, isPlaying, progress, duckMusic, restoreMusic]);

  // ---- Play/Pause sync ----
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (isPlaying) {
      audio.play().catch((err) => { console.error("Play error:", err); setIsPlaying(false); });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // ---- Volume sync ----
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  // ---- Load track URL from Netease ----
  const loadTrackUrl = useCallback(async (track: Track) => {
    if (!track.neteaseId) return;
    try {
      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume();
      }

      const data = await trpcGet("netease.songUrl", { id: track.neteaseId });
      const songs = data?.data || [];
      const sorted = [...songs].sort((a: any, b: any) => (b.br || 0) - (a.br || 0));
      const valid = sorted.find((s: any) => s?.url);

      if (valid?.url && audioRef.current) {
        // Route through our audio proxy: netease CDN does not return CORS headers,
        // and `crossOrigin="anonymous"` would otherwise mute the element via Web Audio.
        audioRef.current.src = `/api/audio/proxy?url=${encodeURIComponent(valid.url)}`;
        audioRef.current.volume = volume;
        // Use ref to check latest isPlaying state (avoid stale closure)
        if (isPlayingRef.current) {
          audioRef.current.play().catch((err) => {
            console.error("Play error:", err);
            setIsPlaying(false);
          });
        }

        // Fire-and-forget BPM analysis (don't block playback)
        if (track.neteaseId) {
          const rawUrl = valid.url;
          const neteaseId = track.neteaseId;
          detectBpmFromUrl(rawUrl).then((result) => {
            if (result && result.confidence > 0.3) {
              console.log(`[bpm] track ${neteaseId} → ${result.bpm} BPM (conf=${result.confidence.toFixed(2)})`);
              trpcGet("mood.autoTag", {
                tracks: [{ neteaseId, genres: [], artist: track.artist, durationSec: track.duration, bpm: result.bpm }],
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      } else {
        showToast("这首歌暂时无法播放，试试下一首");
      }
    } catch (err) {
      console.error("loadTrackUrl error:", err);
      showToast("音频加载失败");
    }
  }, [volume]);

  // ---- Fetch lyrics ----
  const fetchLyrics = useCallback(async (neteaseId: number) => {
    if (!neteaseId) return;
    try {
      const data = await trpcGet("netease.lyric", { id: neteaseId });
      const lrcText = data?.lrc?.lyric || data?.nolyric?.lyric || "";
      if (lrcText) {
        const parsed = parseLRC(lrcText);
        setLyrics(parsed);
        setCurrentLyricIndex(0);
        // L3: Fire-and-forget lyric sentiment mood tagging
        // Extract plain text from parsed lyrics for analysis
        const plainText = parsed.map((l) => l.text).join(" ");
        if (plainText.trim()) {
          trpcGet("mood.autoTag", {
            tracks: [{ neteaseId, genres: [], lyrics: plainText }],
          }).catch(() => {}); // fire-and-forget, don't block playback
        }
      } else {
        setLyrics([]);
      }
    } catch (err) {
      console.error("fetchLyrics error:", err);
      setLyrics([]);
    }
  }, []);

  // ---- Netease bind/unbind ----
  const bindNetease = useCallback(async (phone: string, password: string) => {
    try {
      const data = await trpcPost("netease.loginPhone", { phone, password });
      if (data?.success) {
        setNeteaseSession({
          nickname: data.profile?.nickname,
          avatar: data.profile?.avatar,
          neteaseUid: String(data.profile?.uid || ""),
          phone,
        });
        showToast(`已绑定网易云：${data.profile?.nickname}`);
      } else {
        showToast(data?.error || "网易云登录失败");
      }
    } catch (err: any) {
      showToast(err.message || "网易云登录失败");
    }
  }, []);

  const unbindNetease = useCallback(async () => {
    try {
      await trpcPost("netease.logoutNetease", {});
      setNeteaseSession(null);
      showToast("已解绑网易云账号");
    } catch {
      showToast("解绑失败");
    }
  }, []);

  // ---- Like / Unlike on Netease ----
  const likeOnNetease = useCallback(async (neteaseId: number, like: boolean) => {
    if (!neteaseId || !neteaseSession) {
      showToast("请先绑定网易云账号");
      return;
    }
    try {
      const data = await trpcPost("netease.likeTrack", { id: neteaseId, like });
      if (data?.success) {
        showToast(like ? `已添加到「我喜欢」` : `已取消喜欢`);
        // Sync local isFav state for tracks with matching neteaseId
        setQueue((q) => (q || []).map((t) => (t.neteaseId === neteaseId ? { ...t, isFav: like } : t)));
        setCurrentTrack((t) => (t && t.neteaseId === neteaseId ? { ...t, isFav: like } : t));
      } else {
        showToast(data?.error || "操作失败");
      }
    } catch (err: any) {
      showToast(err.message || "操作失败");
    }
  }, [neteaseSession, showToast]);

  // ---- Seek ----
  const seekTo = useCallback((position: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const clamped = Math.max(0, Math.min(position, duration));
    audio.currentTime = clamped;
    setProgress(clamped);
  }, [duration]);

  // ---- Import Playlist ----
  const importPlaylist = useCallback(async (playlistId: string | number) => {
    if (!playlistId) return;
    try {
      showToast("正在导入歌单...");
      // Call backend library.importPlaylist which handles:
      // 1. Fetch playlist_detail + song_detail batch enrichment
      // 2. Store in local_tracks with genre (from playlist tags)
      // 3. Auto-tag moods with enriched genre data
      const data = await trpcPost("library.importPlaylist", { playlistId });
      if (data?.success) {
        showToast(`已导入「${data.playlistName}」· ${data.imported} 首歌 · mood 标注 ${data.tagged}`);
      } else {
        showToast(data?.error || "歌单为空或获取失败");
      }
    } catch (err: any) {
      console.error("importPlaylist error:", err);
      showToast(err?.message || "导入歌单失败");
    }
  }, [showToast]);

  // Load netease session on mount
  useEffect(() => {
    if (!user) { setNeteaseSession(null); return; }
    trpcGet("netease.mySession")
      .then((data) => {
        if (data?.session) {
          setNeteaseSession({
            nickname: data.session.nickname,
            avatar: data.session.avatar,
            neteaseUid: data.session.neteaseUid,
            phone: data.session.phone,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  // When currentTrack changes, load URL + lyrics
  useEffect(() => {
    if (currentTrack) {
      setProgress(0);
      setDuration(0);
      loadTrackUrl(currentTrack);
      fetchLyrics(currentTrack.neteaseId || 0);
      if (user) {
        trpcPost("playlist.savePlay", {
          songId: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          cover: currentTrack.cover,
          duration: currentTrack.duration,
        }).catch(() => {});
      }
    }
  }, [currentTrack?.id]);

  // ---- Basic playback controls ----
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const setVolume = useCallback((v: number) => setVolumeState(Math.max(0, Math.min(1, v))), []);

  const nextTrack = useCallback(() => {
    setQueue((q) => {
      if (!q || q.length === 0) return q;
      const newQ = [...q];
      const next = newQ.shift();
      if (next) { setCurrentTrack(next); setIsPlaying(true); }
      return newQ;
    });
  }, []);

  const prevTrack = useCallback(() => {
    if (audioRef.current) { audioRef.current.currentTime = 0; setProgress(0); }
  }, []);

  const playTrack = useCallback((track: Track) => { setCurrentTrack(track); setIsPlaying(true); }, []);
  const addToQueue = useCallback((track: Track) => setQueue((q) => [...(q || []), track]), []);
  const removeFromQueue = useCallback((id: string) => setQueue((q) => (q || []).filter((t) => t.id !== id)), []);
  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((q) => {
      if (!q || fromIndex < 0 || toIndex < 0 || fromIndex >= q.length || toIndex >= q.length) return q;
      const newQ = [...q];
      const [moved] = newQ.splice(fromIndex, 1);
      newQ.splice(toIndex, 0, moved);
      return newQ;
    });
  }, []);
  const toggleFav = useCallback((id: string) => {
    setQueue((q) => {
      if (!q) return q;
      const updated = q.map((t) => {
        if (t.id !== id) return t;
        // Persist to track_sync
        if (t.neteaseId) {
          trpcPost("sync.markFav", { neteaseId: t.neteaseId, fav: !t.isFav }).catch(() => {});
        }
        return { ...t, isFav: !t.isFav };
      });
      return updated;
    });
    setCurrentTrack((t) => {
      if (!t || t.id !== id) return t;
      if (t.neteaseId) {
        trpcPost("sync.markFav", { neteaseId: t.neteaseId, fav: !t.isFav }).catch(() => {});
      }
      return { ...t, isFav: !t.isFav };
    });
  }, []);

  // ---- Sync likes from Netease ----
  const syncLikes = useCallback(async () => {
    try {
      const data = await trpcPost("sync.reverseLikes", {});
      if (data?.success) {
        showToast(`同步完成：${data.synced} 首喜欢的歌已标记`);
      } else {
        showToast(data?.error || "同步失败");
      }
    } catch (err: any) {
      console.error("syncLikes error:", err);
      showToast(err?.message || "同步失败");
    }
  }, [showToast]);

  // ---- Voice Input (Web Speech API) ----
  const startVoiceInput = useCallback(() => {
    const w = window as any;
    if (!("webkitSpeechRecognition" in w || "SpeechRecognition" in w)) {
      showToast("浏览器不支持语音识别");
      return;
    }
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      setIsListening(false);
      const code = event.error as string;
      if (code === "not-allowed") {
        showToast("麦克风权限被拒绝，请检查浏览器权限设置");
      } else if (code === "no-speech") {
        showToast("没有检测到语音，请再试一次");
      } else if (code === "network") {
        showToast("语音识别网络错误，请检查网络连接");
      } else if (code === "aborted") {
        // User cancelled, no toast needed
      } else {
        showToast(`语音识别失败 (${code})`);
      }
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) { showToast(`语音识别: "${transcript}"`); sendMessageRef.current(transcript); }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [showToast]);

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); }
  }, []);

  // ---- TTS — routes through tts.speak dispatcher ----
  const speakText = useCallback((text: string) => {
    if (!text) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    if (ttsSourceRef.current) { try { ttsSourceRef.current.disconnect(); } catch {} ttsSourceRef.current = null; }

    const lang = radioMode ? "en-US" : "zh-CN";
    const rate = radioMode ? 0.88 : 0.92;

    const fallbackBrowserTTS = (t: string, ttsLang = lang, ttsRate = rate) => {
      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(t);
      utterance.lang = ttsLang;
      utterance.pitch = 0.85;
      utterance.rate = ttsRate;
      utterance.volume = 0.75;
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((voice) => voice.lang.startsWith(ttsLang.split("-")[0]));
      if (v) utterance.voice = v;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    };

    (async () => {
      try {
        const result = await trpcPost("tts.speak", {
          text: text.slice(0, 500),
          mode: ttsProvider,
          lang,
          speed: rate,
        });
        if ((result?.source === "fish" || result?.source === "mimo") && result.audioBase64) {
          const mime = result.source === "mimo" ? "audio/wav" : "audio/mp3";
          const audio = new Audio(`data:${mime};base64,${result.audioBase64}`);
          ttsAudioRef.current = audio;

          // Connect TTS to Web Audio analyser for waveform visualization
          try {
            const ctx = audioCtxRef.current;
            const analyser = analyserRef.current;
            if (ctx && analyser) {
              const ttsSource = ctx.createMediaElementSource(audio);
              ttsSource.connect(analyser);
              ttsSourceRef.current = ttsSource;
            }
          } catch {
            // May already be connected; ignore
          }

          duckMusic();
          audio.onplay = () => setIsSpeaking(true);
          audio.onended = () => { setIsSpeaking(false); restoreMusic(); };
          audio.onerror = () => { setIsSpeaking(false); restoreMusic(); fallbackBrowserTTS(text); };
          audio.play().catch(() => { restoreMusic(); fallbackBrowserTTS(text); });
        } else {
          fallbackBrowserTTS(result?.text || text, result?.lang || lang, result?.rate || rate);
        }
      } catch {
        fallbackBrowserTTS(text);
      }
    })();
  }, [radioMode, ttsProvider]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    if (ttsSourceRef.current) { try { ttsSourceRef.current.disconnect(); } catch {} ttsSourceRef.current = null; }
    setIsSpeaking(false);
  }, []);

  // ---- Radio Mode ----
  const toggleRadioMode = useCallback(() => {
    setRadioMode((prev) => {
      const next = !prev;
      setEnvVibe((v) => ({ ...v, radioMode: next }));
      showToast(next ? "Radio Mode ON — Claudio is now speaking" : "Chat Mode — Claudio is listening");
      return next;
    });
  }, [showToast]);

  // ---- Podcast Mode ----
  const togglePodcastMode = useCallback(() => {
    setPodcastMode((prev) => {
      const next = !prev;
      if (next) {
        showToast("Podcast Mode ON — 生成 Claudio 的口播脚本...");
        const track = currentTrack;
        if (track?.neteaseId) {
          setPodcastLoading(true);
          const payload: Record<string, unknown> = {
            trackId: String(track.neteaseId),
            title: track.title,
            artist: track.artist,
            durationSec: track.duration || 180,
          };
          if (track.genre && track.genre.length > 0) payload.genre = track.genre;
          if (lyrics.length > 0) {
            payload.lyrics = lyrics.slice(0, 8).map(l => l.text).join(" / ");
          }
          trpcPost("chat.djScript", payload)
            .then((data) => {
              if (data?.segments) setPodcastScript(data);
            })
            .catch(() => showToast("脚本生成失败，使用默认模式"))
            .finally(() => setPodcastLoading(false));
        }
      } else {
        setPodcastScript(null);
        setPodcastActiveSegId(null);
        // Stop any playing podcast audio
        if (podcastAudioRef.current) { podcastAudioRef.current.pause(); podcastAudioRef.current = null; }
        showToast("Podcast Mode OFF");
      }
      return next;
    });
  }, [showToast, currentTrack, lyrics]);

  const setMood = useCallback((mood: string) => setEnvVibe((v) => ({ ...v, mood })), []);
  const setIntensity = useCallback((intensity: number) => setEnvVibe((v) => ({ ...v, intensity })), []);
  const setImmersed = useCallback((immersed: boolean) => setEnvVibe((v) => ({ ...v, immersed })), []);

  // Load history when user changes
  useEffect(() => {
    if (user) {
      loadChatHistory();
    }
  }, [user, loadChatHistory]);

  // ---- Send Message (AI Chat) ----
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, sender: "user", text: text.trim(), timestamp: Date.now() };
    setMessages((msgs) => [...msgs, userMsg]);
    setIsTyping(true);

    try {
      const history = (messages || [])
        .slice(-8)
        .map((m) => ({ role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant", content: m.text }));

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      const result = await trpcPost("chat.message", {
        text: text.trim(),
        history,
        sessionId: getOrCreateSessionId(),
        env: {
          time: timeStr,
          weather: weather?.text || "clear",
          location: weather?.city || "Shanghai",
          mood: envVibe?.mood || "Chill",
          intensity: envVibe?.intensity ?? 0.5,
          userGenres: [],
          userArtists: [],
          recentPlays: currentTrack ? [currentTrack.title] : [],
          radioMode: radioMode || false,
        },
      });

      if (!result) throw new Error("Empty response from chat API");

      const djMsg: ChatMessage = {
        id: `d-${Date.now()}`,
        sender: "dj",
        text: result.text || "...",
        timestamp: Date.now(),
        type: result.recommendation ? "action" : "text",
        recommendation: result.recommendation || undefined,
      };
      setMessages((msgs) => [...msgs, djMsg]);

      if (radioMode && result.text) {
        setCurrentSubtitle(result.text);
        if (subtitleTimer.current) clearTimeout(subtitleTimer.current);
        subtitleTimer.current = setTimeout(() => setCurrentSubtitle(""), 10000);
      }

      if (radioMode && result.text) speakText(result.text);
    } catch (err: any) {
      console.error("sendMessage error:", err);
      const fallback: ChatMessage = {
        id: `d-${Date.now()}`,
        sender: "dj",
        text: radioMode ? "The signal is fading..." : "唱片卡住了...让我换一张。",
        timestamp: Date.now(),
      };
      setMessages((msgs) => [...msgs, fallback]);
    } finally {
      setIsTyping(false);
    }
  }, [messages, weather, envVibe, radioMode, speakText, currentTrack]);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ---- Search & Play ----
  const searchAndPlay = useCallback(async (query: string) => {
    if (!query.trim()) return;
    try {
      showToast(`搜索「${query}」...`);
      const data = await trpcGet("netease.search", { keywords: query.trim(), limit: 10 });
      const songs = data?.result?.songs;
      if (!songs || !Array.isArray(songs) || songs.length === 0) {
        showToast("Claudio 没找到这首歌，换个关键词试试？");
        return;
      }
      const tracks: Track[] = songs
        .filter((s: any) => s && s.id)
        .map((s: any, i: number) => ({
          id: `nw-${s.id}-${i}`,
          title: s.name || "未知",
          artist: Array.isArray(s.ar) ? s.ar.map((a: any) => a?.name || "").join(", ") : "未知",
          album: s.al?.name || "",
          duration: Math.floor((s.dt || 0) / 1000),
          cover: s.al?.picUrl || "/cover-if.jpg",
          genre: ["Search"],
          isFav: false,
          neteaseId: s.id,
        }));
      if (tracks.length > 0) {
        setQueue(tracks.slice(1));
        setCurrentTrack(tracks[0]);
        setIsPlaying(true);
        showToast(`Claudio 找到了 ${tracks.length} 首歌`);
      }
    } catch (err: any) {
      console.error("searchAndPlay error:", err);
      showToast("搜索出错了，Claudio 的网线被猫咬断了");
    }
  }, [showToast]);

  // ---- Play from recommendation ----
  const playFromRecommendation = useCallback(async (rec: Recommendation) => {
    if (!rec?.title) return;
    try {
      showToast(`Claudio 正在搜索《${rec.title}》...`);
      const data = await trpcGet("netease.search", {
        keywords: `${rec.title} ${rec.artist || ""}`.trim(),
        limit: 1,
      });
      const song = data?.result?.songs?.[0];
      if (!song) {
        showToast("抱歉，没找到这首歌");
        return;
      }
      const track: Track = {
        id: `nw-${song.id}`,
        title: song.name || rec.title,
        artist: Array.isArray(song.ar) ? song.ar.map((a: { name?: string }) => a?.name || "").filter(Boolean).join(", ") : (rec.artist || "未知"),
        album: song.al?.name || "",
        duration: Math.floor((song.dt || 0) / 1000),
        cover: song.al?.picUrl || "/cover-if.jpg",
        genre: [rec.vibe_match || "Recommended"],
        isFav: false,
        neteaseId: song.id,
      };
      setQueue((q) => [track, ...(q || [])]);
      setCurrentTrack(track);
      setIsPlaying(true);
      showToast(`正在播放《${track.title}》— ${track.artist}`);
    } catch (err) {
      console.error("playFromRecommendation error:", err);
      showToast("播放出错了");
    }
  }, [showToast]);

  // ---- Weather ----
  const fetchWeather = useCallback(async () => {
    try {
      const data = await trpcGet("weather.current", { location: "101020100" });
      if (data?.success) {
        setWeather({
          condition: (data.condition || "cloudy") as WeatherInfo["condition"],
          temp: data.temp ?? 18,
          city: data.city || "Shanghai",
          text: data.text || "多云",
          wind: data.wind || "",
          humidity: data.humidity ?? 50,
        });
      }
    } catch (err) { console.error("fetchWeather error:", err); }
  }, []);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  // ---- Value ----
  const value: AppState & AppActions = {
    isPlaying, currentTrack, progress, duration, volume, queue,
    djPersona, messages, isTyping, weather, toast,
    isSpeaking, radioMode, envVibe, currentSubtitle, isListening,
    user, showLoginModal, authError, theme,
    audioAnalyser, lyrics, currentLyricIndex, neteaseSession, ttsProvider,
    podcastMode, podcastScript, podcastLoading, podcastActiveSegId,
    togglePlay, setVolume, nextTrack, prevTrack, sendMessage,
    playTrack, addToQueue, removeFromQueue, reorderQueue, toggleFav,
    showToast, searchAndPlay, speakText, stopSpeaking,
    toggleRadioMode, togglePodcastMode, setMood, setIntensity, setImmersed,
    startVoiceInput, stopVoiceInput, fetchWeather, playFromRecommendation,
    login, register, logout, openLoginModal, closeLoginModal, setTheme,
    setTtsProvider, duckMusic, restoreMusic,
    bindNetease, unbindNetease, fetchLyrics, likeOnNetease, seekTo, importPlaylist,
    syncLikes,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
