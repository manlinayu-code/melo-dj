import { motion } from 'framer-motion';

interface BreathingOrbProps {
  isListening?: boolean;
  isSpeaking?: boolean;
  isPlaying?: boolean;
  onClick?: () => void;
}

export default function BreathingOrb({ isListening = false, isSpeaking = false, isPlaying = false, onClick }: BreathingOrbProps) {
  const getColor = () => {
    if (isSpeaking) return 'from-indigo-500/40 to-violet-500/30';
    if (isPlaying) return 'from-emerald-500/30 to-cyan-500/20';
    if (isListening) return 'from-amber-500/20 to-orange-500/15';
    return 'from-slate-500/15 to-slate-600/10';
  };

  const getGlowColor = () => {
    if (isSpeaking) return 'rgba(129, 140, 248, 0.3)';
    if (isPlaying) return 'rgba(0, 208, 132, 0.2)';
    if (isListening) return 'rgba(245, 158, 11, 0.15)';
    return 'rgba(100, 116, 139, 0.1)';
  };

  return (
    <motion.button
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Outer glow ring */}
      <motion.div
        className={`absolute w-24 h-24 rounded-full bg-gradient-to-br ${getColor()}`}
        animate={{
          scale: isSpeaking ? [1, 1.15, 1] : isPlaying ? [1, 1.08, 1] : [1, 1.05, 1],
          opacity: isSpeaking ? [0.6, 0.9, 0.6] : isPlaying ? [0.4, 0.7, 0.4] : [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: isSpeaking ? 2 : isPlaying ? 3 : 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ boxShadow: `0 0 60px ${getGlowColor()}, 0 0 120px ${getGlowColor()}` }}
      />

      {/* Middle ring */}
      <motion.div
        className={`absolute w-16 h-16 rounded-full bg-gradient-to-br ${getColor()}`}
        animate={{
          scale: isSpeaking ? [1, 1.1, 1] : [1, 1.03, 1],
          opacity: isSpeaking ? [0.8, 1, 0.8] : [0.5, 0.7, 0.5],
        }}
        transition={{
          duration: isSpeaking ? 1.5 : 3,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.3,
        }}
      />

      {/* Core orb */}
      <motion.div
        className="relative w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center"
        animate={{
          scale: isSpeaking ? [1, 1.05, 1] : [1, 1.02, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-indigo-400' : isPlaying ? 'bg-emerald-400' : isListening ? 'bg-amber-400' : 'bg-slate-400'}`} />
      </motion.div>

      {/* Ripple rings */}
      {isSpeaking && (
        <>
          <motion.div
            className="absolute w-32 h-32 rounded-full border border-indigo-400/20"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute w-32 h-32 rounded-full border border-indigo-400/15"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.7 }}
          />
        </>
      )}
    </motion.button>
  );
}
