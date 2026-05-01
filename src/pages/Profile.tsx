import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Headphones, Disc3, Clock, Sparkles, Radio } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { ViewType } from '@/types';

const artistTags = ['柴可夫斯基', 'Eminem', '坂本龙一', '邓紫棋', 'Nujabes', 'Radiohead', 'Marconi Union', 'MoonMoon'];
const sceneTags = ['下雨白噪音', '深夜代码', '晨跑节拍', '通勤路上', '咖啡时光', '凌晨三点'];
const allTags = [
  'JAZZ-HIPHOP', 'NEO-CLASSICAL', 'AMBIENT', 'INDIE', 'POST-PUNK',
  'DREAM POP', 'SHOEGAZE', 'CITY POP', 'LO-FI', 'CLASSICAL',
  ...artistTags, ...sceneTags,
];

// Simulated taste data
const demoTaste = {
  topArtists: [
    { name: 'Nujabes', count: 47 },
    { name: '坂本龙一', count: 32 },
    { name: 'Radiohead', count: 28 },
    { name: 'MoonMoon', count: 19 },
    { name: 'Marconi Union', count: 15 },
  ],
  topGenres: [
    { name: 'Jazz-HipHop', count: 62 },
    { name: 'Ambient', count: 45 },
    { name: 'Neo-Classical', count: 38 },
    { name: 'Indie', count: 31 },
    { name: 'Lo-fi', count: 27 },
  ],
  totalTracks: 284,
  totalPlays: 1847,
  diversity: 0.42,
  dominantTime: 'nightOwl',
  energy: 0.35,
  tasteProfile: { exploratory: 'high', loyalty: 'medium', nocturnal: true },
};

export default function Profile({ onNavigate }: { onNavigate: (v: ViewType) => void }) {
  const { djPersona, showToast, searchAndPlay, userTaste } = useApp();
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [radarDrawn, setRadarDrawn] = useState(false);
  const [showTaste, setShowTaste] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRadarDrawn(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleTagClick = async (tag: string) => {
    showToast(`Claudio 正在为你搜索「${tag}」风格的歌`);
    await searchAndPlay(tag);
    setTimeout(() => onNavigate('queue'), 800);
  };

  const taste = userTaste || demoTaste;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="min-h-screen pb-32"
    >
      {/* DJ Card */}
      <div className="flex flex-col items-center pt-8 pb-6">
        <div className="relative">
          <img
            src={djPersona.avatar}
            alt={djPersona.name}
            className="w-[120px] h-[120px] rounded-full border-[3px] border-white/20 object-cover"
          />
          <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-melo-green border-[3px] border-melo-base animate-breathe" />
        </div>
        <h1 className="font-mono text-3xl font-bold text-melo-text mt-4 tracking-wider">{djPersona.name}</h1>
        <p className="text-sm text-melo-green mt-1">{djPersona.tagline}</p>
        <p className="text-sm text-melo-text-secondary text-center max-w-[320px] mt-3 leading-relaxed px-4">
          {djPersona.bio}
        </p>
      </div>

      {/* Stats */}
      <div className="mx-8 grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'ON AIR', value: '24/7', icon: Radio },
          { label: 'GENRES', value: '∞', icon: Disc3 },
          { label: 'LISTENERS', value: '1', icon: Headphones },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-[10px] tracking-[0.15em] text-melo-text-dim uppercase mb-1">{stat.label}</p>
            <p className="font-display text-2xl font-bold text-melo-text">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Taste Analysis Toggle */}
      <div className="mx-4 mb-6">
        <button
          onClick={() => setShowTaste(!showTaste)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl glass border border-white/[0.08] hover:border-indigo-500/20 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Sparkles size={16} className="text-indigo-400" />
            <span className="text-sm text-melo-text">Claudio 的音乐品味分析</span>
          </div>
          <span className="text-xs text-melo-text-dim">{showTaste ? '收起' : '展开'}</span>
        </button>

        {showTaste && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-xl p-4 mt-2 space-y-4">
              {/* Taste stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-white/[0.03]">
                  <p className="text-[10px] text-melo-text-dim uppercase tracking-wider">Total Tracks</p>
                  <p className="text-lg font-display font-bold text-melo-text">{taste.totalTracks}</p>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.03]">
                  <p className="text-[10px] text-melo-text-dim uppercase tracking-wider">Total Plays</p>
                  <p className="text-lg font-display font-bold text-melo-text">{taste.totalPlays}</p>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.03]">
                  <p className="text-[10px] text-melo-text-dim uppercase tracking-wider">Diversity</p>
                  <p className="text-lg font-display font-bold text-melo-text">{Math.round(taste.diversity * 100)}%</p>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.03]">
                  <p className="text-[10px] text-melo-text-dim uppercase tracking-wider">Energy</p>
                  <p className="text-lg font-display font-bold text-melo-text">{Math.round(taste.energy * 100)}%</p>
                </div>
              </div>

              {/* Top Artists */}
              <div>
                <p className="text-xs text-melo-text-dim mb-2 flex items-center gap-1">
                  <Clock size={12} /> Most Played Artists
                </p>
                <div className="space-y-2">
                  {taste.topArtists.map((a, i) => (
                    <div key={a.name} className="flex items-center gap-2">
                      <span className="text-xs text-melo-text-dim w-4">{i + 1}</span>
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500/60 to-indigo-400/40 rounded-full"
                          style={{ width: `${(a.count / taste.topArtists[0].count) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-melo-text-secondary w-16 text-right">{a.name}</span>
                      <span className="text-[10px] text-melo-text-dim w-8 text-right">{a.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Taste profile badges */}
              <div className="flex gap-2 flex-wrap">
                {[
                  taste.tasteProfile.nocturnal ? '夜行动物' : null,
                  taste.tasteProfile.exploratory === 'high' ? '探索型听众' : '忠实型听众',
                  taste.energy < 0.4 ? 'Chill 系' : '高能量',
                  taste.diversity > 0.3 ? '杂食性' : '专一型',
                ].filter(Boolean).map((badge) => (
                  <span key={badge} className="px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-[10px] border border-indigo-500/20">
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Genre Tags */}
      <div className="mx-4 mb-8">
        <h2 className="text-sm tracking-[0.1em] text-melo-text-secondary uppercase mb-3 px-1">Claudio 的曲风偏好</h2>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              onMouseEnter={() => setHoveredTag(tag)}
              onMouseLeave={() => setHoveredTag(null)}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition-all duration-300 border ${
                hoveredTag === tag
                  ? 'bg-melo-green/15 text-melo-green border-melo-green/30'
                  : 'bg-white/[0.04] text-melo-text-secondary border-white/[0.06]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Music DNA Radar */}
      <div className="mx-4 mb-8">
        <h2 className="text-sm tracking-[0.1em] text-melo-text-secondary uppercase mb-4 px-1">你的音乐 DNA</h2>
        <div className="flex justify-center">
          <RadarChart drawn={radarDrawn} energy={taste.energy} diversity={taste.diversity} nocturnal={taste.tasteProfile.nocturnal} />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8">
        <p className="text-xs tracking-[0.2em] text-melo-text-dim uppercase">CLAUDIO × YOU</p>
      </div>
    </motion.div>
  );
}

function RadarChart({ drawn, energy, diversity, nocturnal }: { drawn: boolean; energy: number; diversity: number; nocturnal: boolean }) {
  const size = 220;
  const center = size / 2;
  const radius = 80;
  const labels = ['能量', '流行', '复古', '氛围', '节奏', '人声'];
  const values = [
    energy,
    0.4,
    0.7,
    nocturnal ? 0.9 : 0.6,
    diversity,
    0.5,
  ];

  const points = labels.map((_, i) => {
    const angle = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
    const value = drawn ? values[i] : 0;
    const r = radius * value;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <svg width={size} height={size} className="overflow-visible">
      {[0.2, 0.4, 0.6, 0.8, 1].map((scale) => {
        const r = radius * scale;
        const hexPoints = labels.map((_, i) => {
          const angle = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
          return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
        }).join(' ');
        return <polygon key={scale} points={hexPoints} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}

      {labels.map((_, i) => {
        const angle = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}

      <motion.path
        d={pathD}
        fill="rgba(129, 140, 244, 0.08)"
        stroke="#818cf4"
        strokeWidth="1.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={drawn ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill="#818cf4"
          initial={{ opacity: 0, scale: 0 }}
          animate={drawn ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
          transition={{ duration: 0.3, delay: 1.2 + i * 0.1 }}
        />
      ))}

      <circle cx={center} cy={center} r="4" fill="#818cf4" className="animate-radar-pulse" />

      {labels.map((label, i) => {
        const angle = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
        const lx = center + (radius + 28) * Math.cos(angle);
        const ly = center + (radius + 28) * Math.sin(angle);
        return (
          <text key={label} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-melo-text-secondary" style={{ fontFamily: 'Inter, sans-serif' }}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}
