import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Heart, Volume2, CloudRain, Cloud, Sun as SunIcon, Snowflake, Wind, Search, Radio, Thermometer, Droplets, Zap, Mic, ChevronRight, User, LogIn, Moon } from "lucide-react";
import { useApp } from "@/context/AppContext";
import WaveformCanvas from "@/components/WaveformCanvas";
import AudioParticles from "@/components/AudioParticles";

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const moodOptions = ["Moody", "Chill", "Energetic", "Melancholy", "Dreamy", "Focus"];

export default function Home({ onNavigate }: { onNavigate?: (v: "home" | "queue" | "chat" | "profile") => void }) {
  const {
    isPlaying, currentTrack, progress, duration, volume, queue, messages,
    togglePlay, setVolume, nextTrack, prevTrack, toggleFav,
    weather, djPersona, toggleRadioMode, radioMode, envVibe,
    setMood, setIntensity, setImmersed, searchAndPlay, startVoiceInput,
    isSpeaking, isListening,
    user, openLoginModal, logout, theme, setTheme, seekTo,
  } = useApp();

  const [time, setTime] = useState(new Date());
  const [showWeather, setShowWeather] = useState(false);
  const [showEnv, setShowEnv] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [colonOn, setColonOn] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const c = setInterval(() => setColonOn((v) => !v), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, []);

  const hrs = time.getHours().toString().padStart(2, "0");
  const mins = time.getMinutes().toString().padStart(2, "0");
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][time.getDay()];
  const dateStr = `${time.getDate().toString().padStart(2, "0")} ${time.toLocaleString("en", { month: "short" }).toUpperCase()} ${time.getFullYear()}`;

  const WIcon = weather?.condition === "rainy" ? CloudRain : weather?.condition === "sunny" ? Sun : weather?.condition === "snowy" ? Snowflake : weather?.condition === "windy" ? Wind : Cloud;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    await searchAndPlay(searchQuery);
    setIsSearching(false);
    setSearchQuery("");
  };

  // Safely get last message
  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen pb-32 relative"
    >
      {/* Particles bg */}
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
              <span className="w-2 h-2 rounded-full bg-[#00d084] animate-breathe inline-block ml-2" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8a8a9a]">{user.name}</span>
                <button onClick={logout} className="p-1.5 rounded-full glass text-[#8a8a9a] hover:text-[#ff6b6b] transition-colors">
                  <LogIn size={14} />
                </button>
              </div>
            ) : (
              <button onClick={openLoginModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-[#8a8a9a] hover:text-[#00d084] transition-colors">
                <User size={12} /> 登录
              </button>
            )}
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-1.5 rounded-full glass text-[#8a8a9a] hover:text-[#f0c040] transition-colors">
              {theme === "dark" ? <SunIcon size={14} /> : <Moon size={14} />}
            </button>
            <button onClick={toggleRadioMode} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${radioMode ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "glass text-[#8a8a9a]"}`}>
              <Radio size={12} />{radioMode ? "ON AIR" : "Radio"}
            </button>
            <button onClick={() => setShowWeather(!showWeather)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-[#8a8a9a]">
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
            {isSearching && <div className="w-4 h-4 border-2 border-[#00d084] border-t-transparent rounded-full animate-spin" />}
            <button type="button" onClick={startVoiceInput} className={`p-1.5 rounded-full transition-colors ${isListening ? "bg-[#ff6b6b]/20 text-[#ff6b6b] animate-pulse" : "text-[#8a8a9a] hover:text-[#f0f0f5]"}`}>
              <Mic size={16} />
            </button>
          </div>
        </form>

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

        {/* Env panel */}
        <div className="mx-4 mb-3">
          <button onClick={() => setShowEnv(!showEnv)} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl glass text-xs text-[#8a8a9a]">
            <div className="flex items-center gap-3"><Zap size={14} /><span>环境: {envVibe?.mood ?? "Chill"} · {Math.round((envVibe?.intensity ?? 0.5) * 100)}%</span></div>
            <span className="text-[#4a4a5a]">{showEnv ? "收起" : "调整"}</span>
          </button>
          <AnimatePresence>
            {showEnv && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="glass rounded-xl p-4 mt-2 space-y-3">
                  <div>
                    <p className="text-xs text-[#4a4a5a] mb-2">Mood</p>
                    <div className="flex flex-wrap gap-2">
                      {moodOptions.map((m) => (
                        <button key={m} onClick={() => setMood(m)} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${(envVibe?.mood === m) ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-white/5 text-[#8a8a9a] border border-white/5"}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><p className="text-xs text-[#4a4a5a]">强度</p><p className="text-xs text-[#8a8a9a]">{Math.round((envVibe?.intensity ?? 0.5) * 100)}%</p></div>
                    <input type="range" min="0" max="1" step="0.05" value={envVibe?.intensity ?? 0.5}
                      onChange={(e) => setIntensity(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#00d084]" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8a8a9a]">沉浸模式 (呼吸球)</span>
                    <button onClick={() => setImmersed(!(envVibe?.immersed ?? false))} className={`w-10 h-5 rounded-full transition-colors relative ${(envVibe?.immersed ?? false) ? "bg-indigo-500/50" : "bg-white/10"}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${(envVibe?.immersed ?? false) ? "left-5" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Clock */}
        <div className="flex flex-col items-center py-3">
          {(envVibe?.immersed ?? false) ? (
            <div className="py-8 text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/20 animate-pulse mx-auto" style={{ boxShadow: "0 0 60px rgba(129,140,244,0.2)" }} />
              <p className="text-xs text-[#4a4a5a] mt-4">沉浸模式 · 点击环境面板关闭</p>
            </div>
          ) : (
            <>
              <div className="font-mono text-[clamp(4rem,15vw,7rem)] leading-none text-[#f0f0f5] tracking-wider">
                <span>{hrs}</span><span className={`inline-block mx-1 transition-opacity ${colonOn ? "opacity-100" : "opacity-30"}`}>:</span><span>{mins}</span>
              </div>
              <p className="text-lg font-display font-medium text-[#f0f0f5] mt-3">{dayName}</p>
              <p className="text-xs tracking-[0.2em] text-[#8a8a9a] uppercase mt-1">{dateStr}</p>
              <div className="flex items-center gap-2 mt-4">
                <span className="w-2 h-2 rounded-full bg-[#00d084] animate-breathe" />
                <span className="text-xs tracking-[0.2em] text-[#00d084] uppercase">ON AIR</span>
              </div>
            </>
          )}
        </div>

        {/* Waveform */}
        <div className="px-4 mb-4"><WaveformCanvas isPlaying={isPlaying} color="green" height={80} /></div>

        {/* Player */}
        {currentTrack && (
          <div className="mx-4 glass rounded-[22px] p-5 space-y-4">
            <div className="flex items-center gap-4">
              <img src={currentTrack.cover || "/cover-if.jpg"} alt={currentTrack.title} className="w-14 h-14 rounded-xl object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-[#f0f0f5] truncate">{currentTrack.title}</p>
                <p className="text-xs text-[#8a8a9a] truncate">{currentTrack.artist}</p>
              </div>
              <div className="flex items-end gap-0.5 h-5">
                {[5, 3, 4].map((h, i) => (
                  <div key={i} className={`w-1 rounded-full bg-[#00d084] transition-all duration-300 ${isPlaying ? `h-${h}` : "h-2"}`} style={{ height: isPlaying ? h * 4 : 8, transitionDelay: `${i * 100}ms` }} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button onClick={prevTrack} className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10"><SkipBack size={18} className="text-[#f0f0f5]" /></button>
              <button onClick={togglePlay} className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 animate-pulse-glow">
                {isPlaying ? <Pause size={22} className="text-[#f0f0f5]" /> : <Play size={22} className="text-[#f0f0f5] ml-0.5" />}
              </button>
              <button onClick={nextTrack} className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10"><SkipForward size={18} className="text-[#f0f0f5]" /></button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-[#8a8a9a]"><span>{formatTime(progress)}</span><span>{formatTime(duration || currentTrack.duration || 0)}</span></div>
              <SeekBar progress={progress} duration={duration} onSeek={seekTo} />
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => toggleFav(currentTrack.id)} className="text-xs text-[#8a8a9a] hover:text-[#ff6b6b] transition-colors"><Heart size={16} className={currentTrack.isFav ? "fill-[#ff6b6b] text-[#ff6b6b]" : ""} /></button>
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
        <div onClick={() => onNavigate?.("queue")} className="mx-4 mt-4 flex items-center justify-between px-4 py-3 glass rounded-xl cursor-pointer hover:bg-white/[0.04] transition-colors">
          <span className="text-xs tracking-[0.1em] text-[#8a8a9a] uppercase">QUEUE</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8a8a9a]">{(queue || []).length} TRACKS</span>
            <ChevronRight size={14} className="text-[#4a4a5a]" />
          </div>
        </div>

        {/* DJ preview */}
        {lastMsg && (
          <div className="mx-4 mt-3 glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <img src={djPersona?.avatar} alt="Claudio" className="w-6 h-6 rounded-full object-cover" />
              <span className="text-xs text-[#00d084]">Claudio</span>
              <span className="text-xs text-[#4a4a5a] ml-auto">LIVE</span>
            </div>
            <p className="text-sm text-[#8a8a9a] leading-relaxed">{typeof lastMsg.text === "string" ? lastMsg.text.slice(0, 80) : ""}...</p>
          </div>
        )}
      </div>
    </motion.div>
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
