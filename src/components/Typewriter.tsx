import { useState, useEffect } from 'react';

interface TypewriterProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

export default function Typewriter({ text, speed = 30, onComplete }: TypewriterProps) {
  const [displayText, setDisplayText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayText('');
    setDone(false);
    setShowCursor(true);
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
        setDone(true);
        setTimeout(() => {
          setShowCursor(false);
          onComplete?.();
        }, 500);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span>
      {displayText}
      {showCursor && !done && (
        <span className="animate-[blink-cursor_1s_step-end_infinite] ml-0.5">|</span>
      )}
    </span>
  );
}

export function DJMessageBubble({ message, isLatest }: { message: { sender: 'user' | 'dj'; text: string }; isLatest?: boolean }) {

  const isDj = message.sender === 'dj';

  if (isDj && isLatest) {
    return (
      <div className="flex gap-3">
        <div className="w-0.5 bg-melo-green/30 rounded-full shrink-0" />
        <div className="text-[15px] leading-[1.7] text-melo-text/90">
          <Typewriter text={message.text} speed={35} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isDj ? '' : 'justify-end'}`}>
      {isDj && <div className="w-0.5 bg-melo-green/30 rounded-full shrink-0" />}
      <div
        className={`max-w-[85%] text-[15px] leading-[1.7] px-4 py-3 rounded-2xl ${
          isDj
            ? 'bg-melo-card/60 border border-white/5 text-melo-text/80'
            : 'bg-melo-green/15 border border-melo-green/20 text-melo-text'
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
