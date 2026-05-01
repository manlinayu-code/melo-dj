import { useEffect, useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, SkipForward, SkipBack, Volume2, Radio, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
// LyricLine type inlined to avoid import issues
interface LyricLine {
  time: number;
  text: string;
}

export default function RadioPlayer({ onClose }: { onClose: () => void }) {
  const {
    isPlaying, currentTrack, progress, duration, volume,
    togglePlay, nextTrack, prevTrack, setVolume, seekTo,
    audioAnalyser, lyrics, currentLyricIndex,
    djPersona,
  } = useApp();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lyricsRef = useRef<HTMLDivElement>(null);

  // ---- Web Audio Real-time Visualizer ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioAnalyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      audioAnalyser.getByteFrequencyData(dataArray);

      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      ctx.clearRect(0, 0, W, H);

      const barCount = 64;
      const barWidth = (W / barCount) * 0.7;
      const gap = (W / barCount) * 0.3;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[i * step + j];
        }
        const avg = sum / step;
        const pct = avg / 255;
        const barH = Math.max(4, pct * H * 0.9);

        const x = i * (barWidth + gap) + gap / 2;
        const y = H - barH;

        const gradient = ctx.createLinearGradient(x, y + barH, x, y);
        gradient.addColorStop(0, "rgba(0, 208, 132, 0.15)");
        gradient.addColorStop(0.6, "rgba(0, 208, 132, 0.5)");
        gradient.addColorStop(1, "rgba(0, 208, 132, 0.9)");

        ctx.fillStyle = gradient;
        const r = barWidth / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [r, r, 0, 0]);
        ctx.fill();
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [audioAnalyser]);

  // ---- Auto-scroll lyrics ----
  useEffect(() => {
    if (lyricsRef.current && lyrics.length > 0) {
      const active = lyricsRef.current.querySelector(`[data-idx="${currentLyricIndex}"]`);
      if (active) {
        active.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentLyricIndex, lyrics.length]);

  const fmt = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }, []);

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: "linear-gradient(180deg, #0a0a12 0%, #06060a 100%)" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-[#00d084]" />
          <span className="text-[10px] tracking-[0.2em] text-[#00d084] uppercase">Radio Mode</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full glass text-[#8a8a9a] hover:text-[#f0f0f5] transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Audio Visualizer */}
      <div className="px-6 pt-2 pb-4">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "120px" }}
          className="block"
        />
      </div>

      {/* Main Card */}
      <div className="flex-1 mx-4 mb-4 rounded-[28px] bg-white dark:bg-[#f5f5fa] shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "#f8f8fc" }}
      >
        {/* Cover + Info */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-4 mb-4">
            <img
              src={currentTrack?.cover || djPersona?.avatar}
              alt={currentTrack?.title || "Radio"}
              className="w-20 h-20 rounded-2xl object-cover shadow-lg"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-display font-bold text-[#1a1a2e] truncate">
                {currentTrack?.title || "Waiting..."}
              </h2>
              <p className="text-sm text-[#4a4a5a] truncate mt-0.5">
                {currentTrack?.artist || "Claudio Radio"}
              </p>
              <p className="text-xs text-[#8a8a9a] mt-1">
                {currentTrack?.album || "Late Night Session"}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <SeekBar progress={progress} duration={duration} onSeek={seekTo} />
            <div className="flex justify-between text-[10px] text-[#8a8a9a] font-mono">
              <span>{fmt(progress)}</span>
              <span>{fmt(duration || currentTrack?.duration || 0)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-6 mt-4">
            <button onClick={prevTrack} className="w-11 h-11 rounded-full bg-[#1a1a2e]/5 flex items-center justify-center hover:bg-[#1a1a2e]/10 transition-colors">
              <SkipBack size={18} className="text-[#1a1a2e]" />
            </button>
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-[#00d084] flex items-center justify-center hover:bg-[#00a86b] transition-colors shadow-lg"
              style={{ boxShadow: "0 4px 20px rgba(0, 208, 132, 0.3)" }}
            >
              {isPlaying ? (
                <Pause size={24} className="text-white" />
              ) : (
                <Play size={24} className="text-white ml-1" />
              )}
            </button>
            <button onClick={nextTrack} className="w-11 h-11 rounded-full bg-[#1a1a2e]/5 flex items-center justify-center hover:bg-[#1a1a2e]/10 transition-colors">
              <SkipForward size={18} className="text-[#1a1a2e]" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 mt-4 px-4">
            <Volume2 size={14} className="text-[#8a8a9a]" />
            <div
              className="relative flex-1 h-1 bg-[#e8e8f0] rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setVolume((e.clientX - rect.left) / rect.width);
              }}
            >
              <div className="absolute top-0 left-0 h-full bg-[#00d084] rounded-full" style={{ width: `${volume * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Lyrics Area */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-[#f8f8fc] to-transparent z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#f8f8fc] to-transparent z-10 pointer-events-none" />

          <div
            ref={lyricsRef}
            className="h-full overflow-y-auto px-6 py-8 space-y-4 scrollbar-hide"
          >
            {lyrics.length > 0 ? (
              lyrics.map((line, idx: number) => {
                const isActive = idx === currentLyricIndex;
                const isPast = idx < currentLyricIndex;
                return (
                  <div
                    key={idx}
                    data-idx={idx}
                    className={`text-center transition-all duration-500 ${
                      isActive
                        ? "text-[#1a1a2e] text-lg font-medium scale-105"
                        : isPast
                          ? "text-[#8a8a9a]/40 text-sm"
                          : "text-[#8a8a9a]/60 text-sm"
                    }`}
                  >
                    {line.text}
                  </div>
                );
              })
            ) : (
              <div className="text-center text-[#8a8a9a]/50 text-sm py-12">
                {currentTrack ? "纯音乐，无歌词" : "选择一首歌开始播放"}
              </div>
            )}
          </div>
        </div>
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
      className="relative h-[4px] bg-[#e8e8f0] rounded-full cursor-pointer"
      onClick={(e) => handleSeek(e.clientX)}
      onMouseDown={(e) => { setIsDragging(true); handleSeek(e.clientX); }}
    >
      <div className="absolute top-0 left-0 h-full bg-[#00d084] rounded-full transition-all" style={{ width: `${pct}%` }} />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-[#00d084] rounded-full shadow-lg"
        style={{ left: `${pct}%`, transform: "translate(-50%, -50%)", opacity: isDragging ? 1 : 0.8 }}
      />
    </div>
  );
}
