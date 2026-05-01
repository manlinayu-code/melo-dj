import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Heart, GripVertical } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import WaveformCanvas from '@/components/WaveformCanvas';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Queue() {
  const {
    isPlaying, currentTrack, progress, duration, queue,
    togglePlay, nextTrack, prevTrack, toggleFav, reorderQueue, playTrack,
  } = useApp();

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="min-h-screen pb-32"
    >
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="font-display text-2xl font-bold text-melo-text">播放队列</h1>
        <p className="text-sm text-melo-text-secondary mt-1">UP NEXT · {queue.length} TRACKS</p>
      </div>

      {/* Now Playing Card */}
      {currentTrack && (
        <div className="mx-4 mb-6 relative overflow-hidden rounded-[22px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${currentTrack.cover})`, filter: 'blur(40px) brightness(0.3)' }}
          />
          <div className="relative glass-strong rounded-[22px] p-5">
            <div className="absolute top-4 left-4 px-2 py-1 rounded-md bg-melo-green text-melo-base text-[10px] font-bold tracking-wider">
              NOW PLAYING
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-5 mt-6">
              <motion.div
                key={currentTrack.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="relative shrink-0"
              >
                <img
                  src={currentTrack.cover}
                  alt={currentTrack.title}
                  className="w-40 h-40 rounded-xl object-cover shadow-lg"
                  style={{ boxShadow: '0 0 30px rgba(0, 208, 132, 0.15)' }}
                />
                {isPlaying && <div className="absolute inset-0 rounded-xl border-2 border-melo-green/40 animate-pulse-glow" />}
              </motion.div>
              <div className="flex-1 w-full">
                <motion.h2
                  key={currentTrack.id + '-title'}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-2xl font-display font-bold text-melo-text"
                >
                  {currentTrack.title}
                </motion.h2>
                <motion.p
                  key={currentTrack.id + '-artist'}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-sm text-melo-text-secondary mt-1"
                >
                  {currentTrack.artist}
                </motion.p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {currentTrack.genre.map((g) => (
                    <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-melo-text-secondary border border-white/5">{g}</span>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-melo-text-secondary mb-1">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration || currentTrack.duration)}</span>
                  </div>
                  <div className="relative h-1 bg-white/10 rounded-full">
                    <div className="absolute top-0 left-0 h-full bg-melo-green rounded-full" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button onClick={prevTrack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <SkipBack size={16} />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-melo-green flex items-center justify-center hover:bg-melo-green-dark transition-colors"
                  >
                    {isPlaying ? <Pause size={18} className="text-melo-base" /> : <Play size={18} className="text-melo-base ml-0.5" />}
                  </button>
                  <button onClick={nextTrack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <SkipForward size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mb-4">
        <WaveformCanvas isPlaying={isPlaying} color="green" height={40} barCount={60} />
      </div>

      {/* Queue list */}
      <div className="mx-4 space-y-0">
        {queue.map((track, index) => (
          <motion.div
            key={track.id}
            layout
            draggable
            onDragStart={() => setDraggingIndex(index)}
            onDragOver={(e) => { e.preventDefault(); if (draggingIndex !== null && draggingIndex !== index) { reorderQueue(draggingIndex, index); setDraggingIndex(index); } }}
            onDrop={() => setDraggingIndex(null)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => playTrack(track)}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 cursor-pointer ${
              draggingIndex === index ? 'opacity-60 bg-white/5 shadow-lg' : 'hover:bg-white/[0.03]'
            }`}
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
          >
            <div className="w-6 flex items-center justify-center shrink-0">
              {hoveredIndex === index ? <Play size={14} className="text-melo-green" /> : (
                <span className="text-xs text-melo-text-dim font-mono">{(index + 1).toString().padStart(2, '0')}</span>
              )}
            </div>
            <img src={track.cover} alt={track.title} className="w-12 h-12 rounded-lg object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-melo-text truncate font-medium">{track.title}</p>
              <p className="text-xs text-melo-text-secondary truncate">{track.artist}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-melo-text-dim font-mono">{formatTime(track.duration)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleFav(track.id); }}
                className={`transition-all duration-200 ${hoveredIndex === index ? 'opacity-100' : 'opacity-0'}`}
              >
                <Heart size={14} className={track.isFav ? 'fill-melo-warm text-melo-warm' : 'text-melo-text-secondary'} />
              </button>
              <GripVertical size={14} className="text-melo-text-dim cursor-grab active:cursor-grabbing" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
