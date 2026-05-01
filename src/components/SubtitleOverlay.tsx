import { motion, AnimatePresence } from 'framer-motion';

interface SubtitleOverlayProps {
  text: string;
  visible: boolean;
  radioMode?: boolean;
}

export default function SubtitleOverlay({ text, visible, radioMode = false }: SubtitleOverlayProps) {
  // Split text by ellipsis for dramatic pauses
  const segments = text.split(/\.{3,}|\u2026{2,}/g).filter(Boolean);

  return (
    <AnimatePresence>
      {visible && text && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.6 }}
          className={`fixed bottom-24 left-4 right-4 z-40 flex justify-center ${radioMode ? 'pointer-events-none' : ''}`}
        >
          <div className="glass-strong px-6 py-4 rounded-2xl max-w-lg text-center">
            {radioMode ? (
              <div className="space-y-1">
                <div className="text-[10px] tracking-[0.3em] text-indigo-400 uppercase mb-2">Radio Mode — Claudio on Air</div>
                {segments.map((seg, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.3 }}
                    className="text-sm text-melo-text/90 leading-relaxed font-light"
                  >
                    {seg.trim()}
                    {i < segments.length - 1 && <span className="text-indigo-400/60"> ...</span>}
                  </motion.p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-melo-text/90 leading-relaxed">{text}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
