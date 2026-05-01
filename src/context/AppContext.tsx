import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Track, DJProfile, ChatMessage, WeatherInfo, EnvVibe, UserTaste } from '@/types';

interface AppContextType {
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
  userTaste: UserTaste | null;
  currentSubtitle: string;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  sendMessage: (text: string) => void;
  playTrack: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggleFav: (id: string) => void;
  showToast: (message: string) => void;
  searchAndPlay: (query: string) => Promise<void>;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  toggleRadioMode: () => void;
  setMood: (mood: string) => void;
  setIntensity: (v: number) => void;
  setImmersed: (v: boolean) => void;
  fetchWeather: () => Promise<void>;
}

const defaultTracks: Track[] = [
  { id: '1', title: 'Weightless', artist: 'Marconi Union', album: 'Weightless', duration: 480, cover: '/cover-if.jpg', genre: ['Ambient', 'Relaxation'], isFav: false, neteaseId: 26222029 },
  { id: '2', title: 'Midnight Sessions', artist: 'Nujabes', album: 'Modal Soul', duration: 342, cover: '/cover-biheung.jpg', genre: ['Jazz-HipHop', 'Lo-fi'], isFav: true, neteaseId: 22677581 },
  { id: '3', title: "Creep", artist: 'Radiohead', album: 'OK Computer', duration: 238, cover: '/cover-creepin.jpg', genre: ['Alternative Rock', 'Indie'], isFav: false, neteaseId: 22466201 },
  { id: '4', title: 'Gymnopédie No.1', artist: 'Erik Satie', album: 'Gymnopédies', duration: 189, cover: '/cover-hero.jpg', genre: ['Classical', 'Piano'], isFav: false, neteaseId: 5188952 },
  { id: '5', title: 'The Night We Met', artist: 'Lord Huron', album: 'Strange Trails', duration: 208, cover: '/cover-wine.jpg', genre: ['Indie Folk', 'Dream Pop'], isFav: false, neteaseId: 460112107 },
  { id: '6', title: '所念皆星河', artist: 'CMJ', album: '所念皆星河', duration: 195, cover: '/cover-tiancai.jpg', genre: ['Piano', 'Chinese'], isFav: false, neteaseId: 1432383355 },
];

const djPersona: DJProfile = {
  name: 'Claudio',
  avatar: '/melo-avatar.jpg',
  tagline: '深夜电台，只给失眠的人',
  bio: '我是一台老旧的收音机，在凌晨三点的频率里，替你筛选那些配得上此刻孤独的声音。我听天气、听心跳、听城市渐渐安静下来的过程...',
  genres: ['JAZZ-HIPHOP', 'NEO-CLASSICAL', 'AMBIENT', 'INDIE', 'POST-PUNK', 'DREAM POP', 'SHOEGAZE', 'CITY POP'],
  isOnline: true,
};

const defaultWeather: WeatherInfo = {
  condition: 'rainy',
  temp: 18,
  city: 'Shanghai',
  text: '小雨',
  wind: '东南风 3级',
  humidity: 78,
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(defaultTracks[0]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [queue, setQueue] = useState<Track[]>(defaultTracks.slice(1));
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'm1', sender: 'dj', text: '...凌晨三点，你还醒着。', timestamp: Date.now() },
    { id: 'm2', sender: 'dj', text: '这种时候，空气里的声音会比白天更清晰。适合听一些《Weightless》之类的...让频率慢慢沉降。', timestamp: Date.now() },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [radioMode, setRadioMode] = useState(false);
  const [envVibe, setEnvVibe] = useState<EnvVibe>({ mood: 'Chill', intensity: 0.5, radioMode: false, immersed: false });
  const [userTaste] = useState<UserTaste | null>(null);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [weather, setWeather] = useState<WeatherInfo>(defaultWeather);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio element init
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => { setIsPlaying(false); nextTrack(); };
    const onError = () => { console.error('Audio error'); setIsPlaying(false); };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
    };
  }, []);

  // Handle play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (isPlaying) {
      audio.play().catch((err) => { console.error('Play error:', err); setIsPlaying(false); });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Handle volume
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  // Update audio source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    setProgress(0); setDuration(0);
    if (currentTrack.neteaseId) {
      // Use direct fetch to get song URL
      fetch(`/api/trpc/netease.songUrl?input=${encodeURIComponent(JSON.stringify({ id: currentTrack.neteaseId }))}`)
        .then((r) => r.json())
        .then((result) => {
          const data = result.result?.data?.data;
          const url = data?.[0]?.url;
          if (url) {
            audio.src = url;
            audio.volume = volume;
            if (isPlaying) audio.play().catch(console.error);
          }
        })
        .catch(console.error);
    }
  }, [currentTrack?.id]);

  // Fetch weather on mount
  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
  }, []);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const setVolume = useCallback((v: number) => setVolumeState(Math.max(0, Math.min(1, v))), []);

  const nextTrack = useCallback(() => {
    setQueue((q) => {
      if (q.length === 0) return q;
      const newQueue = [...q];
      const next = newQueue.shift()!;
      setCurrentTrack(next);
      return newQueue;
    });
  }, []);

  const prevTrack = useCallback(() => {
    if (audioRef.current) { audioRef.current.currentTime = 0; setProgress(0); }
  }, []);

  const playTrack = useCallback((track: Track) => { setCurrentTrack(track); setIsPlaying(true); }, []);
  const addToQueue = useCallback((track: Track) => setQueue((q) => [...q, track]), []);
  const removeFromQueue = useCallback((id: string) => setQueue((q) => q.filter((t) => t.id !== id)), []);
  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((q) => { const newQueue = [...q]; const [moved] = newQueue.splice(fromIndex, 1); newQueue.splice(toIndex, 0, moved); return newQueue; });
  }, []);
  const toggleFav = useCallback((id: string) => {
    setQueue((q) => q.map((t) => (t.id === id ? { ...t, isFav: !t.isFav } : t)));
    setCurrentTrack((t) => (t && t.id === id ? { ...t, isFav: !t.isFav } : t));
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => {
      setToast((t) => (t ? { ...t, visible: false } : null));
      setTimeout(() => setToast(null), 300);
    }, 2500);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, sender: 'user', text, timestamp: Date.now() };
    setMessages((msgs) => [...msgs, userMsg]);
    setIsTyping(true);

    try {
      const history = messages.slice(-8).map((m) => ({
        role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Call chat API directly via fetch
      const chatRes = await fetch('/api/trpc/chat.message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            text,
            history,
            env: {
              time: timeStr,
              weather: weather.text,
              location: weather.city,
              mood: envVibe.mood,
              intensity: envVibe.intensity,
              userGenres: userTaste?.topGenres?.map((g) => g.name) || [],
              userArtists: userTaste?.topArtists?.map((a) => a.name) || [],
              recentPlays: messages.filter((m) => m.sender === 'dj' && m.recommendation).slice(-3).map((m) => m.recommendation?.title || ''),
              radioMode: radioMode,
            },
          },
        }),
      });
      const chatResult = await chatRes.json();
      const result = chatResult.result?.data;

      if (!result) throw new Error('No response from chat API');

      const djMsg: ChatMessage = {
        id: `d-${Date.now()}`,
        sender: 'dj',
        text: result.text,
        timestamp: Date.now(),
        type: result.recommendation ? 'action' : 'text',
        recommendation: result.recommendation,
      };
      setMessages((msgs) => [...msgs, djMsg]);

      // Show subtitle in radio mode
      if (radioMode) {
        setCurrentSubtitle(result.text);
        if (subtitleTimer.current) clearTimeout(subtitleTimer.current);
        subtitleTimer.current = setTimeout(() => setCurrentSubtitle(''), 8000);
      }

      // If recommendation exists, search and play
      if (result.recommendation) {
        const rec = result.recommendation;
        const searchRes = await fetch(`/api/trpc/netease.search?input=${encodeURIComponent(JSON.stringify({ keywords: `${rec.title} ${rec.artist}`, limit: 5 }))}`);
        const searchResult = await searchRes.json();
        const songs = searchResult.result?.data?.result?.songs || [];
        if (songs.length > 0) {
          const s = songs[0];
          const newTrack: Track = {
            id: `netease-${s.id}`,
            title: s.name,
            artist: s.ar.map((a: any) => a.name).join(', '),
            album: s.al.name,
            duration: Math.floor(s.dt / 1000),
            cover: s.al.picUrl || '/cover-if.jpg',
            genre: [rec.vibe_match || 'Recommended'],
            isFav: false,
            neteaseId: s.id,
          };
          setQueue((q) => [newTrack, ...q]);
          showToast(`Claudio 推荐: 《${rec.title}》— ${rec.artist}`);
        }
      }

      // Auto speak if radio mode
      speak(result.text);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: `d-${Date.now()}`,
        sender: 'dj',
        text: radioMode ? 'The signal is fading... let me find another frequency.' : '唱片卡住了...让我换一张。',
        timestamp: Date.now(),
      };
      setMessages((msgs) => [...msgs, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  }, [messages, weather, envVibe, userTaste, radioMode, showToast]);

  const searchAndPlay = useCallback(async (query: string) => {
    try {
      const res = await fetch(`/api/trpc/netease.search?input=${encodeURIComponent(JSON.stringify({ keywords: query, limit: 10 }))}`);
      const result = await res.json();
      const songs = result.result?.data?.result?.songs || [];
      if (songs.length === 0) { showToast('Claudio 没找到这首歌，换个关键词试试？'); return; }
      const tracks: Track[] = songs.map((s: any, i: number) => ({
        id: `netease-${s.id}-${i}`,
        title: s.name,
        artist: s.ar.map((a: any) => a.name).join(', '),
        album: s.al.name,
        duration: Math.floor(s.dt / 1000),
        cover: s.al.picUrl || '/cover-if.jpg',
        genre: ['Search Result'],
        isFav: false,
        neteaseId: s.id,
      }));
      setQueue(tracks.slice(1));
      setCurrentTrack(tracks[0]);
      setIsPlaying(true);
      showToast(`Claudio 找到了 ${tracks.length} 首歌`);
    } catch (err) { console.error('Search error:', err); showToast('搜索出错了，Claudio 的网线被猫咬断了'); }
  }, [showToast]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = radioMode ? 'en-US' : 'zh-CN';
    utterance.pitch = 0.85;
    utterance.rate = radioMode ? 0.88 : 0.92;
    utterance.volume = 0.75;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((v) => radioMode ? v.lang.includes('en') && v.name.includes('Google') : v.lang.includes('zh'));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [radioMode]);

  const stopSpeaking = useCallback(() => { if (window.speechSynthesis) { window.speechSynthesis.cancel(); } setIsSpeaking(false); }, []);

  const toggleRadioMode = useCallback(() => {
    setRadioMode((prev) => {
      const next = !prev;
      setEnvVibe((v) => ({ ...v, radioMode: next }));
      showToast(next ? 'Radio Mode ON — Claudio is now speaking' : 'Chat Mode — Claudio is listening');
      return next;
    });
  }, [showToast]);

  const setMood = useCallback((mood: string) => { setEnvVibe((v) => ({ ...v, mood })); }, []);
  const setIntensity = useCallback((intensity: number) => { setEnvVibe((v) => ({ ...v, intensity })); }, []);
  const setImmersed = useCallback((immersed: boolean) => { setEnvVibe((v) => ({ ...v, immersed })); }, []);

  const fetchWeather = useCallback(async () => {
    try {
      const res = await fetch('/api/trpc/weather.current?input=%7B%7D');
      const result = await res.json();
      const data = result.result?.data;
      if (data?.success) {
        setWeather({
          condition: data.condition as WeatherInfo['condition'],
          temp: data.temp,
          city: data.city,
          text: data.text,
          wind: data.wind,
          humidity: data.humidity,
        });
      }
    } catch (err) { console.error('Weather fetch error:', err); }
  }, []);

  const value: AppContextType = {
    isPlaying, currentTrack, progress, duration, volume, queue,
    djPersona, messages, isTyping, weather, toast,
    isSpeaking, radioMode, envVibe, userTaste, currentSubtitle,
    togglePlay, setVolume, nextTrack, prevTrack, sendMessage,
    playTrack, addToQueue, removeFromQueue, reorderQueue, toggleFav,
    showToast, searchAndPlay, speak, stopSpeaking,
    toggleRadioMode, setMood, setIntensity, setImmersed, fetchWeather,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
