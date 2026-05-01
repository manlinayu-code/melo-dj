import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Heart, GripVertical } from "lucide-react";
import { useApp } from "@/context/AppContext";
import WaveformCanvas from "@/components/WaveformCanvas";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Queue() {
  const {
    isPlaying, currentTrack, progress, duration, queue,
    togglePlay, nextTrack, prevTrack, toggleFav, playTrack, reorderQueue,
  } = useApp();

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const safeQueue = queue || [];
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }} className="min-h-screen pb-32"
    >
      <div className="px-5 pt-6 pb-4">
        <h1 className="font-display text-2xl font-bold text-[#f0f0f5]">播放队列</h1>
        <p className="text-sm text-[#8a8a9a] mt-1">UP NEXT · {safeQueue.length} TRACKS</p>
      </div>

      {/* Now Playing */}
      {currentTrack && (
        <div className="mx-4 mb-6 relative overflow-hidden rounded-[22px]">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${currentTrack.cover || "/cover-if.jpg"})`, filter: "blur(40px) brightness(0.3)" }} />
          <div className="relative glass-strong rounded-[22px] p-5">
            <div className="absolute top-4 left-4 px-2 py-1 rounded-md bg-[#00d084] text-[#06060a] text-[10px] font-bold tracking-wider">NOW PLAYING</div>
            <div className="flex flex-col sm:flex-row items-center gap-5 mt-6">
              <motion.div key={currentTrack.id} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }} className="relative shrink-0">
                <img src={currentTrack.cover || "/cover-if.jpg"} alt={currentTrack.title} className="w-40 h-40 rounded-xl object-cover shadow-lg" style={{ boxShadow: "0 0 30px rgba(0,208,132,0.15)" }} />
                {isPlaying && <div className="absolute inset-0 rounded-xl border-2 border-[#00d084]/40 animate-pulse-glow" />}
              </motion.div>
              <div className="flex-1 w-full">
                <motion.h2 key={`${currentTrack.id}-t`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-2xl font-display font-bold text-[#f0f0f5]">{currentTrack.title}</motion.h2>
                <motion.p key={`${currentTrack.id}-a`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-sm text-[#8a8a9a] mt-1">{currentTrack.artist}</motion.p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(currentTrack.genre || []).map((g) => (
                    <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-[#8a8a9a] border border-white/5">{g}</span>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-[#8a8a9a] mb-1"><span>{fmt(progress)}</span><span>{fmt(duration || currentTrack.duration || 0)}</span></div>
                  <div className="relative h-1 bg-white/10 rounded-full"><div className="absolute top-0 left-0 h-full bg-[#00d084] rounded-full" style={{ width: `${progressPct}%` }} /></div>
                </div>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button onClick={prevTrack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10"><SkipBack size={16} /></button>
                  <button onClick={togglePlay} className="w-12 h-12 rounded-full bg-[#00d084] flex items-center justify-center hover:bg-[#00a86b]">
                    {isPlaying ? <Pause size={18} className="text-[#06060a]" /> : <Play size={18} className="text-[#06060a] ml-0.5" />}
                  </button>
                  <button onClick={nextTrack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10"><SkipForward size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mb-4"><WaveformCanvas isPlaying={isPlaying} color="green" height={40} barCount={60} /></div>

      {/* Queue list */}
      <div className="mx-4 space-y-0">
        {safeQueue.map((track, index) => {
          if (!track) return null;
          return (
            <motion.div
              key={track.id || index} layout draggable
              onDragStart={() => setDragIdx(index)}
              onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== index) setDragOverIdx(index); }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={() => { if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) { reorderQueue(dragIdx, dragOverIdx); } setDragIdx(null); setDragOverIdx(null); }}
              onMouseEnter={() => setHoverIdx(index)} onMouseLeave={() => setHoverIdx(null)}
              onClick={() => playTrack(track)}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer ${dragIdx === index ? "opacity-60 bg-white/5" : dragOverIdx === index ? "bg-white/[0.06] border-t-2 border-[#00d084]/50" : "hover:bg-white/[0.03]"}`}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="w-6 flex items-center justify-center shrink-0">
                {hoverIdx === index ? <Play size={14} className="text-[#00d084]" /> : <span className="text-xs text-[#4a4a5a] font-mono">{(index + 1).toString().padStart(2, "0")}</span>}
              </div>
              <img src={track.cover || "/cover-if.jpg"} alt={track.title} className="w-12 h-12 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#f0f0f5] truncate font-medium">{track.title || "未知"}</p>
                <p className="text-xs text-[#8a8a9a] truncate">{track.artist || "未知"}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[#4a4a5a] font-mono">{fmt(track.duration || 0)}</span>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(track.id); }} className={`transition-all ${hoverIdx === index ? "opacity-100" : "opacity-0"}`}>
                  <Heart size={14} className={track.isFav ? "fill-[#ff6b6b] text-[#ff6b6b]" : "text-[#8a8a9a]"} />
                </button>
                <GripVertical size={14} className="text-[#4a4a5a] cursor-grab" />
              </div>
            </motion.div>
          );
        })}
        {safeQueue.length === 0 && (
          <div className="text-center py-12 text-[#4a4a5a] text-sm">队列为空 · 去搜索点音乐吧</div>
        )}
      </div>
    </motion.div>
  );
}
