import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Volume2, CloudRain, Sun, Moon, Zap, Music, Radio } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import WaveformCanvas from '@/components/WaveformCanvas';
import BreathingOrb from '@/components/BreathingOrb';

const quickPrompts = [
  { icon: CloudRain, label: '雨天推荐', text: '现在外面在下雨，推荐点适合的歌' },
  { icon: Sun, label: '晴天运动', text: '天气不错，来首适合运动的' },
  { icon: Moon, label: '深夜失眠', text: '深夜失眠，放点什么好' },
  { icon: Zap, label: '写代码', text: '在写代码，推荐点专注的歌' },
  { icon: Music, label: '心情低落', text: '今天心情不好，想听点治愈的' },
];

// Render text with book title highlighting and ellipsis pauses
function renderClaudioText(text: string) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Check for book title pattern 《...》
    const bookMatch = remaining.match(/^《([^》]+)》/);
    if (bookMatch) {
      parts.push(
        <span
          key={key++}
          className="inline-block px-1 rounded text-[#818cf4]"
          style={{ textShadow: '0 0 8px rgba(129, 140, 244, 0.5), 0 0 16px rgba(129, 140, 244, 0.3)' }}
        >
          《{bookMatch[1]}》
        </span>
      );
      remaining = remaining.slice(bookMatch[0].length);
      continue;
    }

    // Check for ellipsis pause
    const ellipsisMatch = remaining.match(/^(\.{3,}|\u2026{2,})/);
    if (ellipsisMatch) {
      parts.push(
        <span key={key++} className="inline-block text-indigo-400/60 animate-pulse mx-0.5">
          ...
        </span>
      );
      remaining = remaining.slice(ellipsisMatch[0].length);
      continue;
    }

    // Normal character
    parts.push(<span key={key++}>{remaining[0]}</span>);
    remaining = remaining.slice(1);
  }

  return parts;
}

export default function Chat() {
  const { messages, isTyping, isSpeaking, sendMessage, djPersona, radioMode, toggleRadioMode, currentSubtitle } = useApp();
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;
    sendMessage(input);
    setInput('');
  };

  const handlePrompt = (text: string) => sendMessage(text);

  const handleVoice = () => {
    setIsRecording(true);
    setTimeout(() => { setIsRecording(false); setInput('我想听点轻松的歌'); }, 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="min-h-screen pb-40 flex flex-col"
    >
      {/* DJ Status Bar */}
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={djPersona.avatar} alt="Claudio" className="w-12 h-12 rounded-full border-2 border-white/20 object-cover" />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-melo-green border-2 border-melo-base animate-breathe" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-display font-bold text-melo-text">{djPersona.name}</p>
              {radioMode && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] tracking-wider border border-indigo-500/30">
                  RADIO MODE
                </span>
              )}
            </div>
            <p className="text-xs text-melo-green flex items-center gap-1 mt-0.5">
              {isTyping ? (
                <>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-melo-green animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-melo-green animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-melo-green animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  Claudio 正在调频...
                </>
              ) : isSpeaking ? (
                <>
                  <Volume2 size={12} className="animate-pulse text-indigo-400" />
                  <span className="text-indigo-400">Claudio 正在说话...</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-melo-green" />
                  Speaking...
                </>
              )}
            </p>
          </div>
          <button
            onClick={toggleRadioMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-all ${
              radioMode ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'glass text-melo-text-secondary'
            }`}
          >
            <Radio size={14} />
            {radioMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Radio mode subtitle */}
      <AnimatePresence>
        {radioMode && currentSubtitle && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mb-3 px-4 py-3 rounded-xl glass border-l-2 border-l-indigo-400/50"
          >
            <p className="text-[10px] tracking-[0.2em] text-indigo-400/60 uppercase mb-1">Claudio on Air</p>
            <p className="text-sm text-melo-text/80 leading-relaxed font-light">{currentSubtitle}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Waveform */}
      <div className="px-4 mb-4">
        <WaveformCanvas isPlaying={isSpeaking} color="white" height={60} barCount={60} />
      </div>

      {/* Breathing orb in chat header when radio mode */}
      {radioMode && (
        <div className="flex justify-center py-4">
          <BreathingOrb isListening={!isSpeaking && !isTyping} isSpeaking={isSpeaking} isPlaying={false} />
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-4">
        <AnimatePresence>
          {messages.map((msg, index) => {
            const isDj = msg.sender === 'dj';
            const isLatest = index === messages.length - 1 && isDj;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${isDj ? '' : 'justify-end'}`}
              >
                {isDj && (
                  <img src={djPersona.avatar} alt="Claudio" className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" />
                )}
                <div className={`max-w-[80%] ${isDj ? '' : ''}`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-[15px] leading-[1.7] ${
                      isDj
                        ? 'bg-melo-card/60 border border-white/5 text-melo-text/90'
                        : 'bg-melo-green/15 border border-melo-green/20 text-melo-text'
                    }`}
                  >
                    {isLatest && isDj ? (
                      <TypewriterText text={msg.text} />
                    ) : (
                      <span className="whitespace-pre-wrap">{renderClaudioText(msg.text)}</span>
                    )}
                  </div>
                  {msg.recommendation && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                      <p className="text-xs text-indigo-400">推荐: 《{msg.recommendation.title}》— {msg.recommendation.artist}</p>
                      <p className="text-[10px] text-melo-text-dim mt-0.5">{msg.recommendation.reason}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-2">
            <span className="text-xs text-melo-text-dim">Claudio 正在根据你的频率挑选唱片</span>
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-melo-green animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-melo-green animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-melo-green animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </motion.div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-2">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {quickPrompts.map((prompt, i) => {
            const Icon = prompt.icon;
            return (
              <button
                key={i}
                onClick={() => handlePrompt(prompt.text)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full glass text-xs text-melo-text-secondary hover:text-melo-green hover:border-melo-green/20 transition-all whitespace-nowrap shrink-0"
              >
                <Icon size={12} />
                {prompt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 p-2 rounded-[26px] glass-strong border border-white/[0.08]">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={radioMode ? "Say something to Claudio..." : "和 Claudio 说点什么..."}
            className="flex-1 bg-transparent px-4 py-2 text-sm text-melo-text placeholder:text-melo-text-dim outline-none"
          />
          <button
            onClick={handleVoice}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isRecording ? 'bg-melo-warm/20 animate-pulse' : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <Mic size={16} className={isRecording ? 'text-melo-warm' : 'text-melo-text-secondary'} />
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              input.trim() && !isTyping ? 'bg-melo-green hover:bg-melo-green-dark' : 'bg-white/5'
            }`}
          >
            <Send size={16} className={input.trim() && !isTyping ? 'text-melo-base' : 'text-melo-text-dim'} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function TypewriterText({ text }: { text: string }) {
  const [display, setDisplay] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplay('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplay(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setDone(true);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span className="whitespace-pre-wrap">
      {renderClaudioText(display)}
      {!done && <span className="animate-[blink-cursor_1s_step-end_infinite] ml-0.5">|</span>}
    </span>
  );
}
