import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Volume2, VolumeX, CloudRain, Sun, Moon, Zap, Music, Radio, Play } from "lucide-react";
import { useApp } from "@/context/AppContext";

import WaveformCanvas from "@/components/WaveformCanvas";

const quickPrompts = [
  { icon: CloudRain, label: "雨天推荐", text: "下雨了，推荐点适合的歌" },
  { icon: Sun, label: "晴天运动", text: "天气不错，来首适合运动的" },
  { icon: Moon, label: "深夜失眠", text: "深夜失眠，放点什么好" },
  { icon: Zap, label: "写代码", text: "在写代码，推荐点专注的歌" },
  { icon: Music, label: "心情低落", text: "今天心情不好，想听点治愈的" },
];

/** Highlight book titles 《...》 in indigo with glow */
function HighlightText({ text }: { text: string }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let remain = text;
  let key = 0;
  while (remain.length > 0) {
    const m = remain.match(/^《([^》]+)》/);
    if (m) {
      parts.push(
        <span key={key++} className="inline-block px-1 rounded text-[#818cf4] cursor-pointer hover:text-[#a5b4fc] transition-colors" style={{ textShadow: "0 0 8px rgba(129,140,244,0.5)" }}>
          《{m[1]}》
        </span>
      );
      remain = remain.slice(m[0].length);
      continue;
    }
    const e = remain.match(/^(\.{2,}|\u2026+)/);
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

export default function Chat() {
  const {
    messages, isTyping, isSpeaking, sendMessage, djPersona, radioMode,
    toggleRadioMode, currentSubtitle, speakText, stopSpeaking,
    startVoiceInput, stopVoiceInput, isListening, playFromRecommendation,
  } = useApp();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;
    sendMessage(input);
    setInput("");
  };

  // Safe message list
  const msgList = messages || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }} className="min-h-screen pb-40 flex flex-col"
    >
      {/* DJ Status */}
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={djPersona?.avatar} alt="Claudio" className="w-12 h-12 rounded-full border-2 border-white/20 object-cover" />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#00d084] border-2 border-[#06060a] animate-breathe" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-display font-bold text-[#f0f0f5]">Claudio</p>
              {radioMode && <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] tracking-wider border border-indigo-500/30">RADIO MODE</span>}
            </div>
            <p className="text-xs text-[#00d084] flex items-center gap-1 mt-0.5">
              {isTyping ? (
                <><span className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-[#00d084] animate-bounce" /><span className="w-1 h-1 rounded-full bg-[#00d084] animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-1 h-1 rounded-full bg-[#00d084] animate-bounce" style={{ animationDelay: "300ms" }} /></span>Claudio 正在调频...</>
              ) : isSpeaking ? (
                <><Volume2 size={12} className="animate-pulse text-indigo-400" /><span className="text-indigo-400">Claudio 正在说话...</span></>
              ) : (
                <><span className="w-1.5 h-1.5 rounded-full bg-[#00d084]" />Speaking...</>
              )}
            </p>
          </div>
          <button onClick={toggleRadioMode} className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-all ${radioMode ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "glass text-[#8a8a9a]"}`}>
            <Radio size={14} />{radioMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Radio subtitle */}
      <AnimatePresence>
        {radioMode && currentSubtitle && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mx-4 mb-3 px-4 py-3 rounded-xl glass border-l-2 border-l-indigo-400/50">
            <p className="text-[10px] tracking-[0.2em] text-indigo-400/60 uppercase mb-1">Claudio on Air</p>
            <p className="text-sm text-[#f0f0f5]/80 leading-relaxed font-light">{currentSubtitle}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waveform */}
      <div className="px-4 mb-4"><WaveformCanvas isPlaying={isSpeaking} color="white" height={60} barCount={60} /></div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-4">
        {msgList.map((msg, index) => {
          if (!msg) return null;
          const isDj = msg.sender === "dj";
          const isLatest = index === msgList.length - 1 && isDj;
          return (
            <motion.div key={msg.id || index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${isDj ? "" : "justify-end"}`}>
              {isDj && <img src={djPersona?.avatar} alt="C" className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" />}
              <div className="max-w-[80%]">
                <div className={`px-4 py-3 rounded-2xl text-[15px] leading-[1.7] ${isDj ? "bg-[#161622]/60 border border-white/5 text-[#f0f0f5]/90" : "bg-[#00d084]/15 border border-[#00d084]/20 text-[#f0f0f5]"}`}>
                  <span className="whitespace-pre-wrap"><HighlightText text={msg.text || ""} /></span>
                  {isLatest && isTyping && <span className="animate-[blink-cursor_1s_step-end_infinite] ml-0.5">|</span>}
                </div>
                {/* Recommendation card */}
                {msg.recommendation && (
                  <button
                    onClick={() => playFromRecommendation(msg.recommendation!)}
                    className="mt-2 w-full text-left px-3 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Play size={12} className="text-indigo-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-indigo-400 truncate">《{msg.recommendation.title}》— {msg.recommendation.artist}</p>
                        <p className="text-[10px] text-[#4a4a5a] mt-0.5 truncate">{msg.recommendation.reason}</p>
                      </div>
                    </div>
                  </button>
                )}
                {/* Speak button for DJ messages */}
                {isDj && msg.text && (
                  <button onClick={() => isSpeaking ? stopSpeaking() : speakText(msg.text)} className="mt-1 flex items-center gap-1 text-[10px] text-[#4a4a5a] hover:text-indigo-400 transition-colors">
                    {isSpeaking && isLatest ? <VolumeX size={10} /> : <Volume2 size={10} />}
                    {isSpeaking && isLatest ? "停止" : "朗读"}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-2">
            <span className="text-xs text-[#4a4a5a]">Claudio 正在挑选唱片</span>
            <span className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-[#00d084] animate-bounce" /><span className="w-1 h-1 rounded-full bg-[#00d084] animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-1 h-1 rounded-full bg-[#00d084] animate-bounce" style={{ animationDelay: "300ms" }} /></span>
          </motion.div>
        )}
      </div>

      {/* Quick prompts */}
      <div className="px-4 py-2">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(quickPrompts || []).map((prompt, i) => {
            const Icon = prompt.icon;
            return (
              <button key={i} onClick={() => sendMessage(prompt.text)} className="flex items-center gap-1.5 px-3 py-2 rounded-full glass text-xs text-[#8a8a9a] hover:text-[#00d084] hover:border-[#00d084]/20 transition-all whitespace-nowrap shrink-0">
                <Icon size={12} />{prompt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 p-2 rounded-[26px] glass-strong border border-white/[0.08]">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={radioMode ? "Say something to Claudio..." : "和 Claudio 说点什么..."}
            className="flex-1 bg-transparent px-4 py-2 text-sm text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none" />
          <button onClick={isListening ? stopVoiceInput : startVoiceInput}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isListening ? "bg-[#ff6b6b]/20 animate-pulse" : "bg-white/5 hover:bg-white/10"}`}>
            <Mic size={16} className={isListening ? "text-[#ff6b6b]" : "text-[#8a8a9a]"} />
          </button>
          <button onClick={handleSend} disabled={!input.trim() || isTyping}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${input.trim() && !isTyping ? "bg-[#00d084] hover:bg-[#00a86b]" : "bg-white/5"}`}>
            <Send size={16} className={input.trim() && !isTyping ? "text-[#06060a]" : "text-[#4a4a5a]"} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
