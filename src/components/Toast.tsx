import { motion, AnimatePresence } from 'framer-motion';

interface ToastProps {
  message: string;
  visible: boolean;
}

export default function Toast({ message, visible }: ToastProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-4 left-4 right-4 z-[60] flex justify-center"
        >
          <div className="glass-strong px-5 py-3 rounded-xl border-l-[3px] border-l-melo-green flex items-center gap-3 max-w-md">
            <div className="w-5 h-5 rounded-full bg-melo-green/20 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="#00d084" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm text-melo-text">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
