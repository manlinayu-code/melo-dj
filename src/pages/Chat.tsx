import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Volume2, VolumeX, CloudRain, Sun, Moon, Zap, Music, Radio, Play, Pause, Square } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { ChatMessage, Recommendation } from "@/types";
import WaveformCanvas from "@/components/WaveformCanvas";

const quickPrompts = [
  { icon: CloudRain, label: "雨天推荐", text: "下雨了，推荐点适合的歌" },
  { icon: Sun, label: "晴天运动", text: "天气不错，来首适合运动的" },
  { icon: Moon, label: "深夜失眠", text: "深夜失眠，放点什么好" },
  { icon: Zap, label: "写代码", text: "在写代码，推荐点专注的歌" },
  { icon: Music, label: "心情低落", text: "今天心情不好，想听点治愈的" },
];

/** Highlight book titles 《...》 in indigo with neon glow */
function HighlightText({ text }: { text: string }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let remain = text;
  let key = 0;
  while (remain.length > 0) {
    const m = remain.match(/^《([^》]+)》/);
    if (m) {
      parts.push(
        <span
          key={key++}
          className="inline-block px-1 rounded text-[#a5b4fc] font-medium"
          style={{ textShadow: "0 0 10px rgba(165,180,252,0.55), 0 0 20px rgba(129,140,248,0.25)" }}
        >
          《{m[1]}》
        </span>
      );
      remain = remain.slice(m[0].length);
      continue;
    }
    const e = remain.match(/^(\.{2,}|…+)/);
    if (e) {
      parts.push(<span key={key++} className="inline-block text-indigo-400/60 animate-pulse mx-0.5">{e[0]}</span>);
      remain = remain.slice(e[0].length);
      continue;
    }
    parts.push(<span key={key++}>{remain[0]}</span>);
    remain = remain.slice(1);
  }
  return <>{parts}</>;
}

/**
 * rAF-based typewriter — single rAF loop, no per-char setTimeout/setInterval thrashing.
 * Speed = chars/sec (default 36).
 */
function useRafTypewriter(text: string, charsPerSec = 36, enabled = true) {
  const [count, setCount] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let raf = 0;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const elapsed = (ts - start) / 1000;
      const target = Math.min(text.length, Math.floor(elapsed * charsPerSec));
      setCount(target);
      if (target < text.length) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, charsPerSec, enabled]);
  return { displayed: text.slice(0, count), done: count >= text.length };
}

function TypewriterMessage({ text, animate }: { text: string; animate: boolean }) {
  const { displayed, done } = useRafTypewriter(text, 38, animate);
  return (
    <span className="whitespace-pre-wrap">
      <HighlightText text={displayed} />
      {!done && (
        <span className="inline-block w-0.5 h-4 bg-[#3b82f6] ml-0.5 animate-[blink-cursor_1s_step-end_infinite] align-middle" />
      )}
    </span>
  );
}

/** Recommendation card with on-mount cover art lookup via netease.search. */
function RecommendationCard({ rec }: { rec: Recommendation }) {
  const { playFromRecommendation, isPlaying, currentTrack, togglePlay, seekTo } = useApp();
  const [cover, setCover] = useState<string>("");
  const [resolvedTitle, setResolvedTitle] = useState<string>(rec.title);
  const [resolvedArtist, setResolvedArtist] = useState<string>(rec.artist);
  const cacheKey = useMemo(() => `melo_rec_cover:${rec.title}|${rec.artist}`, [rec.title, rec.artist]);

  const isCurrentTrack = currentTrack?.title === resolvedTitle && currentTrack?.artist === resolvedArtist;
  const isPlayingThis = isCurrentTrack && isPlaying;

  useEffect(() => {
    let cancelled = false;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { cover: string; title: string; artist: string };
        setCover(parsed.cover);
        if (parsed.title) setResolvedTitle(parsed.title);
        if (parsed.artist) setResolvedArtist(parsed.artist);
        return;
      } catch { /* fall through */ }
    }
    const fetchCover = async () => {
      try {
        const url = `/api/trpc/netease.search?input=${encodeURIComponent(JSON.stringify({ keywords: `${rec.title} ${rec.artist}`.trim(), limit: 1 }))}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        const song = json?.result?.data?.result?.songs?.[0];
        if (!song || cancelled) return;
        const c = song.al?.picUrl || "";
        const t = song.name || rec.title;
        const a = Array.isArray(song.ar) ? song.ar.map((x: { name?: string }) => x?.name || "").filter(Boolean).join(", ") : rec.artist;
        if (!cancelled) {
          setCover(c);
          setResolvedTitle(t);
          setResolvedArtist(a);
          sessionStorage.setItem(cacheKey, JSON.stringify({ cover: c, title: t, artist: a }));
        }
      } catch { /* swallow */ }
    };
    fetchCover();
    return () => { cancelled = true; };
  }, [cacheKey, rec.title, rec.artist]);

  const handlePlayPause = () => {
    if (isCurrentTrack) togglePlay();
    else playFromRecommendation(rec);
  };

  const handleStop = () => {
    if (!isCurrentTrack) return;
    if (isPlaying) togglePlay();
    seekTo(0);
  };

  return (
    <div
      className="mt-2 w-full p-3 rounded-2xl bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-transparent border border-indigo-500/25 transition-all relative overflow-hidden"
      style={{ boxShadow: isPlayingThis ? "0 4px 24px -4px rgba(99,102,241,0.55)" : "0 4px 20px -8px rgba(99,102,241,0.35)" }}
    >
      <div className="flex items-center gap-3 relative">
        {/* Cover — primary play/pause target */}
        <button
          onClick={handlePlayPause}
          aria-label={isPlayingThis ? `暂停《${resolvedTitle}》` : `播放《${resolvedTitle}》`}
          className="relative shrink-0 rounded-xl overflow-hidden ripple focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        >
          {cover ? (
            <img src={cover} alt={resolvedTitle} className="w-14 h-14 object-cover block" />
          ) : (
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500/30 to-violet-500/20 flex items-center justify-center">
              <Music size={20} className="text-indigo-300/70" />
            </div>
          )}
          {/* Always-visible play/pause overlay */}
          <div className={`absolute inset-0 flex items-center justify-center transition-colors ${isPlayingThis ? "bg-black/55" : "bg-black/35 hover:bg-black/45"}`}>
            {isPlayingThis ? (
              <Pause size={20} className="text-white" fill="currentColor" />
            ) : (
              <Play size={20} className="text-white ml-0.5" fill="currentColor" />
            )}
          </div>
          {isPlayingThis && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
          )}
        </button>

        {/* Song info */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm text-[#f0f0f5] font-medium truncate"
            style={{ textShadow: "0 0 12px rgba(165,180,252,0.35)" }}
          >
            《{resolvedTitle}》
          </p>
          <p className="text-xs text-[#a5b4fc]/80 truncate mt-0.5">{resolvedArtist}</p>
          {rec.vibe_match && (
            <p className="text-[10px] tracking-wider uppercase text-indigo-400/70 mt-1 truncate">vibe · {rec.vibe_match}</p>
          )}
        </div>

        {/* Stop button — only when this track is the current one */}
        {isCurrentTrack && (
          <button
            onClick={handleStop}
            aria-label="停止播放"
            className="shrink-0 flex items-center gap-1 px-2.5 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] text-[#a5b4fc]/80 hover:text-white transition-colors ripple"
          >
            <Square size={11} fill="currentColor" />
            <span>停止</span>
          </button>
        )}
      </div>
      {rec.reason && (
        <p className="mt-2 text-[11px] leading-relaxed text-[#8a8a9a] line-clamp-2 relative">
          {rec.reason}
        </p>
      )}
    </div>
  );
}

export default function Chat() {
  const {
    messages, isTyping, isSpeaking, sendMessage, djPersona, radioMode,
    toggleRadioMode, currentSubtitle, speakText, stopSpeaking,
    startVoiceInput, stopVoiceInput, isListening,
  } = useApp();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track which DJ message IDs have already been "typewritten" once so re-renders don't restart the animation.
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Auto-scroll to newest
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Smooth scroll only when user is near the bottom; otherwise jump (initial load).
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    el.scrollTo({ top: el.scrollHeight, behavior: distanceFromBottom < 240 ? "smooth" : "auto" });
  }, [messages, isTyping]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isTyping) return;
    sendMessage(input);
    setInput("");
  }, [input, isTyping, sendMessage]);

  const msgList: ChatMessage[] = messages || [];
  const lastDjId = useMemo(() => {
    for (let i = msgList.length - 1; i >= 0; i--) {
      if (msgList[i]?.sender === "dj") return msgList[i].id;
    }
    return null;
  }, [msgList]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="h-screen flex flex-col"
      >
        {/* DJ Status */}
        <div className="px-5 pt-6 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={djPersona?.avatar} alt="Claudio" className="w-12 h-12 rounded-full border-2 border-white/20 object-cover" />
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#3b82f6] border-2 border-[#06060a] animate-breathe" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-display font-bold text-[#f0f0f5]">Claudio</p>
                {radioMode && <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] tracking-wider border border-indigo-500/30">RADIO MODE</span>}
              </div>
              <p className="text-xs text-[#3b82f6] flex items-center gap-1 mt-0.5">
                {isTyping ? (
                  <><span className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-[#3b82f6] animate-bounce" /><span className="w-1 h-1 rounded-full bg-[#3b82f6] animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-1 h-1 rounded-full bg-[#3b82f6] animate-bounce" style={{ animationDelay: "300ms" }} /></span>Claudio 正在调频...</>
                ) : isSpeaking ? (
                  <><Volume2 size={12} className="animate-pulse text-indigo-400" /><span className="text-indigo-400">Claudio 正在说话...</span></>
                ) : (
                  <><span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />Listening...</>
                )}
              </p>
            </div>
            <button onClick={toggleRadioMode} className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-all ripple ${radioMode ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "glass text-[#8a8a9a]"}`}>
              <Radio size={14} />{radioMode ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Radio subtitle */}
        <AnimatePresence>
          {radioMode && currentSubtitle && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mx-4 mb-3 px-4 py-3 rounded-xl glass border-l-2 border-l-indigo-400/50 shrink-0">
              <p className="text-[10px] tracking-[0.2em] text-indigo-400/60 uppercase mb-1">Claudio on Air</p>
              <p className="text-sm text-[#f0f0f5]/80 leading-relaxed font-light">{currentSubtitle}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waveform — pulses with TTS / playing audio */}
        <div className="px-4 mb-4 shrink-0">
          <WaveformCanvas isPlaying={isSpeaking} color={radioMode ? "indigo" : "white"} height={60} barCount={60} />
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-4 pb-56 min-h-0">
          {msgList.map((msg, index) => {
            if (!msg) return null;
            const isDj = msg.sender === "dj";
            const isLastDj = isDj && msg.id === lastDjId;
            const alreadySeen = seenIdsRef.current.has(msg.id);
            const animateTw = isDj && isLastDj && !alreadySeen && !isTyping;
            if (isDj) seenIdsRef.current.add(msg.id);

            return (
              <motion.div
                key={msg.id || index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex gap-3 ${isDj ? "" : "justify-end"}`}
              >
                {isDj && <img src={djPersona?.avatar} alt="C" className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" />}
                <div className="max-w-[80%]">
                  <div className={`px-4 py-3 rounded-2xl text-[15px] leading-[1.7] ${isDj ? "bg-[#161622]/60 border border-white/5 text-[#f0f0f5]/90" : "bg-[#3b82f6]/15 border border-[#3b82f6]/20 text-[#f0f0f5]"}`}>
                    {isDj ? (
                      <TypewriterMessage text={msg.text || ""} animate={animateTw} />
                    ) : (
                      <span className="whitespace-pre-wrap"><HighlightText text={msg.text || ""} /></span>
                    )}
                  </div>
                  {/* Recommendation card */}
                  {msg.recommendation && (
                    <RecommendationCard rec={msg.recommendation} />
                  )}
                  {/* Speak / stop button */}
                  {isDj && msg.text && (
                    <button
                      onClick={() => isSpeaking && isLastDj ? stopSpeaking() : speakText(msg.text)}
                      className="mt-1 flex items-center gap-1 text-[10px] text-[#4a4a5a] hover:text-indigo-400 transition-colors"
                    >
                      {isSpeaking && isLastDj ? <VolumeX size={10} /> : <Volume2 size={10} />}
                      {isSpeaking && isLastDj ? "停止" : "朗读"}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-2">
              <span className="text-xs text-[#4a4a5a]">Claudio 正在挑选唱片</span>
              <span className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-[#3b82f6] animate-bounce" /><span className="w-1 h-1 rounded-full bg-[#3b82f6] animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-1 h-1 rounded-full bg-[#3b82f6] animate-bounce" style={{ animationDelay: "300ms" }} /></span>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/*
        Composer — rendered OUTSIDE the motion.div on purpose.
        framer-motion keeps a `transform` style on motion.div for compositing,
        which turns it into a containing block for `position:fixed` descendants
        (CSS spec). Mounting the composer as a sibling of the animated wrapper
        anchors `fixed` to the viewport, so the input no longer drifts with scroll.
      */}
      <div className="fixed bottom-24 left-0 right-0 z-30 px-4 pointer-events-none">
        <div className="max-w-[480px] mx-auto pointer-events-auto">
          {/* Quick prompts */}
          <div className="py-2">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {quickPrompts.map((prompt, i) => {
                const Icon = prompt.icon;
                return (
                  <button key={i} onClick={() => sendMessage(prompt.text)} className="flex items-center gap-1.5 px-3 py-2 rounded-full glass text-xs text-[#8a8a9a] hover:text-[#3b82f6] hover:border-[#3b82f6]/20 transition-all whitespace-nowrap shrink-0 ripple">
                    <Icon size={12} />{prompt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pb-1">
            <div className="flex items-center gap-2 p-2 rounded-[26px] glass-strong border border-white/[0.08]">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={radioMode ? "Say something to Claudio..." : "和 Claudio 说点什么..."}
                className="flex-1 bg-transparent px-4 py-2 text-sm text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none" />
              <button onClick={isListening ? stopVoiceInput : startVoiceInput}
                aria-label={isListening ? "停止语音输入" : "语音输入"}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ripple ${isListening ? "bg-[#ff6b6b]/20 animate-pulse" : "bg-white/5 hover:bg-white/10"}`}>
                <Mic size={16} className={isListening ? "text-[#ff6b6b]" : "text-[#8a8a9a]"} />
              </button>
              <button onClick={handleSend} disabled={!input.trim() || isTyping}
                aria-label="发送"
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ripple ${input.trim() && !isTyping ? "bg-[#3b82f6] hover:bg-[#2563eb]" : "bg-white/5"}`}>
                <Send size={16} className={input.trim() && !isTyping ? "text-[#06060a]" : "text-[#4a4a5a]"} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
