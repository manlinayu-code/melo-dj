import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, Disc3, Radio, Sparkles, Music, Link, Unlink, LogIn, QrCode, Smartphone, Download, ListMusic } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { ViewType } from "@/types";

const allTags = [
  "JAZZ-HIPHOP", "NEO-CLASSICAL", "AMBIENT", "INDIE", "POST-PUNK",
  "DREAM POP", "SHOEGAZE", "CITY POP", "LO-FI", "CLASSICAL",
  "柴可夫斯基", "Eminem", "坂本龙一", "邓紫棋", "Nujabes", "Radiohead",
  "下雨白噪音", "深夜代码", "晨跑节拍", "通勤路上", "咖啡时光", "凌晨三点",
];

const demoTaste = {
  topArtists: [
    { name: "Nujabes", count: 47 }, { name: "坂本龙一", count: 32 },
    { name: "Radiohead", count: 28 }, { name: "MoonMoon", count: 19 }, { name: "Marconi Union", count: 15 },
  ],
  topGenres: [
    { name: "Jazz-HipHop", count: 62 }, { name: "Ambient", count: 45 },
    { name: "Neo-Classical", count: 38 }, { name: "Indie", count: 31 }, { name: "Lo-fi", count: 27 },
  ],
  totalTracks: 284, totalPlays: 1847, diversity: 0.42, energy: 0.35,
  tasteProfile: { exploratory: "high", loyalty: "medium", nocturnal: true },
};

async function trpcGet(procedure: string, input?: Record<string, unknown>) {
  let url = `/api/trpc/${procedure}`;
  if (input) url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const token = localStorage.getItem("melo_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { credentials: "include", headers });
  const json = await res.json();
  return json.result?.data;
}

export default function Profile({ onNavigate }: { onNavigate: (v: ViewType) => void }) {
  const { djPersona, showToast, searchAndPlay, user, openLoginModal, neteaseSession, bindNetease, unbindNetease, importPlaylist } = useApp();
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [radarDrawn, setRadarDrawn] = useState(false);
  const [showTaste, setShowTaste] = useState(false);

  // Netease bind states
  const [showNeteaseBind, setShowNeteaseBind] = useState(false);
  const [bindMode, setBindMode] = useState<"phone" | "qr">("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [binding, setBinding] = useState(false);

  // QR login states
  const [qrImg, setQrImg] = useState("");
  const [qrKey, setQrKey] = useState("");
  const [qrStatus, setQrStatus] = useState("");
  const checkingRef = useRef(false);

  // Playlist import states
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  useEffect(() => { const t = setTimeout(() => setRadarDrawn(true), 300); return () => clearTimeout(t); }, []);

  // Load playlists when neteaseSession changes
  useEffect(() => {
    if (!neteaseSession?.neteaseUid) { setPlaylists([]); return; }
    setLoadingPlaylists(true);
    trpcGet("netease.userPlaylists", { uid: neteaseSession.neteaseUid })
      .then((data) => {
        const list = data?.playlist || [];
        setPlaylists(list.slice(0, 10));
      })
      .catch(() => setPlaylists([]))
      .finally(() => setLoadingPlaylists(false));
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

  // QR Login flow
  const startQrLogin = useCallback(async () => {
    try {
      setQrStatus("正在获取二维码...");
      const keyData = await trpcGet("netease.qrKey");
      const key = keyData?.data?.unikey;
      if (!key) { setQrStatus("获取二维码失败"); return; }
      setQrKey(key);

      const createData = await trpcGet("netease.qrCreate", { key });
      const img = createData?.data?.qrimg;
      setQrImg(img || "");
      setQrStatus("请打开网易云音乐 APP 扫码");

      // Start polling
      checkingRef.current = true;
      const poll = async () => {
        if (!checkingRef.current) return;
        try {
          const checkData = await trpcGet("netease.qrCheck", { key });
          const code = checkData?.code;
          if (code === 800) {
            setQrStatus("等待扫码...");
          } else if (code === 801) {
            setQrStatus("请在 APP 中确认登录");
          } else if (code === 802 || code === 803) {
            setQrStatus("登录成功！");
            checkingRef.current = false;
            // Save session
            const cookie = checkData?.cookie || "";
            const profile = checkData?.profile || checkData?.body?.profile || {};
            await trpcPost("netease.saveQrSession", {
              cookie,
              nickname: profile.nickname,
              avatar: profile.avatarUrl,
              uid: String(profile.userId || ""),
            });
            // Refresh session state
            window.location.reload();
            return;
          } else if (code === 803) {
            setQrStatus("二维码已过期，请重试");
            checkingRef.current = false;
            return;
          }
        } catch {
          setQrStatus("检查状态失败...");
        }
        if (checkingRef.current) {
          setTimeout(poll, 3000);
        }
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

  const taste = demoTaste;

  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="min-h-screen pb-32">
      {/* DJ Card */}
      <div className="flex flex-col items-center pt-8 pb-6">
        <div className="relative">
          <img src={djPersona?.avatar} alt="Claudio" className="w-[120px] h-[120px] rounded-full border-[3px] border-white/20 object-cover" />
          <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#00d084] border-[3px] border-[#06060a] animate-breathe" />
        </div>
        <h1 className="font-mono text-3xl font-bold text-[#f0f0f5] mt-4 tracking-wider">{djPersona?.name || "Claudio"}</h1>
        <p className="text-sm text-[#00d084] mt-1">{djPersona?.tagline || ""}</p>
        <p className="text-sm text-[#8a8a9a] text-center max-w-[320px] mt-3 leading-relaxed px-4">{djPersona?.bio || ""}</p>
      </div>

      {/* Stats */}
      <div className="mx-8 grid grid-cols-3 gap-4 mb-8">
        {[{ label: "ON AIR", value: "24/7", icon: Radio }, { label: "GENRES", value: "∞", icon: Disc3 }, { label: "LISTENERS", value: "1", icon: Headphones }].map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-[10px] tracking-[0.15em] text-[#4a4a5a] uppercase mb-1">{s.label}</p>
            <p className="font-display text-2xl font-bold text-[#f0f0f5]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Netease Bind */}
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

            {/* Playlists */}
            {playlists.length > 0 && (
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ListMusic size={14} className="text-[#00d084]" />
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
                      <button onClick={() => handleImport(pl.id)} className="px-2.5 py-1.5 rounded-lg bg-[#00d084]/15 text-[#00d084] text-[10px] hover:bg-[#00d084]/25 transition-colors flex items-center gap-1">
                        <Download size={10} /> 导入
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : user ? (
          <button onClick={() => setShowNeteaseBind(!showNeteaseBind)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl glass border border-white/[0.08] hover:border-[#c20c0c]/30 transition-colors">
            <div className="flex items-center gap-3"><Music size={16} className="text-[#c20c0c]" /><span className="text-sm text-[#f0f0f5]">绑定网易云音乐</span></div>
            <span className="text-xs text-[#4a4a5a]">{showNeteaseBind ? "收起" : "绑定"}</span>
          </button>
        ) : (
          <button onClick={openLoginModal} className="w-full flex items-center justify-between px-4 py-3 rounded-xl glass border border-white/[0.08] hover:border-[#00d084]/30 transition-colors">
            <div className="flex items-center gap-3"><LogIn size={16} className="text-[#00d084]" /><span className="text-sm text-[#f0f0f5]">登录后绑定网易云音乐</span></div>
            <span className="text-xs text-[#4a4a5a]">登录</span>
          </button>
        )}

        <AnimatePresence>
          {showNeteaseBind && !neteaseSession && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="glass rounded-xl p-4 mt-2 space-y-3">
                {/* Mode toggle */}
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
                        <button onClick={startQrLogin} className="mt-2 text-xs text-[#00d084] hover:underline">刷新二维码</button>
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

      {/* Taste Analysis */}
      <div className="mx-4 mb-6">
        <button onClick={() => setShowTaste(!showTaste)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl glass border border-white/[0.08] hover:border-indigo-500/20 transition-colors">
          <div className="flex items-center gap-3"><Sparkles size={16} className="text-indigo-400" /><span className="text-sm text-[#f0f0f5]">Claudio 的音乐品味分析</span></div>
          <span className="text-xs text-[#4a4a5a]">{showTaste ? "收起" : "展开"}</span>
        </button>
        {showTaste && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="overflow-hidden">
            <div className="glass rounded-xl p-4 mt-2 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[{ k: "Total Tracks", v: taste.totalTracks }, { k: "Total Plays", v: taste.totalPlays }, { k: "Diversity", v: `${Math.round(taste.diversity * 100)}%` }, { k: "Energy", v: `${Math.round(taste.energy * 100)}%` }].map((item) => (
                  <div key={item.k} className="p-3 rounded-lg bg-white/[0.03]"><p className="text-[10px] text-[#4a4a5a] uppercase tracking-wider">{item.k}</p><p className="text-lg font-display font-bold text-[#f0f0f5]">{item.v}</p></div>
                ))}
              </div>
              <div>
                <p className="text-xs text-[#4a4a5a] mb-2">Most Played Artists</p>
                <div className="space-y-2">
                  {(taste.topArtists || []).map((a, i) => (
                    <div key={a.name} className="flex items-center gap-2">
                      <span className="text-xs text-[#4a4a5a] w-4">{i + 1}</span>
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500/60 to-indigo-400/40 rounded-full" style={{ width: `${(a.count / (taste.topArtists[0]?.count || 1)) * 100}%` }} /></div>
                      <span className="text-xs text-[#8a8a9a] w-16 text-right truncate">{a.name}</span>
                      <span className="text-[10px] text-[#4a4a5a] w-8 text-right">{a.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[taste.tasteProfile.nocturnal ? "夜行动物" : null, taste.tasteProfile.exploratory === "high" ? "探索型听众" : "忠实型听众", taste.energy < 0.4 ? "Chill 系" : "高能量", taste.diversity > 0.3 ? "杂食性" : "专一型"].filter(Boolean).map((badge) => (
                  <span key={badge} className="px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-[10px] border border-indigo-500/20">{badge}</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Genre Tags */}
      <div className="mx-4 mb-8">
        <h2 className="text-sm tracking-[0.1em] text-[#8a8a9a] uppercase mb-3 px-1">Claudio 的曲风偏好</h2>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button key={tag} onClick={() => handleTagClick(tag)} onMouseEnter={() => setHoveredTag(tag)} onMouseLeave={() => setHoveredTag(null)}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition-all duration-300 border ${hoveredTag === tag ? "bg-[#00d084]/15 text-[#00d084] border-[#00d084]/30" : "bg-white/[0.04] text-[#8a8a9a] border-white/[0.06]"}`}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Radar Chart */}
      <div className="mx-4 mb-8">
        <h2 className="text-sm tracking-[0.1em] text-[#8a8a9a] uppercase mb-4 px-1">你的音乐 DNA</h2>
        <div className="flex justify-center">
          <svg width={220} height={220} className="overflow-visible">
            {[0.2, 0.4, 0.6, 0.8, 1].map((sc) => {
              const pts = [0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI * 2 * i) / 6 - Math.PI / 2; return `${110 + 80 * sc * Math.cos(a)},${110 + 80 * sc * Math.sin(a)}`; }).join(" ");
              return <polygon key={sc} points={pts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
            })}
            {[0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI * 2 * i) / 6 - Math.PI / 2; return <line key={i} x1={110} y1={110} x2={110 + 80 * Math.cos(a)} y2={110 + 80 * Math.sin(a)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />; })}
            {["能量", "流行", "复古", "氛围", "节奏", "人声"].map((label, i) => {
              const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
              return <text key={label} x={110 + 108 * Math.cos(a)} y={110 + 108 * Math.sin(a)} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-[#8a8a9a]">{label}</text>;
            })}
            <motion.path
              d={[0.6, 0.4, 0.7, 0.9, 0.5, 0.5].map((v, i) => { const a = (Math.PI * 2 * i) / 6 - Math.PI / 2; return `${i === 0 ? "M" : "L"}${110 + 80 * v * Math.cos(a)},${110 + 80 * v * Math.sin(a)}`; }).join(" ") + " Z"}
              fill="rgba(129,140,244,0.08)" stroke="#818cf4" strokeWidth="1.5"
              initial={{ pathLength: 0, opacity: 0 }} animate={radarDrawn ? { pathLength: 1, opacity: 1 } : {}} transition={{ duration: 1.5 }} />
            <circle cx={110} cy={110} r="4" fill="#818cf4" className="animate-radar-pulse" />
          </svg>
        </div>
      </div>

      <div className="text-center pb-8"><p className="text-xs tracking-[0.2em] text-[#4a4a5a] uppercase">CLAUDIO × YOU</p></div>
    </motion.div>
  );
}

async function trpcPost(procedure: string, input: Record<string, unknown>) {
  const token = localStorage.getItem("melo_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ json: input }),
  });
  const json = await res.json();
  return json.result?.data;
}
