import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Play, Pause, SkipForward, SkipBack, Volume2, Radio, X, ChevronDown, Podcast, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import AudioParticles from "@/components/AudioParticles";

export default function RadioPlayer({ onClose }: { onClose: () => void }) {
  const {
    isPlaying, currentTrack, progress, duration, volume,
    togglePlay, nextTrack, prevTrack, setVolume, seekTo,
    audioAnalyser, lyrics, currentLyricIndex,
    djPersona, envVibe,
    podcastMode, podcastScript, podcastLoading, podcastActiveSegId, togglePodcastMode,
    speakText,
  } = useApp();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const smoothedRef = useRef<Float32Array | null>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  // ---- Tick clock for "now spinning at HH:MM" ----
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Web Audio Real-time Visualizer (high-fidelity, lerped) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let rect = canvas.getBoundingClientRect();
    const sizeCanvas = () => {
      rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(canvas);

    const barCount = 72;
    if (!smoothedRef.current || smoothedRef.current.length !== barCount) {
      smoothedRef.current = new Float32Array(barCount);
    }

    const freqArr = audioAnalyser ? new Uint8Array(audioAnalyser.frequencyBinCount) : null;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const W = rect.width;
      const H = rect.height;
      ctx.clearRect(0, 0, W, H);

      const smoothed = smoothedRef.current!;
      const targets = new Array<number>(barCount);

      if (audioAnalyser && freqArr) {
        audioAnalyser.getByteFrequencyData(freqArr);
        const usable = Math.floor(freqArr.length * 0.78);
        const step = Math.max(1, Math.floor(usable / barCount));
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += freqArr[i * step + j] || 0;
          targets[i] = (sum / step) / 255;
        }
      } else {
        const t = Date.now() * 0.005;
        for (let i = 0; i < barCount; i++) {
          targets[i] = (Math.sin(t + i * 0.3) * 0.5 + 0.5) * (isPlaying ? 0.6 : 0.15);
        }
      }

      for (let i = 0; i < barCount; i++) {
        const tgt = targets[i];
        const cur = smoothed[i];
        const k = tgt > cur ? 0.45 : 0.16;
        smoothed[i] = cur + (tgt - cur) * k;
      }

      const barWidth = (W / barCount) * 0.7;
      const gap = (W / barCount) * 0.3;
      for (let i = 0; i < barCount; i++) {
        const v = smoothed[i];
        const barH = Math.max(3, v * H * 0.9);
        const x = i * (barWidth + gap) + gap / 2;
        const y = H - barH;
        const grad = ctx.createLinearGradient(x, y + barH, x, y);
        grad.addColorStop(0, "rgba(59, 130, 246, 0.12)");
        grad.addColorStop(0.55, "rgba(59, 130, 246, 0.55)");
        grad.addColorStop(1, "rgba(165, 180, 252, 0.95)");
        ctx.fillStyle = grad;
        const r = barWidth / 2;
        ctx.beginPath();
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(x, y, barWidth, barH, [r, r, 0, 0]);
        } else {
          ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [audioAnalyser, isPlaying]);

  // ---- Auto-scroll lyrics smoothly ----
  useEffect(() => {
    if (!lyricsRef.current || lyrics.length === 0) return;
    const active = lyricsRef.current.querySelector(`[data-idx="${currentLyricIndex}"]`) as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLyricIndex, lyrics.length]);

  const fmt = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }, []);

  // ---- Swipe-down to exit (framer-motion drag) ----
  const y = useMotionValue(0);
  const sheetOpacity = useTransform(y, [0, 240], [1, 0.4]);
  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) {
      onClose();
    }
  }, [onClose]);

  const nowSpinning = useMemo(() => {
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }, [now]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[60] flex flex-col"
      style={{ background: "radial-gradient(ellipse at 50% -10%, #0f1a38 0%, #0a0f1a 45%, #060910 100%)" }}
    >
      {/* Particle field */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AudioParticles isActive={isPlaying} intensity={Math.max(0.6, envVibe?.intensity ?? 0.6)} />
      </div>

      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={handleDragEnd}
        style={{ y, opacity: sheetOpacity }}
        className="relative flex-1 flex flex-col"
      >
        {/* Drag handle / Top bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-[#3b82f6]" />
            <span className="text-[10px] tracking-[0.2em] text-[#3b82f6] uppercase">On Air · {nowSpinning}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full glass text-[#8a8a9a] hover:text-[#f0f0f5] transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex justify-center pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Audio Visualizer */}
        <div className="px-6 pt-2 pb-4">
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "120px" }}
            className="block"
          />
        </div>

        {/* Glassmorphism overlay card */}
        <div
          className="flex-1 mx-4 mb-4 rounded-[28px] overflow-hidden flex flex-col relative"
          style={{
            background: "linear-gradient(180deg, rgba(22,22,38,0.78) 0%, rgba(10,10,20,0.85) 100%)",
            backdropFilter: "blur(28px) saturate(1.4)",
            WebkitBackdropFilter: "blur(28px) saturate(1.4)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Cover halo */}
          <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-[120%] h-56 pointer-events-none opacity-40"
            style={{
              background: currentTrack?.cover
                ? `radial-gradient(ellipse at center, rgba(165,180,252,0.35) 0%, transparent 65%)`
                : undefined,
              filter: "blur(40px)",
            }}
          />

          {/* Cover + Info */}
          <div className="p-6 pb-4 relative">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative">
                <img
                  src={currentTrack?.cover || djPersona?.avatar}
                  alt={currentTrack?.title || "Radio"}
                  className={`w-20 h-20 rounded-2xl object-cover shadow-lg transition-transform duration-700 ${isPlaying ? "scale-100" : "scale-95"}`}
                  style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.55)" }}
                />
                {isPlaying && (
                  <div className="absolute -inset-1 rounded-2xl pointer-events-none animate-pulse-glow" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-display font-bold text-[#f0f0f5] truncate" style={{ textShadow: "0 0 18px rgba(165,180,252,0.18)" }}>
                  {currentTrack?.title || "Waiting for the signal..."}
                </h2>
                <p className="text-sm text-[#a5b4fc]/80 truncate mt-0.5">
                  {currentTrack?.artist || "Claudio Radio"}
                </p>
                <p className="text-[10px] tracking-[0.18em] uppercase text-[#8a8a9a]/70 mt-2">
                  Now spinning at {nowSpinning}
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
            <div className="flex items-center justify-center gap-6 mt-5">
              <button onClick={prevTrack} className="w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                <SkipBack size={18} className="text-[#f0f0f5]" />
              </button>
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-[#3b82f6] flex items-center justify-center hover:bg-[#2563eb] transition-colors"
                style={{ boxShadow: "0 6px 28px rgba(59, 130, 246, 0.45)" }}
              >
                {isPlaying ? (
                  <Pause size={24} className="text-[#06060a]" />
                ) : (
                  <Play size={24} className="text-[#06060a] ml-1" />
                )}
              </button>
              <button onClick={nextTrack} className="w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                <SkipForward size={18} className="text-[#f0f0f5]" />
              </button>
            </div>

            {/* Podcast toggle */}
            <div className="flex justify-center mt-4">
              <button
                onClick={togglePodcastMode}
                disabled={podcastLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${
                  podcastMode
                    ? "bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30"
                    : "bg-white/5 text-[#8a8a9a] border border-white/10 hover:bg-white/10"
                }`}
              >
                {podcastLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    生成脚本中...
                  </>
                ) : (
                  <>
                    <Podcast size={14} />
                    {podcastMode ? "播客模式 · ON" : "播客模式"}
                  </>
                )}
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2 mt-5 px-4">
              <Volume2 size={14} className="text-[#8a8a9a]" />
              <div
                className="relative flex-1 h-1 bg-white/10 rounded-full cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setVolume((e.clientX - rect.left) / rect.width);
                }}
              >
                <div className="absolute top-0 left-0 h-full bg-[#3b82f6] rounded-full" style={{ width: `${volume * 100}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow" style={{ left: `${volume * 100}%`, transform: "translate(-50%, -50%)" }} />
              </div>
            </div>
          </div>

          {/* Lyrics / Podcast Transcript Area */}
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-[#16162680] to-transparent z-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#16162680] to-transparent z-10 pointer-events-none" />

            {podcastMode && podcastScript ? (
              <div className="h-full overflow-y-auto px-6 py-10 space-y-6 scrollbar-hide">
                <p className="text-[10px] tracking-[0.2em] text-[#3b82f6] uppercase text-center mb-1">
                  Claudio · Podcast
                  {podcastScript.source === "kimi" && (
                    <span className="ml-2 text-[#3b82f6]/50">· AI 生成</span>
                  )}
                </p>
                {podcastScript.segments.map((seg, idx) => {
                  const isActive = seg.id === podcastActiveSegId;
                  const isPast = podcastScript.segments.some(
                    (s, i) => i > idx && podcastScript.segments[i].id === podcastActiveSegId
                  ) || (podcastActiveSegId && !isActive && seg.startSec < (podcastScript.segments.find(s => s.id === podcastActiveSegId)?.startSec ?? Infinity));
                  return (
                    <div
                      key={seg.id}
                      className={`transition-all duration-500 ${
                        isActive
                          ? "bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] pl-3 -ml-3"
                          : isPast
                          ? "opacity-40"
                          : "opacity-70"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-[#3b82f6]">
                          {Math.floor(seg.startSec / 60)}:{(seg.startSec % 60).toString().padStart(2, "0")}
                        </span>
                        <span className="text-[10px] uppercase text-[#4a4a5a] tracking-wider">{seg.kind}</span>
                      </div>
                      <p
                        className={`text-sm leading-relaxed ${
                          isActive ? "text-[#f0f0f5]" : "text-[#a5b4fc]/80"
                        }`}
                      >
                        {seg.text}
                      </p>
                      {isActive && (
                        <button
                          onClick={() => speakText(seg.text)}
                          className="mt-2 text-[10px] text-[#3b82f6] hover:underline flex items-center gap-1"
                        >
                          <Play size={10} /> 朗读这段
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : podcastMode ? (
              /* P4: Fallback — podcast mode active but no script, show lyrics with podcast header */
              <div className="h-full overflow-y-auto px-6 py-10 space-y-2 scrollbar-hide">
                <p className="text-[10px] tracking-[0.2em] text-[#3b82f6]/40 uppercase text-center mb-6">
                  Claudio · Podcast · 歌词模式
                </p>
                {lyrics.length > 0 ? (
                  lyrics.map((line, idx: number) => {
                    const dist = Math.abs(idx - currentLyricIndex);
                    const isActive = idx === currentLyricIndex;
                    const opacity = isActive ? 1 : Math.max(0.18, 0.62 - dist * 0.14);
                    return (
                      <div
                        key={idx}
                        data-idx={idx}
                        className={`text-center transition-all duration-500 ${
                          isActive
                            ? "text-[#f0f0f5] text-lg font-medium"
                            : "text-[#a5b4fc]/70 text-sm"
                        }`}
                        style={{
                          opacity,
                          transform: isActive ? "scale(1.04)" : "scale(1)",
                          textShadow: isActive ? "0 0 22px rgba(165,180,252,0.35)" : undefined,
                        }}
                      >
                        {line.text}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-[#8a8a9a]/60 text-sm py-12">
                    脚本生成中 · 请稍候
                  </div>
                )}
              </div>
            ) : (
              <div
                ref={lyricsRef}
                className="h-full overflow-y-auto px-6 py-10 space-y-5 scrollbar-hide"
              >
                {lyrics.length > 0 ? (
                  lyrics.map((line, idx: number) => {
                    const dist = Math.abs(idx - currentLyricIndex);
                    const isActive = idx === currentLyricIndex;
                    const opacity = isActive ? 1 : Math.max(0.18, 0.62 - dist * 0.14);
                    return (
                      <div
                        key={idx}
                        data-idx={idx}
                        className={`text-center transition-all duration-500 ${
                          isActive
                            ? "text-[#f0f0f5] text-lg font-medium"
                            : "text-[#a5b4fc]/70 text-sm"
                        }`}
                        style={{
                          opacity,
                          transform: isActive ? "scale(1.04)" : "scale(1)",
                          textShadow: isActive ? "0 0 22px rgba(165,180,252,0.35)" : undefined,
                        }}
                      >
                        {line.text}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-[#8a8a9a]/60 text-sm py-12">
                    {currentTrack ? "纯音乐 · 让频率替你说话" : "选择一首歌开始播放"}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Swipe hint */}
          <div className="flex items-center justify-center gap-1 py-3 text-[10px] tracking-[0.18em] uppercase text-[#8a8a9a]/40">
            <ChevronDown size={11} className="opacity-60" />
            <span>Swipe down to exit</span>
          </div>
        </div>
      </motion.div>
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
      className="relative h-[4px] bg-white/10 rounded-full cursor-pointer"
      onClick={(e) => handleSeek(e.clientX)}
      onMouseDown={(e) => { setIsDragging(true); handleSeek(e.clientX); }}
      onTouchStart={(e) => { setIsDragging(true); handleSeek(e.touches[0].clientX); }}
      onTouchMove={(e) => { if (isDragging) handleSeek(e.touches[0].clientX); }}
      onTouchEnd={() => setIsDragging(false)}
    >
      <div className="absolute top-0 left-0 h-full bg-[#3b82f6] rounded-full" style={{ width: `${pct}%` }} />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg"
        style={{ left: `${pct}%`, transform: "translate(-50%, -50%)", opacity: isDragging ? 1 : 0.85 }}
      />
    </div>
  );
}
