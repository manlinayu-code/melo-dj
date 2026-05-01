import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { Track, DJProfile, ChatMessage, WeatherInfo, EnvVibe } from "@/types";

// ====== Safe API helper ======
function getToken() {
  return localStorage.getItem("melo_token");
}

async function trpcGet(procedure: string, input?: Record<string, unknown>) {
  let url = `/api/trpc/${procedure}`;
  if (input) {
    url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
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
    body: JSON.stringify({ json: input }),
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
  login: (name: string, password: string) => Promise<void>;
  register: (name: string, password: string) => Promise<void>;
  logout: () => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  setTheme: (t: "dark" | "light") => void;
  bindNetease: (phone: string, password: string) => Promise<void>;
  unbindNetease: () => Promise<void>;
  fetchLyrics: (neteaseId: number) => Promise<void>;
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

  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await trpcGet("auth.me");
      if (data?.user) {
        setUser(data.user);
      }
    } catch {
      localStorage.removeItem("melo_token");
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = useCallback(async (name: string, password: string) => {
    setAuthError(null);
    try {
      const data = await trpcPost("auth.login", { name, password });
      if (data?.success && data.token) {
        localStorage.setItem("melo_token", data.token);
        setUser(data.user);
        setShowLoginModal(false);
        // Load history after login
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

  // ---- Refs ----
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // ---- Audio element + Web Audio API ----
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    // Initialize Web Audio API
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      setAudioAnalyser(analyser);

      // Connect audio element to analyser
      const source = ctx.createMediaElementSource(audio);
      sourceRef.current = source;
      source.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (err) {
      console.warn("Web Audio API not available:", err);
    }

    const onTimeUpdate = () => {
      setProgress(audio.currentTime);
      // Update lyric index
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
      // Try to resume AudioContext (browsers suspend it until user gesture)
      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume();
      }

      const data = await trpcGet("netease.songUrl", { id: track.neteaseId });
      const songs = data?.data || [];
      // Find first valid URL, prefer higher bitrate
      const sorted = [...songs].sort((a: any, b: any) => (b.br || 0) - (a.br || 0));
      const valid = sorted.find((s: any) => s?.url);

      if (valid?.url && audioRef.current) {
        audioRef.current.src = valid.url;
        audioRef.current.volume = volume;
        if (isPlaying) {
          audioRef.current.play().catch((err) => {
            console.error("Play error:", err);
            // Auto-pause if autoplay blocked
            setIsPlaying(false);
          });
        }
      } else {
        showToast("这首歌暂时无法播放，试试下一首");
      }
    } catch (err) {
      console.error("loadTrackUrl error:", err);
      showToast("音频加载失败");
    }
  }, [volume, isPlaying]);

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
      // Save play history if logged in
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
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const setVolume = useCallback((v: number) => setVolumeState(Math.max(0, Math.min(1, v))), []);

  const autoNext = useCallback(() => {
    setQueue((q) => {
      if (!q || q.length === 0) return q;
      const newQ = [...q];
      const next = newQ.shift();
      if (next) setCurrentTrack(next);
      return newQ;
    });
  }, []);

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
    setQueue((q) => (q || []).map((t) => (t.id === id ? { ...t, isFav: !t.isFav } : t)));
    setCurrentTrack((t) => (t && t.id === id ? { ...t, isFav: !t.isFav } : t));
  }, []);

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
    recognition.onerror = () => { setIsListening(false); showToast("语音识别失败，请重试"); };
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) { showToast(`语音识别: "${transcript}"`); sendMessage(transcript); }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [showToast]);

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); }
  }, []);

  // ---- TTS (Browser + Fish.Audio fallback) ----
  const speakText = useCallback((text: string) => {
    if (!text) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }

    const tryFishAudio = async () => {
      try {
        const data = await trpcPost("fishAudio.speak", { text: text.slice(0, 500) });
        if (data?.success && data.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
          ttsAudioRef.current = audio;
          audio.onplay = () => setIsSpeaking(true);
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => { setIsSpeaking(false); tryBrowserTTS(); };
          audio.play().catch(() => tryBrowserTTS());
          return;
        }
      } catch { /* fallback */ }
      tryBrowserTTS();
    };

    const tryBrowserTTS = () => {
      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = radioMode ? "en-US" : "zh-CN";
      utterance.pitch = 0.85;
      utterance.rate = radioMode ? 0.88 : 0.92;
      utterance.volume = 0.75;
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((voice) => (radioMode ? voice.lang.includes("en") : voice.lang.includes("zh")));
      if (v) utterance.voice = v;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    };

    tryFishAudio();
  }, [radioMode]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
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

  const setMood = useCallback((mood: string) => setEnvVibe((v) => ({ ...v, mood })), []);
  const setIntensity = useCallback((intensity: number) => setEnvVibe((v) => ({ ...v, intensity })), []);
  const setImmersed = useCallback((immersed: boolean) => setEnvVibe((v) => ({ ...v, immersed })), []);

  // ---- Load chat history ----
  const loadChatHistory = useCallback(async () => {
    try {
      const data = await trpcGet("chat.history", { limit: 50 });
      if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        const history: ChatMessage[] = data.messages.map((m: any) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp,
          type: m.type,
          recommendation: m.recommendation,
        }));
        // Keep welcome messages if no history
        setMessages((prev) => history.length > 0 ? history : prev);
      }
    } catch (err) {
      console.error("loadChatHistory error:", err);
    }
  }, []);

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
      const data = await trpcGet("netease.search", { keywords: `${rec.title} ${rec.artist || ""}`.trim(), limit: 5 });
      const songs = data?.result?.songs;
      if (!songs || !Array.isArray(songs) || songs.length === 0) {
        showToast("抱歉，没找到这首歌");
        return;
      }
      const s = songs[0];
      const track: Track = {
        id: `nw-${s.id}`,
        title: s.name || rec.title,
        artist: Array.isArray(s.ar) ? s.ar.map((a: any) => a?.name || "").join(", ") : rec.artist || "未知",
        album: s.al?.name || "",
        duration: Math.floor((s.dt || 0) / 1000),
        cover: s.al?.picUrl || "/cover-if.jpg",
        genre: [rec.vibe_match || "Recommended"],
        isFav: false,
        neteaseId: s.id,
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
    audioAnalyser, lyrics, currentLyricIndex, neteaseSession,
    togglePlay, setVolume, nextTrack, prevTrack, sendMessage,
    playTrack, addToQueue, removeFromQueue, reorderQueue, toggleFav,
    showToast, searchAndPlay, speakText, stopSpeaking,
    toggleRadioMode, setMood, setIntensity, setImmersed,
    startVoiceInput, stopVoiceInput, fetchWeather, playFromRecommendation,
    login, register, logout, openLoginModal, closeLoginModal, setTheme,
    bindNetease, unbindNetease, fetchLyrics,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

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

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
