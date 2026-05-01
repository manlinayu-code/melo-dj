import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Lock, LogIn, UserPlus } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (name: string, password: string) => Promise<void>;
  onRegister: (name: string, password: string) => Promise<void>;
  error: string | null;
}

export default function LoginModal({ isOpen, onClose, onLogin, onRegister, error }: LoginModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password.trim() || loading) return;
    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(name.trim(), password.trim());
      } else {
        await onRegister(name.trim(), password.trim());
      }
      setName("");
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm glass-strong rounded-2xl p-6"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-[#4a4a5a] hover:text-[#f0f0f5] transition-colors">
              <X size={18} />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-xl font-display font-bold text-[#f0f0f5]">
                {mode === "login" ? "Welcome Back" : "Join Claudio"}
              </h2>
              <p className="text-xs text-[#8a8a9a] mt-1">
                {mode === "login" ? "登录以同步你的播放历史" : "创建一个账号，开启你的电台之旅"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a4a5a]" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="昵称"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none focus:border-[#00d084]/50 transition-colors"
                />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a4a5a]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码（至少4位）"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none focus:border-[#00d084]/50 transition-colors"
                />
              </div>

              {error && (
                <p className="text-xs text-[#ff6b6b] text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#00d084] text-[#06060a] font-medium text-sm flex items-center justify-center gap-2 hover:bg-[#00a86b] transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-[#06060a] border-t-transparent rounded-full animate-spin" />
                ) : mode === "login" ? (
                  <><LogIn size={16} /> 登录</>
                ) : (
                  <><UserPlus size={16} /> 注册</>
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-xs text-[#8a8a9a] hover:text-[#00d084] transition-colors"
              >
                {mode === "login" ? "还没有账号？立即注册" : "已有账号？立即登录"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
