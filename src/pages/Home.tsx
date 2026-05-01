import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Square, Heart, Volume2, CloudRain, Cloud, Sun, Snowflake, Wind, Search, Radio, Monitor, Thermometer, Droplets, Zap } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import WaveformCanvas from '@/components/WaveformCanvas';
import AudioParticles from '@/components/AudioParticles';
import BreathingOrb from '@/components/BreathingOrb';
import SubtitleOverlay from '@/components/SubtitleOverlay';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const moodOptions = ['Moody', 'Chill', 'Energetic', 'Melancholy', 'Dreamy', 'Focus'];
const intensityMarks = [0.2, 0.5, 0.8];

export default function Home() {
  const {
    isPlaying, currentTrack, progress, duration, volume, queue,
    togglePlay, setVolume, nextTrack, prevTrack,
    weather, djPersona, messages, toggleRadioMode, radioMode,
    envVibe, setMood, setIntensity, setImmersed,
    searchAndPlay, currentSubtitle,
    isSpeaking,
  } = useApp();

  const [time, setTime] = useState(new Date());
  const [showWeather, setShowWeather] = useState(false);
  const [showEnvPanel, setShowEnvPanel] = useState(false);
  const [colonVisible, setColonVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const colonTimer = setInterval(() => setColonVisible((v) => !v), 1000);
    return () => { clearInterval(timer); clearInterval(colonTimer); };
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[time.getDay()];
  const dateStr = `${time.getDate().toString().padStart(2, '0')} ${time.toLocaleString('en', { month: 'short' }).toUpperCase()} ${time.getFullYear()}`;

  const WeatherIcon = weather.condition === 'rainy' ? CloudRain : weather.condition === 'sunny' ? Sun : weather.condition === 'snowy' ? Snowflake : weather.condition === 'windy' ? Wind : Cloud;

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    await searchAndPlay(searchQuery);
    setIsSearching(false);
    setSearchQuery('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="min-h-screen pb-32 relative"
    >
      {/* Audio reactive particles background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AudioParticles isActive={isPlaying} intensity={envVibe.intensity} />
      </div>

      {/* Subtitle overlay for radio mode */}
      <SubtitleOverlay text={currentSubtitle} visible={!!currentSubtitle && radioMode} radioMode={radioMode} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <img src={djPersona.avatar} alt="Claudio" className="w-10 h-10 rounded-full border-2 border-white/20 object-cover" />
          <div>
            <span className="font-mono text-lg tracking-[0.15em] text-melo-text">Claudio</span>
            <span className="w-2 h-2 rounded-full bg-melo-green animate-breathe inline-block ml-2" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Radio mode toggle */}
          <button
            onClick={toggleRadioMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
              radioMode ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'glass text-melo-text-secondary hover:text-indigo-300'
            }`}
          >
            <Radio size={12} />
            {radioMode ? 'ON AIR' : 'Radio'}
          </button>

          {/* Weather pill */}
          <button
            onClick={() => setShowWeather(!showWeather)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-melo-text-secondary hover:border-melo-green/20 transition-colors"
          >
            <WeatherIcon size={13} className="text-melo-gold" />
            <span>{weather.temp}°C</span>
          </button>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="relative z-10 mx-4 mb-4">
        <div className="flex items-center gap-2 p-2 rounded-xl glass border border-white/[0.08]">
          <Search size={16} className="text-melo-text-dim ml-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索网易云音乐... 试试「雨夜」或「坂本龙一」"
            className="flex-1 bg-transparent text-sm text-melo-text placeholder:text-melo-text-dim outline-none py-1"
          />
          {isSearching && <div className="w-4 h-4 border-2 border-melo-green border-t-transparent rounded-full animate-spin" />}
        </div>
      </form>

      {/* Weather expanded */}
      <AnimatePresence>
        {showWeather && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden mx-5 mb-4 relative z-10"
          >
            <div className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Thermometer size={14} className="text-melo-warm" />
                  <span className="text-sm text-melo-text">{weather.temp}°C</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets size={14} className="text-blue-400" />
                  <span className="text-sm text-melo-text-secondary">{weather.humidity}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wind size={14} className="text-slate-400" />
                  <span className="text-sm text-melo-text-secondary">{weather.wind}</span>
                </div>
              </div>
              <p className="text-sm text-melo-text-secondary">{weather.city} · {weather.text}</p>
              <p className="text-xs text-indigo-400/80 italic">
                "{weather.condition === 'rainy' ? '雨滴是最好的节拍器...' : weather.condition === 'sunny' ? '阳光让一切变得透明...' : '云层像一层情绪的滤镜...'}"
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Environment vibe panel */}
      <div className="relative z-10 mx-4 mb-4">
        <button
          onClick={() => setShowEnvPanel(!showEnvPanel)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl glass text-xs text-melo-text-secondary hover:border-white/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Monitor size={14} />
            <span>环境感知: {envVibe.mood} · 强度{Math.round(envVibe.intensity * 100)}%</span>
          </div>
          <span className="text-melo-text-dim">{showEnvPanel ? '收起' : '调整'}</span>
        </button>

        <AnimatePresence>
          {showEnvPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="glass rounded-xl p-4 mt-2 space-y-4">
                {/* Mood selector */}
                <div>
                  <p className="text-xs text-melo-text-dim mb-2">Mood 预设</p>
                  <div className="flex flex-wrap gap-2">
                    {moodOptions.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMood(m)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          envVibe.mood === m ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-melo-text-secondary border border-white/5 hover:border-white/10'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intensity slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-melo-text-dim">情感强度</p>
                    <p className="text-xs text-melo-text-secondary">{Math.round(envVibe.intensity * 100)}%</p>
                  </div>
                  <div className="relative h-8">
                    <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-white/10 rounded-full" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-indigo-500/50 to-indigo-400 rounded-full transition-all"
                      style={{ width: `${envVibe.intensity * 100}%` }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={envVibe.intensity}
                      onChange={(e) => setIntensity(parseFloat(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {/* Tick marks */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-full flex justify-between px-0 pointer-events-none">
                      {intensityMarks.map((m) => (
                        <div key={m} className="w-0.5 h-2 bg-white/20 -mt-0.5" style={{ marginLeft: `${m * 100}%` }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Immersion toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-melo-gold" />
                    <span className="text-xs text-melo-text-secondary">沉浸模式 (呼吸球)</span>
                  </div>
                  <button
                    onClick={() => setImmersed(!envVibe.immersed)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${envVibe.immersed ? 'bg-indigo-500/50' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${envVibe.immersed ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Clock */}
      <div className="relative z-10 flex flex-col items-center py-4">
        {envVibe.immersed ? (
          <div className="py-8">
            <BreathingOrb isListening={!isPlaying} isSpeaking={isSpeaking} isPlaying={isPlaying} onClick={() => setImmersed(false)} />
            <p className="text-center text-xs text-melo-text-dim mt-4">点击呼吸球退出沉浸模式</p>
          </div>
        ) : (
          <>
            <div className="font-mono text-[clamp(4rem,15vw,7rem)] leading-none text-melo-text tracking-wider" style={{ textShadow: '0 0 30px rgba(255,255,255,0.1)' }}>
              <span>{hours}</span>
              <span className={`inline-block mx-1 ${colonVisible ? 'opacity-100' : 'opacity-30'} transition-opacity`}>:</span>
              <span>{minutes}</span>
            </div>
            <p className="text-lg font-display font-medium text-melo-text mt-3">{dayName}</p>
            <p className="text-xs tracking-[0.2em] text-melo-text-secondary uppercase mt-1">{dateStr}</p>
            <div className="flex items-center gap-2 mt-4">
              <span className="w-2 h-2 rounded-full bg-melo-green animate-breathe" />
              <span className="text-xs tracking-[0.2em] text-melo-green uppercase">ON AIR</span>
            </div>
          </>
        )}
      </div>

      {/* Waveform */}
      <div className="relative z-10 px-4 mb-4">
        <WaveformCanvas isPlaying={isPlaying} color="green" height={80} />
      </div>

      {/* Player Console */}
      {currentTrack && (
        <div className="relative z-10 mx-4 glass rounded-[22px] p-5 space-y-4">
          <div className="flex items-center gap-4">
            <img src={currentTrack.cover} alt={currentTrack.title} className="w-14 h-14 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-melo-text truncate">{currentTrack.title}</p>
              <p className="text-xs text-melo-text-secondary truncate">{currentTrack.artist}</p>
            </div>
            <div className="flex items-end gap-0.5 h-5">
              <div className={`w-1 rounded-full bg-melo-green transition-all duration-300 ${isPlaying ? 'h-5' : 'h-2'}`} />
              <div className={`w-1 rounded-full bg-melo-green transition-all duration-500 ${isPlaying ? 'h-3' : 'h-4'}`} style={{ transitionDelay: '100ms' }} />
              <div className={`w-1 rounded-full bg-melo-green transition-all duration-700 ${isPlaying ? 'h-4' : 'h-2'}`} style={{ transitionDelay: '200ms' }} />
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button onClick={prevTrack} className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
              <SkipBack size={18} className="text-melo-text" />
            </button>
            <button
              onClick={togglePlay}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 transition-all animate-pulse-glow"
              style={{ boxShadow: isPlaying ? '0 0 20px rgba(0, 208, 132, 0.15)' : 'none' }}
            >
              {isPlaying ? <Pause size={22} className="text-melo-text" /> : <Play size={22} className="text-melo-text ml-0.5" />}
            </button>
            <button onClick={nextTrack} className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
              <SkipForward size={18} className="text-melo-text" />
            </button>
            <button className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
              <Square size={16} className="text-melo-text-secondary" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-melo-text-secondary">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration || currentTrack.duration)}</span>
            </div>
            <div className="relative h-[3px] bg-white/10 rounded-full group">
              <div className="absolute top-0 left-0 h-full bg-white rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button className="text-xs text-melo-text-secondary hover:text-melo-text transition-colors">HIDE</button>
            <button className="text-xs text-melo-text-secondary hover:text-melo-warm transition-colors">
              <Heart size={16} className={currentTrack.isFav ? 'fill-melo-warm text-melo-warm' : ''} />
            </button>
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-melo-text-secondary" />
              <div className="relative w-20 h-[3px] bg-white/10 rounded-full cursor-pointer"
                onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setVolume((e.clientX - rect.left) / rect.width); }}
              >
                <div className="absolute top-0 left-0 h-full bg-white rounded-full" style={{ width: `${volume * 100}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow" style={{ left: `${volume * 100}%`, transform: 'translate(-50%, -50%)' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue shortcut */}
      <div className="relative z-10 mx-4 mt-4 flex items-center justify-between px-4 py-3 glass rounded-xl">
        <span className="text-xs tracking-[0.1em] text-melo-text-secondary uppercase">QUEUE</span>
        <span className="text-xs text-melo-text-secondary">{queue.length} TRACKS</span>
      </div>

      {/* DJ preview */}
      <div className="relative z-10 mx-4 mt-3 glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <img src={djPersona.avatar} alt="Claudio" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-xs text-melo-green">Claudio</span>
          <span className="text-xs text-melo-text-dim ml-auto">LIVE</span>
        </div>
        <p className="text-sm text-melo-text-secondary leading-relaxed">
          {messages[messages.length - 1]?.text.slice(0, 60)}...
        </p>
      </div>
    </motion.div>
  );
}
