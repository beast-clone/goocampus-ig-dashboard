"use client";
import { useEffect, useMemo, useState } from "react";
import {
  IconLayoutGrid, IconChartLine, IconCalendarEvent, IconSpeakerphone,
  IconUsers, IconWand, IconSettings, IconSearch, IconBell, IconMail,
  IconArrowUpRight, IconArrowDownRight, IconBrandInstagram, IconHeart,
  IconMessageCircle, IconEye,
} from "@tabler/icons-react";

// Exact Hope UI tokens (pulled from the live demo).
const C = {
  primary: "#3A57E8", primaryDark: "#2138B0", navy: "#001F4D",
  heading: "#232D42", muted: "#8A92A6", bg: "#F5F6FA", card: "#FFFFFF",
  teal: "#079AA2", success: "#1AA053", danger: "#C03221", line: "#EEF0F4",
  chip: "#F0F2F8", pink: "#E83A8A",
};
const SHADOW = "0 10px 30px rgba(35,45,66,0.06)";

type Insights = {
  totals: { followers: number; reach: number; engagement: number; profileVisits: number; newFollowers: number };
  deltas: { followers: number; reach: number; engagement: number; profileVisits: number };
  series: { date: string; reach: number; engagement: number }[];
};
type Post = { id: string; caption: string; mediaUrl: string; permalink: string; type: string; timestamp: string; likes: number; comments: number; reach: number; totalInteractions: number };
type Audience = { gender?: { label: string; value: number }[]; countries?: { label: string; value: number }[] };

const fmt = (n: number) => n.toLocaleString("en-IN");
const kfmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K" : String(n);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

function typeChip(t: string) {
  const s = (t || "").toLowerCase();
  if (s.includes("reel")) return { bg: "#FCE7F0", fg: C.pink, label: "Reel" };
  if (s.includes("carousel")) return { bg: "#E9ECFB", fg: C.primary, label: "Carousel" };
  return { bg: "#E1F4F5", fg: C.teal, label: "Post" };
}

export function HopeOverview() {
  const [ins, setIns] = useState<Insights | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [aud, setAud] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    Promise.all([
      fetch(`/api/insights?accountId=goocampus&from=${from}&to=${to}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/posts?accountId=goocampus&from=${from}&to=${to}&limit=10&insights=true`).then((r) => r.json()).catch(() => ({ posts: [] })),
      fetch(`/api/audience?accountId=goocampus`).then((r) => r.json()).catch(() => null),
    ]).then(([i, p, a]) => {
      if (i) setIns(i as Insights);
      setPosts(((p?.posts || []) as Post[]));
      if (a) setAud(a as Audience);
    }).finally(() => setLoading(false));
  }, []);

  const t = ins?.totals, d = ins?.deltas;
  const engRate = t && t.reach > 0 ? Math.round((t.engagement / t.reach) * 1000) / 10 : 0;
  const stats = t && d ? [
    { label: "Followers", value: fmt(t.followers), delta: d.followers },
    { label: "Reach", value: fmt(t.reach), delta: d.reach },
    { label: "Engagement", value: fmt(t.engagement), delta: d.engagement },
    { label: "Profile Visits", value: fmt(t.profileVisits), delta: d.profileVisits },
    { label: "Eng. Rate", value: `${engRate}%`, delta: 0, flat: true },
  ] : [];

  const topPosts = [...posts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 5);
  const latest = [...posts].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.heading }}>
      {/* ───────── Sidebar ───────── */}
      <aside style={{ width: 256, background: C.card, borderRight: `1px solid ${C.line}`, position: "sticky", top: 0, height: "100vh", padding: "0 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "22px 8px 20px" }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: C.primary, display: "grid", placeItems: "center", color: "#fff", transform: "rotate(45deg)" }}>
            <IconBrandInstagram size={18} style={{ transform: "rotate(-45deg)" }} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 19, color: C.heading }}>GooCampus</span>
        </div>
        <NavGroup label="Dashboards" />
        <NavItem icon={IconLayoutGrid} label="Overview" active />
        <NavItem icon={IconChartLine} label="Analytics" />
        <NavItem icon={IconUsers} label="Audience" />
        <NavGroup label="Content" />
        <NavItem icon={IconCalendarEvent} label="Publishing Calendar" />
        <NavItem icon={IconWand} label="Post Planner" />
        <NavItem icon={IconSpeakerphone} label="Ads" />
        <NavGroup label="System" />
        <NavItem icon={IconSettings} label="Integrations" />
      </aside>

      {/* ───────── Main ───────── */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", background: C.card, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, borderRadius: 10, padding: "9px 14px", width: 320, color: C.muted }}>
            <IconSearch size={17} /><span style={{ fontSize: 13.5 }}>Search…</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18, color: C.muted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E9FBEF", color: C.success, fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: C.success }} /> Live
            </span>
            <IconBell size={19} /><IconMail size={19} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 999, background: `linear-gradient(135deg, ${C.primary}, ${C.teal})`, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>ME</span>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.heading }}>Maheen Ejaz</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>Co-founder &amp; CMO</div>
              </div>
            </div>
          </div>
        </header>

        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22, maxWidth: 1320, margin: "0 auto" }}>
          {/* Hero */}
          <section style={{ position: "relative", overflow: "hidden", borderRadius: 16, padding: "30px 34px", background: `linear-gradient(120deg, ${C.primary} 0%, ${C.primaryDark} 55%, ${C.navy} 100%)`, color: "#fff", boxShadow: "0 18px 40px rgba(58,87,232,0.28)" }}>
            <div style={{ position: "absolute", right: -40, top: -60, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ position: "absolute", right: 90, bottom: -90, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>@goocampus · last 30 days</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, margin: "8px 0 6px", letterSpacing: "-0.5px" }}>{greeting()}, GooCampus 👋</h1>
              <p style={{ fontSize: 15, opacity: 0.92, maxWidth: 560, lineHeight: 1.55, margin: 0 }}>
                {t ? <>You gained <b>{fmt(t.newFollowers)}</b> new followers this period{d ? <> — reach is <b>{d.reach >= 0 ? "up" : "down"} {Math.abs(d.reach).toFixed(1)}%</b> and engagement <b>{d.engagement >= 0 ? "up" : "down"} {Math.abs(d.engagement).toFixed(1)}%</b>. Solid month.</> : "."}</> : "Loading your latest performance…"}
              </p>
            </div>
          </section>

          {/* Stat cards */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
            {loading && !ins ? [0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 108, background: C.card, borderRadius: 14, boxShadow: SHADOW }} />)
              : stats.map((s) => <StatCard key={s.label} {...s} />)}
          </section>

          {/* Chart + Audience */}
          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 18 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.4px" }}>{t ? fmt(t.reach) : "—"}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>Reach this period</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <Legend color={C.primary} label="Reach" /><Legend color={C.teal} label="Engagement" />
                  <span style={{ fontSize: 12.5, color: C.muted, background: C.bg, padding: "7px 13px", borderRadius: 9, fontWeight: 500 }}>Last 30 days ▾</span>
                </div>
              </div>
              {ins && <AreaChart series={ins.series} />}
            </Card>

            <Card>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Who you reached</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>Audience split</div>
              <GenderDonut gender={aud?.gender || []} />
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
                {(aud?.countries || []).slice(0, 4).map((c, i) => {
                  const max = Math.max(1, ...(aud?.countries || []).slice(0, 4).map((x) => x.value));
                  return (
                    <div key={c.label} style={{ display: "grid", gridTemplateColumns: "88px 1fr 40px", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <span style={{ color: C.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                      <span style={{ height: 7, background: C.line, borderRadius: 99, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(c.value / max) * 100}%`, background: [C.primary, C.teal, "#7B8CF5", "#9AA6B2"][i], borderRadius: 99 }} /></span>
                      <span style={{ color: C.muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{kfmt(c.value)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          {/* Latest posts */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Latest posts</div>
              <span style={{ fontSize: 12.5, color: C.primary, fontWeight: 600 }}>View all →</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
              {(loading && !posts.length ? Array.from({ length: 5 }) : latest).map((p, i) => {
                const post = p as Post | undefined;
                if (!post) return <div key={i} style={{ height: 210, background: C.bg, borderRadius: 12 }} />;
                const chip = typeChip(post.type);
                return (
                  <div key={post.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.card }}>
                    <div style={{ position: "relative", aspectRatio: "1/1", background: C.bg }}>
                      {post.mediaUrl ? <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                      <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: chip.bg, color: chip.fg }}>{chip.label}</span>
                    </div>
                    <div style={{ padding: "10px 11px" }}>
                      <div style={{ fontSize: 12, color: C.heading, lineHeight: 1.35, height: 32, overflow: "hidden" }}>{(post.caption || "").split("\n")[0].slice(0, 60) || "(no caption)"}</div>
                      <div style={{ display: "flex", gap: 12, marginTop: 8, color: C.muted, fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconEye size={13} /> {kfmt(post.reach || 0)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconHeart size={13} /> {kfmt(post.likes || 0)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconMessageCircle size={13} /> {kfmt(post.comments || 0)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Top performers */}
          <Card>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Top performing posts</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.muted, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700 }}>#</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700 }}>Post</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700 }}>Type</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700 }}>Reach</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700 }}>Likes</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700 }}>ER</th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map((p, i) => {
                    const chip = typeChip(p.type);
                    const er = p.reach > 0 ? ((p.totalInteractions || (p.likes + p.comments)) / p.reach * 100).toFixed(1) : "0";
                    return (
                      <tr key={p.id} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={{ padding: "10px", color: C.muted, fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <span style={{ width: 34, height: 34, borderRadius: 8, background: C.bg, overflow: "hidden", flexShrink: 0 }}>{p.mediaUrl ? <img src={p.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
                            <span style={{ color: C.heading, maxWidth: 320, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(p.caption || "").split("\n")[0].slice(0, 60) || "(no caption)"}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px" }}><span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: chip.bg, color: chip.fg }}>{chip.label}</span></td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(p.reach || 0)}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: C.muted, fontVariantNumeric: "tabular-nums" }}>{fmt(p.likes || 0)}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: C.success, fontWeight: 600 }}>{er}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", paddingBottom: 8 }}>
            Hope UI style · complete Overview · real @goocampus data · <span style={{ color: C.primary, fontWeight: 600 }}>feat/hope-ui-reskin</span>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- pieces ---------- */
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.card, borderRadius: 16, boxShadow: SHADOW, padding: "22px 24px" }}>{children}</div>;
}
function NavGroup({ label }: { label: string }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#B3B9C6", padding: "18px 10px 6px" }}>{label}</div>;
}
function NavItem({ icon: Icon, label, active }: { icon: typeof IconLayoutGrid; label: string; active?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, marginBottom: 2, cursor: "pointer", background: active ? C.primary : "transparent", color: active ? "#fff" : C.muted, fontWeight: active ? 600 : 500, fontSize: 14, boxShadow: active ? "0 8px 18px rgba(58,87,232,0.30)" : "none" }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: active ? "rgba(255,255,255,0.18)" : C.chip, color: active ? "#fff" : C.muted, flexShrink: 0 }}><Icon size={17} stroke={1.8} /></span>
      {label}
    </div>
  );
}
function StatCard({ label, value, delta, flat }: { label: string; value: string; delta: number; flat?: boolean }) {
  const up = delta >= 0;
  const pct = Math.min(100, Math.abs(delta) * 4 + 12);
  const R = 24, CIRC = 2 * Math.PI * R;
  const col = flat ? C.primary : up ? C.success : C.danger;
  return (
    <div style={{ background: C.card, borderRadius: 14, boxShadow: SHADOW, padding: "18px", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: 58, height: 58, flexShrink: 0 }}>
        <svg width="58" height="58" viewBox="0 0 58 58">
          <circle cx="29" cy="29" r={R} fill="none" stroke={C.line} strokeWidth="5" />
          <circle cx="29" cy="29" r={R} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)} transform="rotate(-90 29 29)" />
        </svg>
        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: col }}>{flat ? <IconChartLine size={18} /> : up ? <IconArrowUpRight size={19} /> : <IconArrowDownRight size={19} />}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.15 }}>{value}</div>
        {!flat && <div style={{ fontSize: 12, fontWeight: 600, color: col }}>{up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%</div>}
      </div>
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.muted }}><span style={{ width: 9, height: 9, borderRadius: 99, background: color }} /> {label}</span>;
}
function GenderDonut({ gender }: { gender: { label: string; value: number }[] }) {
  const total = Math.max(1, gender.reduce((s, g) => s + g.value, 0));
  const colors = [C.primary, C.pink, "#C7CEDB"];
  let acc = 0;
  const R = 52, CIRC = 2 * Math.PI * R;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ position: "relative", width: 120, height: 120 }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} fill="none" stroke={C.line} strokeWidth="14" />
          {gender.map((g, i) => {
            const frac = g.value / total; const dash = frac * CIRC; const off = -acc * CIRC; acc += frac;
            return <circle key={g.label} cx="60" cy="60" r={R} fill="none" stroke={colors[i % colors.length]} strokeWidth="14" strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={off} transform="rotate(-90 60 60)" />;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div><div style={{ fontSize: 19, fontWeight: 700 }}>{kfmt(total)}</div><div style={{ fontSize: 10.5, color: C.muted }}>reached</div></div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {gender.map((g, i) => (
          <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: colors[i % colors.length] }} />
            <span style={{ color: C.heading, textTransform: "capitalize" }}>{g.label}</span>
            <span style={{ color: C.muted }}>{Math.round((g.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function AreaChart({ series }: { series: Insights["series"] }) {
  const W = 1120, H = 220, PB = 26, PT = 12, PL = 8, PR = 8;
  const pts = (series || []).filter((s) => typeof s.reach === "number");
  const path = useMemo(() => {
    if (pts.length < 2) return { area: "", line: "", eng: "" };
    const maxR = Math.max(1, ...pts.map((p) => p.reach));
    const maxE = Math.max(1, ...pts.map((p) => p.engagement || 0));
    const x = (i: number) => PL + (i / (pts.length - 1)) * (W - PL - PR);
    const yR = (v: number) => PT + (1 - v / maxR) * (H - PT - PB);
    const yE = (v: number) => PT + (1 - v / maxE) * (H - PT - PB);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yR(p.reach).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z`;
    const eng = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yE(p.engagement || 0).toFixed(1)}`).join(" ");
    return { area, line, eng };
  }, [pts]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
      <defs><linearGradient id="hpFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.primary} stopOpacity="0.28" /><stop offset="100%" stopColor={C.primary} stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={PL} x2={W - PR} y1={PT + g * (H - PT - PB)} y2={PT + g * (H - PT - PB)} stroke={C.line} strokeWidth="1" />)}
      {path.area && <path d={path.area} fill="url(#hpFill)" />}
      {path.eng && <path d={path.eng} fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />}
      {path.line && <path d={path.line} fill="none" stroke={C.primary} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}
