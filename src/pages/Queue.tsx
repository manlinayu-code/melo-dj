import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Heart,
  Trash2, ArrowUp, ArrowDown, GripVertical,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import WaveformCanvas from "@/components/WaveformCanvas";
import type { Track, ViewType } from "@/types";

const QUEUE_LS_KEY = "melo_queue";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

async function trpcPost(procedure: string, input: Record<string, unknown>) {
  const token = localStorage.getItem("melo_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST", headers, credentials: "include",
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) return null;
  return json.result?.data;
}

function trackToQueueItem(t: Track) {
  return {
    trackId: t.id,
    neteaseId: t.neteaseId,
    trackTitle: t.title,
    artist: t.artist,
    album: t.album,
    coverUrl: t.cover,
    durationSec: t.duration,
  };
}

export default function Queue({ onNavigate }: { onNavigate?: (v: ViewType) => void }) {
  const {
    isPlaying, currentTrack, progress, duration, queue,
    togglePlay, nextTrack, prevTrack, toggleFav, playTrack,
    reorderQueue, removeFromQueue, user,
    likeOnNetease, neteaseSession,
  } = useApp();

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const safeQueue = queue || [];
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const lastSyncedRef = useRef<string>("");

  // Persist queue: server for authed users, localStorage for anonymous
  useEffect(() => {
    const signature = JSON.stringify(safeQueue.map((t) => t.id));
    if (signature === lastSyncedRef.current) return;
    lastSyncedRef.current = signature;

    if (user) {
      trpcPost("playlist.setQueue", {
        items: safeQueue.map(trackToQueueItem),
      }).catch(() => {});
    } else {
      try {
        localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(safeQueue));
      } catch {}
    }
  }, [safeQueue, user]);

  // Server-side hydration is handled via AppContext on app boot (follow-up).
  // Anonymous users hydrate from localStorage there as well.
  // This effect is intentionally left out to avoid double-loading.

  const handleReorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= safeQueue.length || to >= safeQueue.length) return;
    reorderQueue(from, to);
    if (user) {
      trpcPost("playlist.reorderQueue", { fromIndex: from, toIndex: to }).catch(() => {});
    }
  };

  const handleMoveUp = (i: number) => handleReorder(i, i - 1);
  const handleMoveDown = (i: number) => handleReorder(i, i + 1);

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
            <div className="absolute top-4 left-4 px-2 py-1 rounded-md bg-[#3b82f6] text-[#06060a] text-[10px] font-bold tracking-wider">NOW PLAYING</div>
            <div className="flex flex-col sm:flex-row items-center gap-5 mt-6">
              <motion.div key={currentTrack.id} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }} className="relative shrink-0">
                <img src={currentTrack.cover || "/cover-if.jpg"} alt={currentTrack.title} className="w-40 h-40 rounded-xl object-cover shadow-lg" style={{ boxShadow: "0 0 30px rgba(59,130,246,0.15)" }} />
                {isPlaying && <div className="absolute inset-0 rounded-xl border-2 border-[#3b82f6]/40 animate-pulse-glow" />}
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
                  <div className="relative h-1 bg-white/10 rounded-full"><div className="absolute top-0 left-0 h-full bg-[#3b82f6] rounded-full" style={{ width: `${progressPct}%` }} /></div>
                </div>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button onClick={prevTrack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10"><SkipBack size={16} /></button>
                  <button onClick={togglePlay} className="w-12 h-12 rounded-full bg-[#3b82f6] flex items-center justify-center hover:bg-[#2563eb]">
                    {isPlaying ? <Pause size={18} className="text-[#06060a]" /> : <Play size={18} className="text-[#06060a] ml-0.5" />}
                  </button>
                  <button onClick={nextTrack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10"><SkipForward size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mb-4"><WaveformCanvas isPlaying={isPlaying} color="blue" height={40} barCount={60} /></div>

      {/* Queue list */}
      <div className="mx-4 space-y-0">
        {safeQueue.map((track, index) => {
          if (!track) return null;
          const isLast = index === safeQueue.length - 1;
          const isFirst = index === 0;
          return (
            <motion.div
              key={track.id || index} layout draggable
              onDragStart={() => setDragIdx(index)}
              onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== index) setDragOverIdx(index); }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={() => {
                if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
                  handleReorder(dragIdx, dragOverIdx);
                }
                setDragIdx(null); setDragOverIdx(null);
              }}
              className={`flex items-center gap-2 px-2 py-3 rounded-xl transition-all ${
                dragIdx === index ? "opacity-60 bg-white/5"
                : dragOverIdx === index ? "bg-white/[0.06] border-t-2 border-[#3b82f6]/50"
                : "hover:bg-white/[0.03]"
              }`}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="w-6 flex items-center justify-center shrink-0">
                <span className="text-xs text-[#4a4a5a] font-mono">{(index + 1).toString().padStart(2, "0")}</span>
              </div>
              <button
                onClick={() => playTrack(track)}
                className="shrink-0 relative group"
                aria-label="Play now"
              >
                <img src={track.cover || "/cover-if.jpg"} alt={track.title} className="w-12 h-12 rounded-lg object-cover" />
                <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Play size={16} className="text-[#3b82f6]" />
                </div>
              </button>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => playTrack(track)}>
                <p className="text-sm text-[#f0f0f5] truncate font-medium">{track.title || "未知"}</p>
                <p className="text-xs text-[#8a8a9a] truncate">{track.artist || "未知"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleMoveUp(index); }}
                  disabled={isFirst}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8a9a] disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleMoveDown(index); }}
                  disabled={isLast}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8a9a] disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (neteaseSession && track.neteaseId) {
                      likeOnNetease(track.neteaseId, !track.isFav);
                    } else {
                      toggleFav(track.id);
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/5"
                  aria-label="Favorite"
                >
                  <Heart size={13} className={track.isFav ? "fill-[#ff6b6b] text-[#ff6b6b]" : "text-[#8a8a9a]"} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFromQueue(track.id); }}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8a9a] hover:text-[#ff6b6b]"
                  aria-label="Remove"
                >
                  <Trash2 size={13} />
                </button>
                <GripVertical size={13} className="text-[#4a4a5a] cursor-grab ml-0.5 hidden sm:block" />
              </div>
            </motion.div>
          );
        })}
        {safeQueue.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-[#8a8a9a] mb-3">队列为空</p>
            <button
              onClick={() => onNavigate?.("chat")}
              className="px-5 py-2.5 rounded-xl bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 text-sm hover:bg-[#3b82f6]/25 transition-colors"
            >
              Ask Claudio for a recommendation
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
