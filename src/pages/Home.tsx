import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Heart, Volume2, CloudRain, Cloud, Sun as SunIcon, Snowflake, Wind, Search, Radio, Thermometer, Droplets, Mic, ChevronRight, User, LogIn, Moon, MessageCircle, Plus, X, RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { Track } from "@/types";
import WaveformCanvas from "@/components/WaveformCanvas";
import AudioParticles from "@/components/AudioParticles";

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const moodOptions = ["Calm", "Chill", "Energetic", "Heartbreak", "Focus"];

type TODKey = "deepNight" | "dawn" | "day" | "dusk" | "night";

function pickTimeOfDay(h: number): TODKey {
  if (h >= 0 && h < 6) return "deepNight";
  if (h >= 6 && h < 11) return "dawn";
  if (h >= 11 && h < 17) return "day";
  if (h >= 17 && h < 21) return "dusk";
  return "night";
}

const todPalette: Record<TODKey, { from: string; via: string; to: string; accent: string; label: string }> = {
  deepNight: { from: "#050a14", via: "#0a1228", to: "#060910", accent: "#3b82f6", label: "Deep Night" },
  dawn:      { from: "#0a1a30", via: "#122a50", to: "#080c18", accent: "#60a5fa", label: "Dawn" },
  day:       { from: "#0c2440", via: "#143a6e", to: "#060910", accent: "#93c5fd", label: "Day" },
  dusk:      { from: "#081830", via: "#102a50", to: "#060910", accent: "#3b82f6", label: "Dusk" },
  night:     { from: "#060e1c", via: "#0c1a35", to: "#060910", accent: "#2563eb", label: "Night" },
};

/** Rain streaks overlay (canvas) — light, ambient. */
function RainOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const drops = Array.from({ length: 80 }, () => ({
      x: Math.random() * 480,
      y: Math.random() * 800,
      l: 8 + Math.random() * 14,
      v: 4 + Math.random() * 6,
      a: 0.15 + Math.random() * 0.35,
    }));
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (const d of drops) {
        ctx.strokeStyle = `rgba(165,180,252,${d.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 1, d.y + d.l);
        ctx.stroke();
        d.y += d.v;
        d.x -= 0.4;
        if (d.y > h + 12) { d.y = -d.l; d.x = Math.random() * w; }
        if (d.x < -8) d.x = w + 4;
      }
    };
    tick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/** Snow drift overlay. */
function SnowOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const flakes = Array.from({ length: 50 }, () => ({
      x: Math.random() * 480,
      y: Math.random() * 800,
      r: 0.8 + Math.random() * 2,
      vy: 0.3 + Math.random() * 0.7,
      vx: (Math.random() - 0.5) * 0.4,
      a: 0.4 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, w, h);
      const t = (Date.now() - start) * 0.001;
      for (const f of flakes) {
        ctx.fillStyle = `rgba(255,255,255,${f.a})`;
        ctx.beginPath();
        ctx.arc(f.x + Math.sin(t + f.phase) * 4, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        f.y += f.vy;
        f.x += f.vx;
        if (f.y > h + 6) { f.y = -6; f.x = Math.random() * w; }
        if (f.x < -6) f.x = w + 6;
        else if (f.x > w + 6) f.x = -6;
      }
    };
    tick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/** Soft starfield (used at night with clear weather). */
function StarOverlay() {
  const stars = useMemo(() => Array.from({ length: 60 }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 90,
    r: Math.random() * 1.2 + 0.4,
    delay: Math.random() * 4,
  })), []);
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.15} fill="rgba(255,255,255,0.85)">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="3s" begin={`${s.delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

export default function Home({ onNavigate }: { onNavigate?: (v: "home" | "queue" | "chat" | "profile") => void }) {
  const {
    isPlaying, currentTrack, progress, duration, volume, queue, messages,
    togglePlay, setVolume, nextTrack, prevTrack, toggleFav,
    weather, djPersona, toggleRadioMode, radioMode, envVibe,
    setMood, setIntensity, startVoiceInput,
    isSpeaking, isListening,
    user, openLoginModal, logout, theme, setTheme, seekTo,
    playTrack, addToQueue, showToast,
    likeOnNetease, neteaseSession, importPlaylist, syncLikes,
  } = useApp();

  const [time, setTime] = useState(new Date());
  const [showWeather, setShowWeather] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [colonOn, setColonOn] = useState(true);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [trackMoods, setTrackMoods] = useState<Map<number, { id: number; name: string; nameZh: string; color: string; icon: string }[]>>(new Map());
  const [backendMoods, setBackendMoods] = useState<{ name: string; nameZh: string; color: string; icon: string }[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importPlaylistId, setImportPlaylistId] = useState("");
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const [syncingLikes, setSyncingLikes] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const c = setInterval(() => setColonOn((v) => !v), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, []);

  // Load moods from backend
  useEffect(() => {
    fetch(`/api/trpc/mood.list`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const moods = data?.result?.data?.moods;
        if (Array.isArray(moods) && moods.length > 0) {
          setBackendMoods(moods);
        }
      })
      .catch(() => {});
  }, []);

  const hrs = time.getHours().toString().padStart(2, "0");
  const mins = time.getMinutes().toString().padStart(2, "0");
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][time.getDay()];
  const dateStr = `${time.getDate().toString().padStart(2, "0")} ${time.toLocaleString("en", { month: "short" }).toUpperCase()} ${time.getFullYear()}`;

  const todKey = useMemo(() => pickTimeOfDay(time.getHours()), [time]);
  const tod = todPalette[todKey];

  const condition = weather?.condition || "clear";
  const isNight = todKey === "deepNight" || todKey === "night";

  const WIcon = condition === "rainy" ? CloudRain : condition === "sunny" ? SunIcon : condition === "snowy" ? Snowflake : condition === "windy" ? Wind : Cloud;

  const onImportPlaylist = async () => {
    if (!importPlaylistId.trim()) return;
    const match = importPlaylistId.match(/id[=/]([0-9]+)/i) || importPlaylistId.match(/^([0-9]+)$/);
    const id = match ? match[1] : importPlaylistId.trim();
    if (!/^[0-9]+$/.test(id)) {
      showToast("请输入有效的网易云歌单 ID，或歌单链接");
      return;
    }
    setImportingPlaylist(true);
    try {
      await importPlaylist(id);
      setImportPlaylistId("");
      setShowImport(false);
    } finally {
      setImportingPlaylist(false);
    }
  };

  const onSyncLikes = async () => {
    setSyncingLikes(true);
    try {
      await syncLikes();
    } finally {
      setSyncingLikes(false);
    }
  };

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const url = `/api/trpc/netease.search?input=${encodeURIComponent(JSON.stringify({ keywords: searchQuery.trim(), limit: 10 }))}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json();
      const songs = json?.result?.data?.result?.songs;
      if (!songs || !Array.isArray(songs) || songs.length === 0) {
        showToast("Claudio 没找到这首歌，换个关键词试试？");
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }
      const tracks: Track[] = songs.map((s: any, i: number) => ({
        id: `nw-${s.id}-${i}`,
        title: s.name || "未知",
        artist: Array.isArray(s.ar) ? s.ar.map((a: any) => a?.name || "").join(", ") : "未知",
        album: s.al?.name || "",
        duration: Math.floor((s.dt || 0) / 1000),
        cover: s.al?.picUrl || "/cover-if.jpg",
        genre: [],
        isFav: false,
        neteaseId: s.id,
      }));
      setSearchResults(tracks);
      setShowSearchResults(true);

      const neteaseIds = tracks.map((t) => t.neteaseId!).filter(Boolean);

      // Lookup enriched metadata from local library (genre, pop, etc.)
      if (neteaseIds.length > 0) {
        fetch(`/api/trpc/library.getEnriched?input=${encodeURIComponent(JSON.stringify({ neteaseIds }))}`, { credentials: "include" })
          .then((r) => r.json())
          .then((data) => {
            const enriched = data?.result?.data?.tracks;
            if (Array.isArray(enriched) && enriched.length > 0) {
              const enrichMap = new Map(enriched.map((e: any) => [e.neteaseId, e]));
              setSearchResults((prev) =>
                prev.map((t) => {
                  const e = t.neteaseId ? enrichMap.get(t.neteaseId) : null;
                  if (!e || !e.genre?.length) return t;
                  return { ...t, genre: e.genre };
                }),
              );
            }
          })
          .catch(() => {});
      }

      // Auto-tag mood + load mood data (fire-and-forget, don't block UI)
      const trackPayloads = tracks.map((t) => ({
        neteaseId: t.neteaseId!,
        genres: t.genre, // Will be empty initially; enriched later from library
        artist: t.artist,
        durationSec: t.duration,
      }));
      const tagUrl = `/api/trpc/mood.autoTag?input=${encodeURIComponent(JSON.stringify({ tracks: trackPayloads }))}`;
      fetch(tagUrl, { credentials: "include" }).catch(() => {});
      // Load mood data for display
      if (neteaseIds.length > 0) {
        const moodUrl = `/api/trpc/mood.forTracks?input=${encodeURIComponent(JSON.stringify({ neteaseIds }))}`;
        fetch(moodUrl, { credentials: "include" })
          .then((r) => r.json())
          .then((data) => {
            const moods = data?.result?.data?.moods;
            if (Array.isArray(moods)) {
              const map = new Map<number, any[]>();
              for (const m of moods) {
                if (!map.has(m.neteaseId)) map.set(m.neteaseId, []);
                map.get(m.neteaseId)!.push(m);
              }
              setTrackMoods(map);
            }
          })
          .catch(() => {});
      }
    } catch {
      showToast("搜索出错了，Claudio 的网线被猫咬断了");
    } finally {
      setIsSearching(false);
      setSearchQuery("");
    }
  };

  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="min-h-screen pb-32 relative overflow-hidden"
    >
      {/* Time-of-day gradient + ambient ----------------- */}
      <div
        className="absolute inset-0 z-0 transition-[background] duration-1000"
        style={{
          background: `linear-gradient(180deg, ${tod.from} 0%, ${tod.via} 45%, ${tod.to} 100%)`,
        }}
      />
      {/* Sun/moon halo */}
      <div
        className="absolute z-0 pointer-events-none transition-opacity duration-700"
        style={{
          top: isNight ? "-40px" : "-80px",
          right: todKey === "dusk" ? "-60px" : todKey === "dawn" ? "-60px" : "30%",
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${tod.accent}55 0%, ${tod.accent}10 45%, transparent 70%)`,
          filter: "blur(8px)",
          opacity: 0.7,
        }}
      />

      {/* Weather-aware overlays */}
      <div className="absolute inset-0 z-0">
        {condition === "rainy" && <RainOverlay />}
        {condition === "snowy" && <SnowOverlay />}
        {(condition === "clear" || condition === "sunny" || condition === "cloudy") && isNight && <StarOverlay />}
      </div>

      {/* Particles bg (audio reactive) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <AudioParticles isActive={isPlaying || isSpeaking} intensity={envVibe?.intensity ?? 0.5} />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          <div className="flex items-center gap-3">
            <img src={djPersona?.avatar} alt="Claudio" className="w-10 h-10 rounded-full border-2 border-white/20 object-cover" />
            <div>
              <span className="font-mono text-lg tracking-[0.15em] text-[#f0f0f5]">Claudio</span>
              <span className="w-2 h-2 rounded-full bg-[#3b82f6] animate-breathe inline-block ml-2" />
              <p className="text-[10px] tracking-[0.18em] uppercase text-[#f0f0f5]/40 mt-0.5">{tod.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <button onClick={logout} className="p-1.5 rounded-full glass text-[#8a8a9a] hover:text-[#ff6b6b] transition-colors ripple" aria-label="退出">
                <LogIn size={14} />
              </button>
            ) : (
              <button onClick={openLoginModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-[#8a8a9a] hover:text-[#3b82f6] transition-colors ripple">
                <User size={12} /> 登录
              </button>
            )}
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-1.5 rounded-full glass text-[#8a8a9a] hover:text-[#f0c040] transition-colors ripple" aria-label="切换主题">
              {theme === "dark" ? <SunIcon size={14} /> : <Moon size={14} />}
            </button>
            <button onClick={() => setShowWeather(!showWeather)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-[#8a8a9a] ripple">
              <WIcon size={13} className="text-[#f0c040]" />
              <span>{weather?.temp ?? 18}°C</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={onSearch} className="mx-4 mb-3">
          <div className="flex items-center gap-2 p-2 rounded-xl glass border border-white/[0.08]">
            <Search size={16} className="text-[#4a4a5a] ml-2" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索网易云音乐... 试试「坂本龙一」" className="flex-1 bg-transparent text-sm text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none py-1" />
            {isSearching && <div className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />}
            <button type="button" onClick={startVoiceInput} className={`p-1.5 rounded-full transition-colors ripple ${isListening ? "bg-[#ff6b6b]/20 text-[#ff6b6b] animate-pulse" : "text-[#8a8a9a] hover:text-[#f0f0f5]"}`} aria-label="语音输入">
              <Mic size={16} />
            </button>
          </div>
        </form>

        {/* Import playlist + Sync */}
        <div className="mx-4 mb-3 flex items-center gap-2">
          {!showImport ? (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-[#8a8a9a] hover:text-[#3b82f6] transition-colors ripple"
            >
              <Plus size={12} />
              导入歌单
            </button>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-xl glass border border-white/[0.08]">
              <input
                type="text"
                value={importPlaylistId}
                onChange={(e) => setImportPlaylistId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onImportPlaylist()}
                placeholder="输入歌单 ID 或链接..."
                className="flex-1 bg-transparent text-xs text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none py-1"
                autoFocus
              />
              {importingPlaylist ? (
                <div className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              ) : (
                <button
                  onClick={onImportPlaylist}
                  disabled={!importPlaylistId.trim()}
                  className="px-2 py-1 rounded-lg bg-[#3b82f6]/20 text-[#3b82f6] text-xs hover:bg-[#3b82f6]/30 transition-colors disabled:opacity-30"
                >
                  导入
                </button>
              )}
              <button
                onClick={() => { setShowImport(false); setImportPlaylistId(""); }}
                className="p-1 rounded-full text-[#4a4a5a] hover:text-[#f0f0f5] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {user && neteaseSession && (
            <button
              onClick={onSyncLikes}
              disabled={syncingLikes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-[#8a8a9a] hover:text-[#60a5fa] transition-colors ripple disabled:opacity-30"
            >
              {syncingLikes ? (
                <div className="w-3 h-3 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              同步喜欢
            </button>
          )}
        </div>

        {/* Search results */}
        <AnimatePresence>
          {showSearchResults && searchResults.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mx-4 mb-3"
            >
              <div className="glass rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] tracking-[0.18em] uppercase text-[#8a8a9a]">
                    搜索结果 · {searchResults.length} 首
                  </p>
                  <button
                    onClick={() => setShowSearchResults(false)}
                    className="p-1 rounded-full text-[#4a4a5a] hover:text-[#f0f0f5] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-hide">
                  {searchResults.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-white/10 transition-colors"
                    >
                      <img
                        src={track.cover || "/cover-if.jpg"}
                        alt={track.title}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#f0f0f5] truncate">{track.title}</p>
                        <p className="text-[11px] text-[#8a8a9a] truncate">{track.artist}</p>
                        {track.neteaseId && trackMoods.has(track.neteaseId) && (
                          <div className="flex gap-1 mt-1">
                            {trackMoods.get(track.neteaseId)!.slice(0, 2).map((m) => (
                              <span
                                key={m.id}
                                className="px-1.5 py-0.5 rounded-full text-[9px] font-medium"
                                style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}30` }}
                              >
                                {m.nameZh}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            playTrack(track);
                            setShowSearchResults(false);
                          }}
                          className="w-8 h-8 rounded-full bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 border border-[#3b82f6]/30 flex items-center justify-center transition-colors"
                          title="播放"
                        >
                          <Play size={13} className="text-[#3b82f6] ml-0.5" />
                        </button>
                        {neteaseSession && track.neteaseId && (
                          <button
                            onClick={() => likeOnNetease(track.neteaseId!, true)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                              track.isFav
                                ? "bg-[#ff6b6b]/15 border border-[#ff6b6b]/30"
                                : "bg-white/5 hover:bg-white/10 border border-white/10"
                            }`}
                            title={track.isFav ? "已喜欢" : "添加到网易云「我喜欢」"}
                          >
                            <Heart size={13} className={track.isFav ? "text-[#ff6b6b] fill-[#ff6b6b]" : "text-[#8a8a9a]"} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            addToQueue(track);
                            showToast(`已添加到播放队列 · ${track.title}`);
                          }}
                          className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                          title="添加到播放列表"
                        >
                          <Plus size={13} className="text-[#8a8a9a]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Weather panel */}
        <AnimatePresence>
          {showWeather && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mx-5 mb-3">
              <div className="glass rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Thermometer size={14} className="text-[#ff6b6b]" />
                  <span className="text-sm text-[#f0f0f5]">{weather?.temp ?? 18}°C</span>
                  <Droplets size={14} className="text-blue-400 ml-3" />
                  <span className="text-sm text-[#8a8a9a]">{weather?.humidity ?? 50}%</span>
                  <Wind size={14} className="text-[#8a8a9a] ml-3" />
                  <span className="text-sm text-[#8a8a9a]">{weather?.wind ?? ""}</span>
                </div>
                <p className="text-sm text-[#8a8a9a]">{weather?.city ?? "Shanghai"} · {weather?.text ?? ""}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mood chips + intensity */}
        <div className="mx-4 mb-3">
          <div className="glass rounded-2xl p-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] tracking-[0.18em] uppercase text-[#8a8a9a]">Mood</p>
                <span className="text-[10px] text-[#4a4a5a]">{envVibe?.mood ?? "Chill"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(backendMoods.length > 0 ? backendMoods : moodOptions.map((m) => ({ name: m, nameZh: m, color: "#6366f1", icon: "" }))).map((m) => {
                  const active = (envVibe?.mood ?? "Chill") === m.name;
                  return (
                    <button
                      key={m.name}
                      onClick={() => setMood(m.name)}
                      className={`px-3 py-1.5 rounded-full text-xs transition-all ripple ${
                        active
                          ? "border"
                          : "bg-white/5 text-[#8a8a9a] border border-white/10 hover:text-[#f0f0f5] hover:border-white/20"
                      }`}
                      style={active ? { background: `${m.color}25`, color: m.color, borderColor: `${m.color}50`, boxShadow: `0 0 18px ${m.color}30` } : undefined}
                    >
                      {m.nameZh}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-[10px] tracking-[0.18em] uppercase text-[#8a8a9a]">Intensity</p>
                <p className="text-xs text-[#a5b4fc] font-mono">{Math.round((envVibe?.intensity ?? 0.5) * 100)}%</p>
              </div>
              <EaseOutSlider
                value={envVibe?.intensity ?? 0.5}
                onChange={setIntensity}
              />
            </div>
          </div>
        </div>

        {/* Big CTAs */}
        <div className="mx-4 mb-4 grid grid-cols-2 gap-3">
          <button
            onClick={toggleRadioMode}
            className="ripple group relative overflow-hidden rounded-2xl px-4 py-4 text-left transition-transform active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(59,130,246,0.08) 100%)",
              border: "1px solid rgba(59,130,246,0.35)",
              boxShadow: "0 8px 28px -10px rgba(59,130,246,0.45)",
            }}
          >
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#3b82f6]/20 blur-2xl group-hover:bg-[#3b82f6]/35 transition-colors" />
            <Radio size={18} className="text-[#3b82f6]" />
            <p className="mt-2 text-sm font-display font-bold text-[#f0f0f5]">{radioMode ? "Radio Live" : "Start the Radio"}</p>
            <p className="text-[10px] text-[#8a8a9a] mt-0.5">tune in, low fidelity</p>
          </button>
          <button
            onClick={() => onNavigate?.("chat")}
            className="ripple group relative overflow-hidden rounded-2xl px-4 py-4 text-left transition-transform active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, rgba(129,140,248,0.20) 0%, rgba(99,102,241,0.06) 100%)",
              border: "1px solid rgba(129,140,248,0.35)",
              boxShadow: "0 8px 28px -10px rgba(129,140,248,0.4)",
            }}
          >
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-indigo-500/25 blur-2xl group-hover:bg-indigo-500/40 transition-colors" />
            <MessageCircle size={18} className="text-indigo-300" />
            <p className="mt-2 text-sm font-display font-bold text-[#f0f0f5]">Talk to Claudio</p>
            <p className="text-[10px] text-[#8a8a9a] mt-0.5">tell him what you feel</p>
          </button>
        </div>

        {/* Clock */}
        <div className="flex flex-col items-center py-3">
          <div className="font-mono text-[clamp(4rem,15vw,7rem)] leading-none text-[#f0f0f5] tracking-wider"
            style={{ textShadow: `0 0 32px ${tod.accent}33` }}>
            <span>{hrs}</span><span className={`inline-block mx-1 transition-opacity ${colonOn ? "opacity-100" : "opacity-30"}`}>:</span><span>{mins}</span>
          </div>
          <p className="text-lg font-display font-medium text-[#f0f0f5] mt-3">{dayName}</p>
          <p className="text-xs tracking-[0.2em] text-[#8a8a9a] uppercase mt-1">{dateStr}</p>
          <div className="flex items-center gap-2 mt-4">
            <span className="w-2 h-2 rounded-full bg-[#3b82f6] animate-breathe" />
            <span className="text-xs tracking-[0.2em] text-[#3b82f6] uppercase">ON AIR</span>
          </div>
        </div>

        {/* Waveform */}
        <div className="px-4 mb-4"><WaveformCanvas isPlaying={isPlaying} color="blue" height={80} /></div>

        {/* Player */}
        {currentTrack && (
          <div className="mx-4 glass rounded-[22px] p-5 space-y-4">
            <div className="flex items-center gap-4">
              <img src={currentTrack.cover || "/cover-if.jpg"} alt={currentTrack.title} className={`w-14 h-14 rounded-xl object-cover transition-transform duration-700 ${isPlaying ? "scale-100" : "scale-95"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-[#f0f0f5] truncate">{currentTrack.title}</p>
                <p className="text-xs text-[#8a8a9a] truncate">{currentTrack.artist}</p>
              </div>
              <div className="flex items-end gap-0.5 h-5">
                {[5, 3, 4].map((h, i) => (
                  <div key={i} className={`w-1 rounded-full bg-[#3b82f6] transition-all duration-300`} style={{ height: isPlaying ? h * 4 : 8, transitionDelay: `${i * 100}ms` }} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button onClick={prevTrack} className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 ripple"><SkipBack size={18} className="text-[#f0f0f5]" /></button>
              <button onClick={togglePlay} className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 animate-pulse-glow ripple">
                {isPlaying ? <Pause size={22} className="text-[#f0f0f5]" /> : <Play size={22} className="text-[#f0f0f5] ml-0.5" />}
              </button>
              <button onClick={nextTrack} className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 ripple"><SkipForward size={18} className="text-[#f0f0f5]" /></button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-[#8a8a9a]"><span>{formatTime(progress)}</span><span>{formatTime(duration || currentTrack.duration || 0)}</span></div>
              <SeekBar progress={progress} duration={duration} onSeek={seekTo} />
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  if (neteaseSession && currentTrack.neteaseId) {
                    likeOnNetease(currentTrack.neteaseId, !currentTrack.isFav);
                  } else {
                    toggleFav(currentTrack.id);
                  }
                }}
                className="text-xs text-[#8a8a9a] hover:text-[#ff6b6b] transition-colors ripple"
              >
                <Heart size={16} className={currentTrack.isFav ? "fill-[#ff6b6b] text-[#ff6b6b]" : ""} />
              </button>
              <div className="flex items-center gap-2">
                <Volume2 size={14} className="text-[#8a8a9a]" />
                <div className="relative w-20 h-[3px] bg-white/10 rounded-full cursor-pointer" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setVolume((e.clientX - rect.left) / rect.width); }}>
                  <div className="absolute top-0 left-0 h-full bg-white rounded-full" style={{ width: `${volume * 100}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow" style={{ left: `${volume * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Queue shortcut */}
        <div onClick={() => onNavigate?.("queue")} className="mx-4 mt-4 flex items-center justify-between px-4 py-3 glass rounded-xl cursor-pointer hover:bg-white/[0.04] transition-colors ripple">
          <span className="text-xs tracking-[0.1em] text-[#8a8a9a] uppercase">QUEUE</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8a8a9a]">{(queue || []).length} TRACKS</span>
            <ChevronRight size={14} className="text-[#4a4a5a]" />
          </div>
        </div>

        {/* DJ preview */}
        {lastMsg && (
          <div onClick={() => onNavigate?.("chat")} className="mx-4 mt-3 glass rounded-xl p-4 cursor-pointer hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <img src={djPersona?.avatar} alt="Claudio" className="w-6 h-6 rounded-full object-cover" />
              <span className="text-xs text-[#3b82f6]">Claudio</span>
              <span className="text-xs text-[#4a4a5a] ml-auto">LIVE</span>
            </div>
            <p className="text-sm text-[#8a8a9a] leading-relaxed">{typeof lastMsg.text === "string" ? lastMsg.text.slice(0, 80) : ""}...</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}


/** Intensity slider — visual ease-out: hard pull at low values, asymptotic at high. */
function EaseOutSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Ease-out fill: visual representation maps linear v -> 1 - (1-v)^2 so the bar fills fast then slows.
  const fillPct = (1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 2)) * 100;
  return (
    <div className="relative h-7 select-none">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${fillPct}%`,
            background: "linear-gradient(90deg, #3b82f6 0%, #818cf8 100%)",
            boxShadow: "0 0 14px rgba(129,140,248,0.45)",
          }}
        />
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute inset-0 w-full h-7 opacity-0 cursor-pointer"
        aria-label="Intensity"
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white pointer-events-none transition-[left] duration-200 ease-out"
        style={{ left: `calc(${fillPct}% - 7px)`, boxShadow: "0 0 10px rgba(255,255,255,0.5)" }}
      />
    </div>
  );
}

/** Seek bar with click and drag support */
function SeekBar({ progress, duration, onSeek }: { progress: number; duration: number; onSeek: (pos: number) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  const handleSeek = (clientX: number) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDragging) handleSeek(e.clientX); };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isDragging, duration]);

  return (
    <div
      ref={barRef}
      className="relative h-[4px] bg-white/10 rounded-full cursor-pointer group"
      onClick={(e) => handleSeek(e.clientX)}
      onMouseDown={(e) => { setIsDragging(true); handleSeek(e.clientX); }}
    >
      <div className="absolute top-0 left-0 h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg transition-opacity"
        style={{ left: `${pct}%`, transform: "translate(-50%, -50%)", opacity: isDragging ? 1 : undefined }}
      />
    </div>
  );
}
