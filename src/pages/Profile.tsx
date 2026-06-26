import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Headphones, Disc3, Radio, Sparkles, Music, Link, Unlink, LogIn, QrCode,
  Smartphone, Download, ListMusic, History, Settings2, Save, Calendar,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { ViewType } from "@/types";

const allTags = [
  "JAZZ-HIPHOP", "NEO-CLASSICAL", "AMBIENT", "INDIE", "POST-PUNK",
  "DREAM POP", "SHOEGAZE", "CITY POP", "LO-FI", "CLASSICAL",
  "柴可夫斯基", "Eminem", "坂本龙一", "邓紫棋", "Nujabes", "Radiohead",
  "下雨白噪音", "深夜代码", "晨跑节拍", "通勤路上", "咖啡时光", "凌晨三点",
];

async function trpcGet(procedure: string, input?: Record<string, unknown>) {
  let url = `/api/trpc/${procedure}`;
  if (input) url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const token = localStorage.getItem("melo_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { credentials: "include", headers });
  const json = await res.json();
  if (json.error) return null;
  return json.result?.data;
}

async function trpcPost(procedure: string, input: Record<string, unknown>) {
  const token = localStorage.getItem("melo_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (json.error) return null;
  return json.result?.data;
}

interface ArtistCount { name: string; count: number }
interface HistoryItem {
  id: number;
  songId: string;
  title: string;
  artist: string;
  cover: string | null;
  playedAt: number;
}
interface Preferences {
  moodDefault: string;
  intensityDefault: number;
  language: string;
  ttsVoice: string | null;
  ttsProvider: string;
  theme: string;
}

const MOOD_OPTIONS = ["Chill", "Focus", "Sleep", "Energetic", "Romantic", "Melancholic"];
const LANGUAGE_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const TTS_PROVIDER_OPTIONS = [
  { value: "auto", label: "自动", desc: "优先 MiMo → Fish → 浏览器" },
  { value: "mimo", label: "MiMo", desc: "小米 TTS · 白桦/Dean" },
  { value: "fish", label: "Fish.Audio", desc: "Fish.Audio TTS" },
  { value: "browser", label: "浏览器", desc: "系统内置语音" },
];

function formatJoinedSince(ts?: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getDate().toString().padStart(2, "0")}`;
}

function formatPlayedAt(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function Profile({ onNavigate }: { onNavigate: (v: ViewType) => void }) {
  const { djPersona, showToast, searchAndPlay, user, openLoginModal, neteaseSession, bindNetease, unbindNetease, importPlaylist, setTtsProvider } = useApp();
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);

  // Netease bind states
  const [showNeteaseBind, setShowNeteaseBind] = useState(false);
  const [bindMode, setBindMode] = useState<"phone" | "qr">("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [binding, setBinding] = useState(false);

  // QR login states
  const [qrImg, setQrImg] = useState("");
  const [qrStatus, setQrStatus] = useState("");
  const checkingRef = useRef(false);

  // Playlist import states
  const [playlists, setPlaylists] = useState<any[]>([]);

  // User-data states
  const [joinedAt, setJoinedAt] = useState<number | undefined>(undefined);
  const [topArtists, setTopArtists] = useState<ArtistCount[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prefs, setPrefs] = useState<Preferences>({
    moodDefault: "Chill",
    intensityDefault: 0.5,
    language: "zh",
    ttsVoice: null,
    ttsProvider: "auto",
    theme: "dark",
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Load user joined-since + history + top artists + prefs
  useEffect(() => {
    if (!user) {
      setJoinedAt(undefined); setTopArtists([]); setHistory([]); return;
    }

    trpcGet("auth.me").then((data) => {
      if (data?.user?.createdAt) setJoinedAt(Number(data.user.createdAt));
    });

    trpcGet("playlist.getHistory", { limit: 20 }).then((data) => {
      setHistory(data?.history || []);
    });

    trpcGet("playlist.topGenres", { limit: 6 }).then((data) => {
      setTopArtists(data?.topArtists || []);
    });

    trpcGet("playlist.getPreferences").then((data) => {
      if (data?.preferences) {
        setPrefs({
          moodDefault: data.preferences.moodDefault || "Chill",
          intensityDefault: data.preferences.intensityDefault ?? 0.5,
          language: data.preferences.language || "zh",
          ttsVoice: data.preferences.ttsVoice ?? null,
          ttsProvider: data.preferences.ttsProvider || "auto",
          theme: data.preferences.theme || "dark",
        });
      }
    });
  }, [user]);

  // Load playlists when neteaseSession changes
  useEffect(() => {
    if (!neteaseSession?.neteaseUid) { setPlaylists([]); return; }
    trpcGet("netease.userPlaylists", { uid: neteaseSession.neteaseUid })
      .then((data) => {
        const list = data?.playlist || [];
        setPlaylists(list.slice(0, 10));
      })
      .catch(() => setPlaylists([]));
  }, [neteaseSession?.neteaseUid]);

  const handleTagClick = async (tag: string) => {
    showToast(`Claudio 搜索「${tag}」...`);
    await searchAndPlay(tag);
    setTimeout(() => onNavigate("queue"), 800);
  };

  const handleBindNetease = async () => {
    if (!phone.trim() || !password.trim()) return;
    setBinding(true);
    try {
      await bindNetease(phone.trim(), password.trim());
      setShowNeteaseBind(false);
      setPhone(""); setPassword("");
    } finally {
      setBinding(false);
    }
  };

  const startQrLogin = useCallback(async () => {
    try {
      setQrStatus("正在获取二维码...");
      const keyData = await trpcGet("netease.qrKey");
      const key = keyData?.data?.unikey;
      if (!key) { setQrStatus("获取二维码失败"); return; }

      const createData = await trpcGet("netease.qrCreate", { key });
      const img = createData?.data?.qrimg;
      setQrImg(img || "");
      setQrStatus("请打开网易云音乐 APP 扫码");

      checkingRef.current = true;
      const poll = async () => {
        if (!checkingRef.current) return;
        try {
          const checkData = await trpcGet("netease.qrCheck", { key });
          const code = checkData?.code;
          if (code === 800) setQrStatus("等待扫码...");
          else if (code === 801) setQrStatus("请在 APP 中确认登录");
          else if (code === 802 || code === 803) {
            setQrStatus("登录成功！");
            checkingRef.current = false;
            const cookie = checkData?.cookie || "";
            const profile = checkData?.profile || checkData?.body?.profile || {};
            await trpcPost("netease.saveQrSession", {
              cookie,
              nickname: profile.nickname,
              avatar: profile.avatarUrl,
              uid: String(profile.userId || ""),
            });
            window.location.reload();
            return;
          }
        } catch {
          setQrStatus("检查状态失败...");
        }
        if (checkingRef.current) setTimeout(poll, 3000);
      };
      poll();
    } catch {
      setQrStatus("获取二维码失败，请重试");
    }
  }, []);

  useEffect(() => {
    return () => { checkingRef.current = false; };
  }, []);

  const handleImport = async (pid: string | number) => {
    await importPlaylist(pid);
    setTimeout(() => onNavigate("queue"), 600);
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      const data = await trpcPost("playlist.setPreferences", {
        moodDefault: prefs.moodDefault,
        intensityDefault: prefs.intensityDefault,
        language: prefs.language,
        ttsVoice: prefs.ttsVoice,
        ttsProvider: prefs.ttsProvider,
        theme: prefs.theme,
      });
      if (data?.success) showToast("偏好已保存");
      else showToast("保存失败，请重试");
    } catch {
      showToast("保存失败");
    } finally {
      setSavingPrefs(false);
    }
  };

  // Anonymous CTA
  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
        className="min-h-screen pb-32 flex flex-col items-center justify-center px-6 text-center"
      >
        <div className="relative mb-6">
          <img src={djPersona?.avatar} alt="Claudio" className="w-[100px] h-[100px] rounded-full border-[3px] border-white/20 object-cover opacity-70" />
        </div>
        <h2 className="font-display text-2xl font-bold text-[#f0f0f5] mb-2">Sign in to unlock your profile</h2>
        <p className="text-sm text-[#8a8a9a] max-w-[300px] mb-6 leading-relaxed">
          登录后查看你的播放历史、音乐品味分析，以及个性化偏好设置。
        </p>
        <button
          onClick={openLoginModal}
          className="px-6 py-3 rounded-xl bg-[#3b82f6] text-[#06060a] text-sm font-medium flex items-center gap-2 hover:bg-[#2563eb] transition-colors"
        >
          <LogIn size={16} /> 立即登录
        </button>
        <div className="mt-10 mx-4">
          <h2 className="text-sm tracking-[0.1em] text-[#8a8a9a] uppercase mb-3">Claudio 的曲风偏好</h2>
          <div className="flex flex-wrap gap-2 justify-center">
            {allTags.slice(0, 10).map((tag) => (
              <button
                key={tag} onClick={() => handleTagClick(tag)}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-white/[0.04] text-[#8a8a9a] border border-white/[0.06] hover:bg-[#3b82f6]/15 hover:text-[#3b82f6] hover:border-[#3b82f6]/30 transition-all"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  const maxArtistCount = topArtists[0]?.count || 1;

  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="min-h-screen pb-32">
      {/* Profile header */}
      <div className="flex flex-col items-center pt-8 pb-6">
        <div className="relative">
          <img src={djPersona?.avatar} alt={user.name} className="w-[120px] h-[120px] rounded-full border-[3px] border-white/20 object-cover" />
          <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#3b82f6] border-[3px] border-[#06060a] animate-breathe" />
        </div>
        <h1 className="font-mono text-3xl font-bold text-[#f0f0f5] mt-4 tracking-wider">{user.name}</h1>
        <div className="flex items-center gap-1.5 text-xs text-[#8a8a9a] mt-2">
          <Calendar size={11} /> Joined since {formatJoinedSince(joinedAt)}
        </div>
      </div>

      {/* Stats */}
      <div className="mx-8 grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "PLAYS", value: history.length.toString(), icon: Headphones },
          { label: "ARTISTS", value: topArtists.length.toString(), icon: Disc3 },
          { label: "ON AIR", value: "24/7", icon: Radio },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-[10px] tracking-[0.15em] text-[#4a4a5a] uppercase mb-1">{s.label}</p>
            <p className="font-display text-2xl font-bold text-[#f0f0f5]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Top artists / genres bar chart */}
      <div className="mx-4 mb-6">
        <h2 className="text-sm tracking-[0.1em] text-[#8a8a9a] uppercase mb-3 px-1 flex items-center gap-2">
          <Sparkles size={12} className="text-indigo-400" /> Top Artists
        </h2>
        <div className="glass rounded-xl p-4">
          {topArtists.length === 0 ? (
            <p className="text-xs text-[#4a4a5a] text-center py-6">还没有播放数据 · 去听点音乐吧</p>
          ) : (
            <svg width="100%" height={topArtists.length * 28 + 8} className="overflow-visible">
              {topArtists.map((a, i) => {
                const w = (a.count / maxArtistCount) * 70;
                return (
                  <g key={a.name} transform={`translate(0, ${i * 28})`}>
                    <text x={0} y={14} className="text-[11px] fill-[#8a8a9a]" dominantBaseline="middle">
                      {a.name.length > 14 ? a.name.slice(0, 14) + "…" : a.name}
                    </text>
                    <rect
                      x="30%" y={4} width={`${w}%`} height={16} rx={4}
                      fill="url(#artist-grad)"
                    />
                    <text x={`${30 + w + 1}%`} y={14} className="text-[10px] fill-[#4a4a5a]" dominantBaseline="middle">
                      {a.count}
                    </text>
                  </g>
                );
              })}
              <defs>
                <linearGradient id="artist-grad" x1="0" x2="1">
                  <stop offset="0%" stopColor="#818cf4" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
                </linearGradient>
              </defs>
            </svg>
          )}
        </div>
      </div>

      {/* Recent plays */}
      <div className="mx-4 mb-6">
        <h2 className="text-sm tracking-[0.1em] text-[#8a8a9a] uppercase mb-3 px-1 flex items-center gap-2">
          <History size={12} className="text-[#3b82f6]" /> Recent Plays
        </h2>
        <div className="glass rounded-xl p-2 max-h-[320px] overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-xs text-[#4a4a5a] text-center py-6">还没有播放记录</p>
          ) : (
            <div className="space-y-1">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.04] transition-colors">
                  <img
                    src={h.cover || "/cover-if.jpg"}
                    alt={h.title}
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f0f0f5] truncate">{h.title}</p>
                    <p className="text-xs text-[#8a8a9a] truncate">{h.artist}</p>
                  </div>
                  <span className="text-[10px] text-[#4a4a5a] shrink-0">{formatPlayedAt(h.playedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preferences form */}
      <div className="mx-4 mb-6">
        <h2 className="text-sm tracking-[0.1em] text-[#8a8a9a] uppercase mb-3 px-1 flex items-center gap-2">
          <Settings2 size={12} className="text-[#3b82f6]" /> Preferences
        </h2>
        <div className="glass rounded-xl p-4 space-y-4">
          <div>
            <label className="text-xs text-[#8a8a9a] mb-1.5 block">默认 Mood</label>
            <div className="flex flex-wrap gap-1.5">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => setPrefs((p) => ({ ...p, moodDefault: m }))}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    prefs.moodDefault === m
                      ? "bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/30"
                      : "bg-white/[0.04] text-[#8a8a9a] border-white/[0.06]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#8a8a9a] mb-1.5 block flex justify-between">
              <span>默认 Intensity</span>
              <span className="text-[#3b82f6] font-mono">{Math.round(prefs.intensityDefault * 100)}%</span>
            </label>
            <input
              type="range" min={0} max={1} step={0.05} value={prefs.intensityDefault}
              onChange={(e) => setPrefs((p) => ({ ...p, intensityDefault: parseFloat(e.target.value) }))}
              className="w-full accent-[#3b82f6]"
            />
          </div>

          <div>
            <label className="text-xs text-[#8a8a9a] mb-1.5 block">语言</label>
            <div className="flex gap-1.5">
              {LANGUAGE_OPTIONS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setPrefs((p) => ({ ...p, language: l.value }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${
                    prefs.language === l.value
                      ? "bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/30"
                      : "bg-white/[0.04] text-[#8a8a9a] border-white/[0.06]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#8a8a9a] mb-1.5 block">声音引擎</label>
            <div className="space-y-1.5">
              {TTS_PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setPrefs((p) => ({ ...p, ttsProvider: opt.value })); setTtsProvider(opt.value); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                    prefs.ttsProvider === opt.value
                      ? "bg-[#3b82f6]/10 border-[#3b82f6]/30"
                      : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    prefs.ttsProvider === opt.value ? "border-[#3b82f6]" : "border-[#4a4a5a]"
                  }`}>
                    {prefs.ttsProvider === opt.value && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                    )}
                  </div>
                  <div>
                    <p className={`text-xs font-medium ${prefs.ttsProvider === opt.value ? "text-[#3b82f6]" : "text-[#f0f0f5]"}`}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-[#4a4a5a]">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSavePrefs} disabled={savingPrefs}
            className="w-full py-2.5 rounded-xl bg-[#3b82f6] text-[#06060a] text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#2563eb] transition-colors disabled:opacity-50"
          >
            {savingPrefs ? <div className="w-4 h-4 border-2 border-[#06060a] border-t-transparent rounded-full animate-spin" /> : <><Save size={14} /> 保存偏好</>}
          </button>
        </div>
      </div>

      {/* Netease bind (preserved from original) */}
      <div className="mx-4 mb-6">
        {neteaseSession ? (
          <div className="space-y-3">
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#c20c0c]/20 flex items-center justify-center">
                <Music size={18} className="text-[#c20c0c]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#f0f0f5] truncate">{neteaseSession.nickname || "网易云音乐"}</p>
                <p className="text-xs text-[#8a8a9a]">已绑定 · UID: {neteaseSession.neteaseUid}</p>
              </div>
              <button onClick={unbindNetease} className="p-2 rounded-full hover:bg-white/5 text-[#8a8a9a] hover:text-[#ff6b6b] transition-colors">
                <Unlink size={14} />
              </button>
            </div>

            {playlists.length > 0 && (
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ListMusic size={14} className="text-[#3b82f6]" />
                  <span className="text-sm text-[#f0f0f5]">我的歌单</span>
                </div>
                <div className="space-y-2">
                  {playlists.map((pl: any) => (
                    <div key={pl.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <img src={pl.coverImgUrl || "/cover-if.jpg"} alt={pl.name} className="w-10 h-10 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#f0f0f5] truncate">{pl.name}</p>
                        <p className="text-[10px] text-[#4a4a5a]">{pl.trackCount} 首</p>
                      </div>
                      <button onClick={() => handleImport(pl.id)} className="px-2.5 py-1.5 rounded-lg bg-[#3b82f6]/15 text-[#3b82f6] text-[10px] hover:bg-[#3b82f6]/25 transition-colors flex items-center gap-1">
                        <Download size={10} /> 导入
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowNeteaseBind(!showNeteaseBind)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl glass border border-white/[0.08] hover:border-[#c20c0c]/30 transition-colors">
            <div className="flex items-center gap-3"><Music size={16} className="text-[#c20c0c]" /><span className="text-sm text-[#f0f0f5]">绑定网易云音乐</span></div>
            <span className="text-xs text-[#4a4a5a]">{showNeteaseBind ? "收起" : "绑定"}</span>
          </button>
        )}

        <AnimatePresence>
          {showNeteaseBind && !neteaseSession && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="glass rounded-xl p-4 mt-2 space-y-3">
                <div className="flex rounded-lg bg-white/5 p-0.5">
                  <button onClick={() => setBindMode("phone")} className={`flex-1 py-1.5 rounded-md text-xs flex items-center justify-center gap-1.5 transition-colors ${bindMode === "phone" ? "bg-white/10 text-[#f0f0f5]" : "text-[#8a8a9a]"}`}>
                    <Smartphone size={12} /> 手机号
                  </button>
                  <button onClick={() => { setBindMode("qr"); startQrLogin(); }} className={`flex-1 py-1.5 rounded-md text-xs flex items-center justify-center gap-1.5 transition-colors ${bindMode === "qr" ? "bg-white/10 text-[#f0f0f5]" : "text-[#8a8a9a]"}`}>
                    <QrCode size={12} /> 二维码
                  </button>
                </div>

                {bindMode === "phone" ? (
                  <>
                    <p className="text-xs text-[#8a8a9a]">输入网易云音乐手机号和密码</p>
                    <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手机号" className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-[#f0f0f5] placeholder:text-[#4a4a5a] outline-none" />
                    <button onClick={handleBindNetease} disabled={binding} className="w-full py-2.5 rounded-xl bg-[#c20c0c] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#a00a0a] transition-colors disabled:opacity-50">
                      {binding ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Link size={14} /> 绑定</>}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-2">
                    {qrImg ? (
                      <>
                        <img src={qrImg} alt="QR Code" className="w-40 h-40 rounded-xl mb-3" />
                        <p className="text-xs text-[#8a8a9a] text-center">{qrStatus}</p>
                        <button onClick={startQrLogin} className="mt-2 text-xs text-[#3b82f6] hover:underline">刷新二维码</button>
                      </>
                    ) : (
                      <div className="py-8 text-center">
                        <div className="w-8 h-8 border-2 border-[#8a8a9a] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-[#8a8a9a]">{qrStatus || "正在加载..."}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Genre Tags */}
      <div className="mx-4 mb-8">
        <h2 className="text-sm tracking-[0.1em] text-[#8a8a9a] uppercase mb-3 px-1">Claudio 的曲风偏好</h2>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button key={tag} onClick={() => handleTagClick(tag)} onMouseEnter={() => setHoveredTag(tag)} onMouseLeave={() => setHoveredTag(null)}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition-all duration-300 border ${hoveredTag === tag ? "bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/30" : "bg-white/[0.04] text-[#8a8a9a] border-white/[0.06]"}`}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="text-center pb-8"><p className="text-xs tracking-[0.2em] text-[#4a4a5a] uppercase">CLAUDIO × YOU</p></div>
    </motion.div>
  );
}
