import { useState } from 'react';
import { motion } from 'framer-motion';
import { Radio, ListMusic, MessageCircle, Disc, CloudRain } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { ViewType } from '@/types';

const navItems: { id: ViewType; icon: typeof Radio; label: string }[] = [
  { id: 'home', icon: Radio, label: '电台' },
  { id: 'queue', icon: ListMusic, label: '队列' },
  { id: 'chat', icon: MessageCircle, label: '对话' },
  { id: 'profile', icon: Disc, label: '档案' },
];

interface DockNavProps {
  current: ViewType;
  onChange: (v: ViewType) => void;
}

export default function DockNav({ current, onChange }: DockNavProps) {
  const { weather } = useApp();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Gradient fade above dock */}
      <div className="h-[120px] bg-gradient-to-t from-melo-base to-transparent pointer-events-none" />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1">
        {/* Weather indicator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mr-2 flex items-center gap-1.5 px-3 py-2 rounded-full glass text-xs text-melo-text-secondary"
        >
          <CloudRain size={14} className="text-melo-gold" />
          <span>{weather.temp}°C</span>
          <span className="text-melo-text-dim">·</span>
          <span>{weather.city}</span>
        </motion.div>

        {/* Nav buttons */}
        <div className="flex items-center gap-1 p-1.5 rounded-[28px] glass-strong">
          {navItems.map((item) => {
            const isActive = current === item.id;
            const Icon = item.icon;
            const isHover = hovered === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered(null)}
                className="relative flex flex-col items-center justify-center w-14 h-14 rounded-[22px] transition-all duration-300"
                style={{
                  background: isHover && !isActive ? 'rgba(0, 208, 132, 0.08)' : 'transparent',
                  transform: isHover ? 'translateY(-4px)' : 'translateY(0)',
                }}
              >
                <Icon
                  size={22}
                  className={`transition-colors duration-300 ${
                    isActive ? 'text-melo-green' : 'text-melo-text-secondary'
                  }`}
                />
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-1 w-1 h-1 rounded-full bg-melo-green"
                    style={{ boxShadow: '0 0 8px rgba(0, 208, 132, 0.5)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
