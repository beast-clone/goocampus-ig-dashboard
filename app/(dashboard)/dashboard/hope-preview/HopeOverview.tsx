"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtDateShort } from "@/lib/date";
import {
  IconLayoutGrid, IconChartLine, IconCalendarEvent,
  IconArrowUpRight, IconArrowDownRight, IconBrandInstagram, IconHeart,
  IconMessageCircle, IconEye, IconBrandFacebook, IconBrandLinkedin,
  IconBrandYoutube, IconClock, IconChartBar, IconTrophy,
  IconChevronDown, IconCheck,
} from "@tabler/icons-react";
import { HopeSidebar } from "./HopeSidebar";
import { HopeDatePicker } from "./HopeDatePicker";
import HubNotificationBell from "@/components/HubNotificationBell";
import { HeaderProfile } from "@/components/HeaderProfile";
import { OverviewExtras } from "@/components/OverviewExtras";
import { PostingCadenceBar } from "@/components/PostingCadenceBar";
import { AudienceOnlineHeatmap } from "@/components/AudienceOnlineHeatmap";
import { FacebookOverview, LinkedInOverview, YouTubeOverview } from "@/components/PlatformOverviews";
import { LI_PAGE, YT_CHANNEL } from "@/lib/brand-platforms";
import { ACCOUNTS, DEFAULT_ACCOUNT_ID } from "@/lib/accounts";
import Link from "next/link";

// A future date returns nothing from any analytics source, so the custom range
// can't go past today. `max` greys out the picker; the clamp catches typed input.
function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}
function clampToTodayISO(d: string): string {
  const t = todayLocalISO();
  return d && d > t ? t : d;
}

// Brands you can switch between on the analytics tabs. Samvaya is a separate
// business and excluded from the GooCampus marketing view.
const SWITCHABLE_ACCOUNTS = ACCOUNTS.filter((a) => a.id !== "samvaya_matrimony");

// Exact Hope UI tokens (pulled from the live theme — primary #3A57E8, Inter).
const C = {
  primary: "#3A57E8", primaryDark: "#2138B0", navy: "#001F4D",
  heading: "#232D42", muted: "#8A92A6", bg: "#F5F6FA", card: "#FFFFFF",
  teal: "#079AA2", success: "#1AA053", danger: "#C03221", line: "#EEF0F4",
  chip: "#F0F2F8", pink: "#E83A8A",
};
const SHADOW = "none"; // Hope UI cards are FLAT — no drop shadow (matches the real theme)

type Insights = {
  totals: { followers: number; reach: number; engagement: number; profileVisits: number; newFollowers: number };
  deltas: { followers: number; reach: number; engagement: number; profileVisits: number };
  series: { date: string; reach: number; engagement: number }[];
};
type Post = { id: string; caption: string; mediaUrl: string; mediaUrls?: string[]; permalink: string; type: string; timestamp: string; likes: number; comments: number; reach: number; totalInteractions: number };
type Audience = { gender?: { label: string; value: number }[]; countries?: { label: string; value: number }[] };
type Tip = { metric: "followers" | "reach" | "engagement" | "profileVisits"; detail: string; action: string };

// Null-safe: a missing metric must not crash the whole Overview (the landing page).
const fmt = (n?: number | null) => (n ?? 0).toLocaleString("en-IN");
const kfmt = (n?: number | null) => { const v = n ?? 0; return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "K" : String(v); };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

// Plain-English fallbacks (same copy the real Overview uses) until AI tips load.
const PLAIN: Record<string, { detail: string; action: string }> = {
  followers:     { detail: "Total accounts following you.",               action: "Keep the current cadence — growth is holding." },
  reach:         { detail: "Unique people who saw your content.",         action: "Post more Reels to lift this fastest." },
  engagement:    { detail: "Likes, comments, saves and shares combined.", action: "Ask a direct question in your next caption." },
  profileVisits: { detail: "People who tapped your handle to see the bio.", action: "A/B test the bio link CTA." },
  engRate:       { detail: "Of every 100 people who saw your posts, this many reacted.", action: "Above 5% is strong for education — keep the hook style." },
};

function typeChip(t: string) {
  const s = (t || "").toLowerCase();
  if (s.includes("reel")) return { bg: "#FCE7F0", fg: C.pink, label: "Reel" };
  if (s.includes("carousel")) return { bg: "#E9ECFB", fg: C.primary, label: "Carousel" };
  return { bg: "#E1F4F5", fg: C.teal, label: "Post" };
}

// ISO country codes → readable names (so IN/PK/GB read as India/Pakistan/UK).
const COUNTRY_NAMES: Record<string, string> = {
  IN: "India", PK: "Pakistan", GB: "United Kingdom", US: "United States", AE: "UAE",
  NG: "Nigeria", CA: "Canada", AU: "Australia", BD: "Bangladesh", NP: "Nepal",
  LK: "Sri Lanka", SA: "Saudi Arabia", QA: "Qatar", OM: "Oman", KW: "Kuwait",
  BH: "Bahrain", MY: "Malaysia", SG: "Singapore", DE: "Germany", IE: "Ireland",
  NZ: "New Zealand", ZA: "South Africa", PH: "Philippines", EG: "Egypt",
};
const countryName = (code: string) => COUNTRY_NAMES[(code || "").toUpperCase()] || code;
const GENDER_NAMES: Record<string, string> = { M: "Male", F: "Female", U: "Undisclosed" };
const genderName = (code: string) => GENDER_NAMES[(code || "").toUpperCase()] || code;
// Subtle blue-family gradients for the "Who you reached" bars (light → soft).
const AUD_BARS = [
  "linear-gradient(90deg, #3A57E8, #6C86F2)",
  "linear-gradient(90deg, #5E78ED, #8FA5F7)",
  "linear-gradient(90deg, #8AA0F7, #B4C2FB)",
  "linear-gradient(90deg, #AEBDF9, #D6DEFD)",
];
// Hope-family gender palette (brand blue · violet · light grey — no off-brand pink).
const GENDER_COLORS = ["#3A57E8", "#6E48F8", "#D3DAE6"];
// Post-mix / format palette — all Hope tokens (brand · violet · teal · sky), cohesive
// & distinguishable, and matched to OverviewExtras so a format reads the same colour.
const FMT_META: Record<string, { label: string; color: string }> = {
  CAROUSEL_ALBUM: { label: "Carousels", color: "#3A57E8" },
  REEL:           { label: "Reels",     color: "#6E48F8" },
  IMAGE:          { label: "Static",    color: "#079AA2" },
  VIDEO:          { label: "Videos",    color: "#0EA5E9" },
};
const fmtMeta = (t: string) => FMT_META[t] || { label: t || "Other", color: "#8A92A6" };

// Month-by-month helpers. Long ranges (60d / 1y / long custom) become a set of
// calendar-month reports; the current month is shown as "so far" (month-to-date),
// anchored to today. Each month is ≤31 days, so its numbers come back real.
type MonthOpt = { key: string; label: string; full: string; from: string; to: string; isCurrent: boolean };
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Human-friendly date: "2026-07-01" → "1 July 2026" (no ISO dashes for readers).
const fmtNice = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
function buildMonths(sy: number, sm: number, ey: number, em: number, now: Date): MonthOpt[] {
  const ny = now.getFullYear(), nm = now.getMonth(), nd = now.getDate();
  const out: MonthOpt[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const future = y > ny || (y === ny && m > nm);
    if (!future) {
      const isCurrent = y === ny && m === nm;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const from = `${y}-${pad2(m + 1)}-01`;
      const to = isCurrent ? `${ny}-${pad2(nm + 1)}-${pad2(nd)}` : `${y}-${pad2(m + 1)}-${pad2(lastDay)}`;
      const short = new Date(y, m, 1).toLocaleString("en-US", { month: "short" });
      const long = new Date(y, m, 1).toLocaleString("en-US", { month: "long" });
      out.push({ key: `${y}-${pad2(m + 1)}`, label: `${short} '${String(y).slice(2)}`, full: `${long} ${y}`, from, to, isCurrent });
    }
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

const PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: IconBrandInstagram },
  { key: "facebook", label: "Facebook", icon: IconBrandFacebook },
  { key: "linkedin", label: "LinkedIn", icon: IconBrandLinkedin },
  { key: "youtube", label: "YouTube", icon: IconBrandYoutube },
] as const;
type PlatformKey = (typeof PLATFORMS)[number]["key"];
type RangeKey = "7d" | "30d" | "60d" | "1y" | "custom";

export function HopeOverview() {
  const [accountId, setAccountId] = useState<string>(DEFAULT_ACCOUNT_ID);
  const [brandOpen, setBrandOpen] = useState(false);
  const currentAccount = SWITCHABLE_ACCOUNTS.find((a) => a.id === accountId) ?? SWITCHABLE_ACCOUNTS[0];
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [selMonthKey, setSelMonthKey] = useState<string | null>(null);
  const [platform, setPlatform] = useState<PlatformKey>("instagram");
  const now = useMemo(() => new Date(), []);
  const todayStr = ymdLocal(now);
  // Instagram's account insights (follower_count) refuse the current day, so the
  // insights window must end at yesterday. Posts can still include today.
  const yesterdayStr = ymdLocal(new Date(now.getTime() - 86_400_000));

  // Month-by-month mode is ONLY for Instagram: Meta caps its account insights at
  // ~30 days, so a long range must be walked one calendar month at a time (each
  // ≤31 days → real & native). Facebook / LinkedIn / YouTube keep full history,
  // so their long ranges query the whole span at once — no switcher, no toggle.
  const customSpanDays = custom.from && custom.to ? Math.round((new Date(custom.to).getTime() - new Date(custom.from).getTime()) / 86_400_000) : 0;
  const spanIsLong = rangeKey === "60d" || rangeKey === "1y" || (rangeKey === "custom" && customSpanDays > 31);
  const isMonthly = platform === "instagram" && spanIsLong;
  const months = useMemo(() => {
    if (!isMonthly) return [] as MonthOpt[];
    const ny = now.getFullYear(), nm = now.getMonth();
    if (rangeKey === "60d") { const s = new Date(ny, nm - 2, 1); return buildMonths(s.getFullYear(), s.getMonth(), ny, nm, now); }
    if (rangeKey === "1y") { const s = new Date(ny, nm - 11, 1); return buildMonths(s.getFullYear(), s.getMonth(), ny, nm, now); }
    const [fy, fm] = custom.from.split("-").map(Number);
    const [ty, tm] = custom.to.split("-").map(Number);
    return buildMonths(fy, fm - 1, ty, tm - 1, now);
  }, [isMonthly, rangeKey, custom.from, custom.to, now]);
  const selectedMonth = months.length ? (months.find((m) => m.key === selMonthKey) || [...months].reverse().find((m) => !m.isCurrent) || months[months.length - 1]) : null;
  const selFrom = selectedMonth?.from, selTo = selectedMonth?.to;

  const range = useMemo(() => {
    if (isMonthly && selFrom && selTo) return { from: selFrom, to: selTo };
    if (rangeKey === "custom" && custom.from && custom.to) return { from: custom.from, to: custom.to };
    // Rolling window. For FB/LI/YT (non-monthly) 60d and 1y resolve to the whole
    // span at once; Instagram never reaches here for those (it's monthly).
    const days = rangeKey === "7d" ? 7 : rangeKey === "60d" ? 60 : rangeKey === "1y" ? 365 : 30;
    return { from: ymdLocal(new Date(now.getTime() - days * 86_400_000)), to: todayStr };
  }, [isMonthly, selFrom, selTo, rangeKey, custom, now, todayStr]);
  const rangeLabel = isMonthly && selectedMonth
    ? `${selectedMonth.full}${selectedMonth.isCurrent ? " (so far)" : ""}`
    : rangeKey === "custom" ? (custom.from && custom.to ? `${custom.from} → ${custom.to}` : "custom range")
    : rangeKey === "1y" ? "last 12 months"
    : rangeKey === "60d" ? "last 60 days"
    : `last ${rangeKey.replace("d", "")} days`;

  const [chartMetric, setChartMetric] = useState<"reach" | "engagement">("reach");
  const [ins, setIns] = useState<Insights | null>(null);
  const [insStored, setInsStored] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [aud, setAud] = useState<Audience | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = range;
    const insTo = to > yesterdayStr ? yesterdayStr : to; // account insights can't include today
    // If the window starts before Meta's ~30-day live cutoff, Meta refuses it —
    // read the KPIs from our stored Supabase snapshots instead of showing stale data.
    const liveCutoff = ymdLocal(new Date(now.getTime() - 30 * 86_400_000));
    const useStored = from < liveCutoff;
    let alive = true;
    setLoading(true);
    // Fire each fetch INDEPENDENTLY — the fast KPIs/reach/banner update the moment
    // insights returns, instead of waiting behind the slow posts fetch.
    const insUrl = useStored
      ? `/api/insights-stored?accountId=${accountId}&from=${from}&to=${to}`
      : `/api/insights?accountId=${accountId}&from=${from}&to=${insTo}`;
    fetch(insUrl).then((r) => r.ok ? r.json() : null).then((i) => { if (alive && i) { setIns(i as Insights); setInsStored(!!i.stored); } }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    fetch(`/api/posts?accountId=${accountId}&from=${from}&to=${to}&limit=10&insights=true`).then((r) => r.ok ? r.json() : { posts: [] }).then((p) => { if (alive) setPosts((p?.posts || []) as Post[]); }).catch(() => {});
    fetch(`/api/audience?accountId=${accountId}`).then((r) => r.ok ? r.json() : null).then((a) => { if (alive && a) setAud(a as Audience); }).catch(() => {});
    fetch(`/api/overview-tips?accountId=${accountId}&from=${from}&to=${insTo}`).then((r) => r.ok ? r.json() : null).then((tp) => { if (alive) setTips((tp?.tips || []) as Tip[]); }).catch(() => {});
    return () => { alive = false; };
  }, [range, accountId]);

  const t = ins?.totals, d = ins?.deltas;
  const tipBy = useMemo(() => {
    const m: Record<string, Tip> = {};
    tips.forEach((x) => { m[x.metric] = x; });
    return m;
  }, [tips]);


  // "Old winners worth refreshing" — the 6 months BEFORE the current range, one
  // best post per calendar month. Fetched WITHOUT insights (insights=false) so a
  // 6-month window stays fast — we rank by engagement (likes + comments), which the
  // media list carries directly, instead of the slow per-post reach insight.
  const [oldWinners, setOldWinners] = useState<Post[] | null>(null);
  useEffect(() => {
    let alive = true;
    const fromDate = new Date(range.from);
    const oldTo = new Date(fromDate.getTime() - 1 * 86_400_000).toISOString().slice(0, 10);
    const oldFrom = new Date(fromDate.getTime() - 183 * 86_400_000).toISOString().slice(0, 10);
    const qs = new URLSearchParams({ accountId, from: oldFrom, to: oldTo, limit: "500", insights: "false" }).toString();
    setOldWinners(null);
    fetch(`/api/posts?${qs}`).then((r) => r.ok ? r.json() : { posts: [] }).then((d) => { if (alive) setOldWinners((d.posts || []) as Post[]); }).catch(() => { if (alive) setOldWinners([]); });
    return () => { alive = false; };
  }, [range, accountId]);
  // One card per month: the highest-engagement post in each calendar month, newest month first.
  const reposts = useMemo(() => {
    if (!oldWinners) return [];
    const eng = (p: Post) => (p.likes || 0) + (p.comments || 0);
    const byMonth = new Map<string, Post>();
    for (const p of oldWinners) {
      const d = new Date(p.timestamp);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = byMonth.get(mk);
      if (!cur || eng(p) > eng(cur)) byMonth.set(mk, p);
    }
    return [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, p]) => p).slice(0, 6);
  }, [oldWinners]);

  // Full-range posts (limit 200) → custom Hope Post-mix + Which-format-wins
  // (same source/logic as the real Overview's OverviewExtras).
  const [rangePosts, setRangePosts] = useState<Post[] | null>(null);
  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ accountId, from: range.from, to: range.to, limit: "200", insights: "true" }).toString();
    setRangePosts(null);
    fetch(`/api/posts?${qs}`).then((r) => r.ok ? r.json() : { posts: [] }).then((d) => { if (alive) setRangePosts((d.posts || []) as Post[]); }).catch(() => { if (alive) setRangePosts([]); });
    return () => { alive = false; };
  }, [range, accountId]);
  const postMix = useMemo(() => {
    const src = rangePosts || [];
    if (!src.length) return { total: 0, entries: [] as { type: string; count: number; pct: number }[] };
    const counts: Record<string, number> = {};
    for (const p of src) counts[p.type] = (counts[p.type] || 0) + 1;
    const total = src.length;
    return { total, entries: Object.entries(counts).map(([type, count]) => ({ type, count, pct: (count / total) * 100 })).sort((a, b) => b.count - a.count) };
  }, [rangePosts]);
  const formatRows = useMemo(() => {
    const src = rangePosts || [];
    if (!src.length) return [] as { type: string; count: number; avgReach: number; avgEng: number; erPct: number }[];
    const agg: Record<string, { count: number; reach: number; eng: number }> = {};
    for (const p of src) {
      const eng = p.totalInteractions || ((p.likes || 0) + (p.comments || 0));
      agg[p.type] ??= { count: 0, reach: 0, eng: 0 };
      agg[p.type].count += 1; agg[p.type].reach += p.reach || 0; agg[p.type].eng += eng;
    }
    return Object.entries(agg).map(([type, v]) => {
      const avgReach = Math.round(v.reach / v.count);
      const avgEng = Math.round(v.eng / v.count);
      return { type, count: v.count, avgReach, avgEng, erPct: avgReach > 0 ? (avgEng / avgReach) * 100 : 0 };
    }).sort((a, b) => b.avgReach - a.avgReach);
  }, [rangePosts]);

  // Top performing + latest rank across ALL posts in the range (limit-200 set),
  // not just the newest 10, so "top by reach" is the true top for the period.
  const postSrc = (rangePosts && rangePosts.length) ? rangePosts : posts;
  const topPosts = [...postSrc].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 5);
  const latest = [...postSrc].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

  // KPI tiles. Live months = native account data. Historical months (insStored)
  // come from stored snapshots: reach + follower growth are real; engagement is
  // summed from that month's posts; profile visits weren't recorded before today.
  const postEngagement = useMemo(() => (rangePosts || []).reduce((s, p) => s + (p.totalInteractions || ((p.likes || 0) + (p.comments || 0))), 0), [rangePosts]);
  const engVal = insStored ? postEngagement : (t?.engagement ?? 0);
  const engRate = t && t.reach > 0 ? Math.round((engVal / t.reach) * 1000) / 10 : 0;
  const stats: { key: string; label: string; value: string; delta: number | null; flat?: boolean; badge?: string; est?: boolean }[] = t ? [
    { key: "followers", label: "Followers", value: fmt(t.followers), delta: insStored ? null : (d?.followers ?? 0), badge: insStored ? "saved" : undefined },
    { key: "reach", label: "Reach", value: fmt(t.reach), delta: insStored ? null : (d?.reach ?? 0), badge: insStored ? "saved" : undefined },
    // Live-window engagement & profile visits are estimated from reach (Instagram's
    // account-insights API doesn't expose them directly), so flag them "est".
    { key: "engagement", label: "Engagement", value: fmt(engVal), delta: insStored ? null : (d?.engagement ?? 0), badge: insStored ? "from posts" : undefined, est: !insStored },
    { key: "profileVisits", label: "Profile Visits", value: insStored ? "—" : fmt(t.profileVisits), delta: insStored ? null : (d?.profileVisits ?? 0), badge: insStored ? "not recorded" : undefined, est: !insStored },
    { key: "engRate", label: "Eng. Rate", value: `${engRate}%`, delta: null, flat: true, est: !insStored },
  ] : [];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.heading }}>
      {/* ───────── Sidebar ───────── */}
      <HopeSidebar active="overview" />

      {/* ───────── Main ───────── */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", background: C.card, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 5 }}>
          {/* Brand / account switcher — which page's data the whole Overview shows */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setBrandOpen((o) => !o)}
              style={{ display: "inline-flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${brandOpen ? C.primary : C.line}`, borderRadius: 10, padding: "7px 12px", cursor: "pointer", boxShadow: brandOpen ? `0 0 0 3px ${C.primary}22` : "none", transition: "all .15s" }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, background: "#E9ECFB" }}>
                <IconBrandInstagram size={16} stroke={1.9} style={{ color: C.primary }} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Brand</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.heading }}>{currentAccount.label}</span>
              </span>
              <IconChevronDown size={16} stroke={2} style={{ color: C.muted, transform: brandOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {brandOpen && (
              <>
                <div onClick={() => setBrandOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, minWidth: 260, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 16px 40px rgba(15,18,40,0.16)", padding: 6, zIndex: 41 }}>
                  {SWITCHABLE_ACCOUNTS.map((a) => {
                    const on = a.id === accountId;
                    return (
                      <button
                        key={a.id}
                        onClick={() => { setAccountId(a.id); setBrandOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: on ? C.bg : "transparent", transition: "background .12s" }}
                        onMouseEnter={(e) => { if (!on) (e.currentTarget.style.background = C.bg); }}
                        onMouseLeave={(e) => { if (!on) (e.currentTarget.style.background = "transparent"); }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, background: "#E9ECFB", flexShrink: 0 }}>
                          <IconBrandInstagram size={17} stroke={1.9} style={{ color: C.primary }} />
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.heading }}>{a.label}</span>
                          <span style={{ fontSize: 12, color: C.muted }}>{a.handle}</span>
                        </span>
                        {on && <IconCheck size={17} stroke={2.4} style={{ color: C.primary, flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18, color: C.muted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E9FBEF", color: C.success, fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: C.success }} /> Live
            </span>
            <HubNotificationBell />
            <HeaderProfile />
          </div>
        </header>

        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22, maxWidth: 1320, margin: "0 auto" }}>
          {/* Platform toggle + date-range filter — the filter drives every tab */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ background: C.card, borderRadius: 12, boxShadow: SHADOW, padding: 6, display: "inline-flex", gap: 4 }}>
              {PLATFORMS.map((p) => {
                const on = platform === p.key;
                return (
                  <button key={p.key} onClick={() => setPlatform(p.key)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600, background: on ? C.primary : "transparent", color: on ? "#fff" : C.muted, boxShadow: on ? "0 8px 18px rgba(58,87,232,0.28)" : "none", transition: "all .15s" }}>
                    <p.icon size={16} stroke={1.9} /> {p.label}
                  </button>
                );
              })}
            </div>
            <RangeFilter rangeKey={rangeKey} setRangeKey={setRangeKey} custom={custom} setCustom={setCustom} />
          </div>

          {/* Month switcher — on long ranges the whole Overview is a per-month report */}
          {isMonthly && months.length > 0 && (
            <div style={{ background: C.card, borderRadius: 12, boxShadow: SHADOW, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}><IconCalendarEvent size={15} /> Month</span>
                {months.map((m) => {
                  const on = selectedMonth?.key === m.key;
                  return (
                    <button key={m.key} onClick={() => setSelMonthKey(m.key)}
                      style={{ padding: "7px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: on ? C.primary : C.bg, color: on ? "#fff" : C.muted, boxShadow: on ? "0 6px 14px rgba(58,87,232,0.28)" : "none", transition: "all .15s" }}>
                      {m.label}{m.isCurrent ? " · so far" : ""}
                    </button>
                  );
                })}
              </div>
              {selectedMonth && (
                <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.muted }}>
                  Showing <b style={{ color: C.heading, fontWeight: 600 }}>{selectedMonth.full}{selectedMonth.isCurrent ? " (so far)" : ""}</b> · {fmtNice(selectedMonth.from)} → {fmtNice(selectedMonth.to)}
                </div>
              )}
            </div>
          )}

          {/* Friendly range caption for every non-switcher case (IG 7d/30d + all of FB/LI/YT) */}
          {!isMonthly && (
            <div style={{ background: C.card, borderRadius: 12, boxShadow: SHADOW, padding: "10px 14px", fontSize: 12.5, color: C.muted }}>
              Showing <b style={{ color: C.heading, fontWeight: 600 }}>{rangeKey === "custom" ? "your custom range" : rangeLabel}</b> · {fmtNice(range.from)} → {fmtNice(range.to)}
            </div>
          )}

          {platform !== "instagram" ? (
            <>
              <PlatformHero platform={platform} accountId={accountId} range={range} rangeLabel={rangeLabel} />
              <div className="hope-scope">
                <Card>
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>{PLATFORMS.find((p) => p.key === platform)?.label} overview</div>
                  {platform === "facebook" && <FacebookOverview accountId={accountId} range={range} />}
                  {platform === "linkedin" && <LinkedInOverview accountId={accountId} range={range} />}
                  {platform === "youtube" && <YouTubeOverview accountId={accountId} range={range} enhanced />}
                </Card>
              </div>
            </>
          ) : (
            <>
              {/* Hero — narrative fold */}
              <HeroBanner eyebrow={`${currentAccount.handle} · ${rangeLabel}`}>
                {t ? (insStored
                  ? <>You gained <b>{fmt(t.newFollowers)}</b> new followers this period, reaching <b>{fmt(t.reach)}</b> — from your saved history.</>
                  : <>You gained <b>{fmt(t.newFollowers)}</b> new followers this period{d ? <> — reach is <b>{d.reach >= 0 ? "up" : "down"} {Math.abs(d.reach).toFixed(1)}%</b> and engagement <b>{d.engagement >= 0 ? "up" : "down"} {Math.abs(d.engagement).toFixed(1)}%</b>. Solid month.</> : "."}</>
                ) : "Loading your latest performance…"}
              </HeroBanner>
              {insStored && (
                <div style={{ fontSize: 12.5, background: "#EEF1FB", border: "1px solid #DCE3FB", color: "#2138B0", borderRadius: 10, padding: "9px 13px", marginTop: -8 }}>
                  This month is older than Instagram&rsquo;s 30-day window, so its KPIs are read from your <b>saved snapshots</b>. Reach &amp; follower growth are real; engagement is summed from this month&rsquo;s posts; profile visits weren&rsquo;t recorded before today.
                </div>
              )}

              {/* Stat cards — now with description + AI action, matching the real Overview */}
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 18 }}>
                {loading && !ins ? [0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 168, background: C.card, borderRadius: 14, boxShadow: SHADOW }} />)
                  : stats.map(({ key, ...rest }) => (
                    <StatCard key={key} {...rest}
                      detail={tipBy[key]?.detail || PLAIN[key]?.detail || ""}
                      action={tipBy[key]?.action || PLAIN[key]?.action || ""} />
                  ))}
              </section>

              {/* Reach chart + Audience */}
              <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 18 }}>
                <Card>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.4px" }}>{t ? fmt(chartMetric === "reach" ? t.reach : t.engagement) : "—"}</div>
                      <div style={{ fontSize: 13, color: C.muted }}>{chartMetric === "reach" ? "Reach" : "Engagement"} this period</div>
                    </div>
                    {/* Reach / Engagement toggle — switches the number + graph below */}
                    <div style={{ background: C.bg, borderRadius: 10, padding: 4, display: "inline-flex", gap: 3 }}>
                      {(["reach", "engagement"] as const).map((m) => {
                        const on = chartMetric === m;
                        const col = m === "reach" ? C.primary : C.teal;
                        return (
                          <button key={m} onClick={() => setChartMetric(m)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: on ? "#fff" : "transparent", color: on ? C.heading : C.muted, boxShadow: on ? "0 1px 3px rgba(35,45,66,0.14)" : "none", transition: "all .15s" }}>
                            <span style={{ width: 8, height: 8, borderRadius: 99, background: col }} /> {m === "reach" ? "Reach" : "Engagement"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {ins && <AreaChart series={ins.series} metric={chartMetric} />}
                </Card>

                <Card>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Who you reached</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>Audience split</div>
                  <GenderDonut gender={aud?.gender || []} />
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
                    {(aud?.countries || []).slice(0, 4).map((c, i) => {
                      const max = Math.max(1, ...(aud?.countries || []).slice(0, 4).map((x) => x.value));
                      return (
                        <div key={c.label} style={{ display: "grid", gridTemplateColumns: "116px 1fr 40px", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                          <span style={{ color: C.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={countryName(c.label)}>{countryName(c.label)}</span>
                          <span style={{ height: 8, background: "#EEF1FB", borderRadius: 99, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(c.value / max) * 100}%`, background: AUD_BARS[i % AUD_BARS.length], borderRadius: 99 }} /></span>
                          <span style={{ color: C.muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{kfmt(c.value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </section>

              {/* Top performing posts — card grid, moved ABOVE Latest posts */}
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <IconTrophy size={18} color={C.primary} />
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Top performing posts</div>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, color: C.muted }}>ranked by reach</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
                  {(loading && !posts.length ? Array.from({ length: 5 }) : topPosts).map((p, i) => {
                    const post = p as Post | undefined;
                    if (!post) return <div key={i} style={{ height: 250, background: C.bg, borderRadius: 12 }} />;
                    const chip = typeChip(post.type);
                    const er = post.reach > 0 ? ((post.totalInteractions || (post.likes + post.comments)) / post.reach * 100).toFixed(1) : "0";
                    return (
                      <div key={post.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.card }}>
                        <div style={{ position: "relative", aspectRatio: "1/1", background: C.bg }}>
                          {post.mediaUrl ? <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                          <span style={{ position: "absolute", top: 8, left: 8, width: 24, height: 24, borderRadius: 99, background: C.primary, color: "#fff", fontSize: 11.5, fontWeight: 600, display: "grid", placeItems: "center", boxShadow: "0 4px 10px rgba(58,87,232,0.4)" }}>{i + 1}</span>
                          <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 99, background: chip.bg, color: chip.fg }}>{chip.label}</span>
                        </div>
                        <div style={{ padding: "10px 11px" }}>
                          <div style={{ fontSize: 12, color: C.heading, lineHeight: 1.35, height: 32, overflow: "hidden" }}>{(post.caption || "").split("\n")[0].slice(0, 60) || "(no caption)"}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, color: C.muted, fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconEye size={13} /> {kfmt(post.reach || 0)}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconHeart size={13} /> {kfmt(post.likes || 0)}</span>
                            <span style={{ marginLeft: "auto", color: C.success, fontWeight: 600 }}>{er}% ER</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Old winners worth reposting — moved here, directly below Top performing */}
              <OldWinners posts={reposts} loading={oldWinners === null} />

              {/* Latest posts — now below Top performing */}
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Latest posts</div>
                  <Link href="/dashboard/hope-preview/posts" style={{ fontSize: 12.5, color: C.primary, fontWeight: 600, textDecoration: "none" }}>View all →</Link>
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
                          <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 99, background: chip.bg, color: chip.fg }}>{chip.label}</span>
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

              {/* ══ Sections carried over from the real Overview so NOTHING is removed ══ */}

              {/* Performance — post mix / engagement rate / hashtags / format / reposts */}
              <SectionHeader icon={IconChartBar} title="Performance" sub="Post mix, formats & hashtags" />
              {/* Left column stacks Post mix + Hashtags (fills the space under Post mix);
                  Which format wins owns the taller right column. 40/60 split, top-aligned. */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 16, alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                  <HopePostMix mix={postMix} cardStyle={{ minWidth: 0 }} />
                  {/* Hashtags reused from the shared component (post mix, format card &
                      reposts hidden here — drawn Hope-style / on the right instead). */}
                  <div className="hope-scope">
                    <OverviewExtras accountId={accountId} range={range} hideReposts hidePostMix hideFormat />
                  </div>
                </div>
                {/* Right column: Which format wins, with the "Your read" takeaway tucked
                    inside the card at the bottom (levels the two columns). */}
                <HopeFormatWins rows={formatRows} cardStyle={{ minWidth: 0 }} footer={<HopeYourRead mix={postMix} />} />
              </div>
              <HopeHowToRead />

              {/* Posting cadence */}
              <SectionHeader icon={IconCalendarEvent} title="Posting cadence" sub="How often you post, by week" />
              <div className="hope-scope" style={{ background: C.card, borderRadius: 16, boxShadow: SHADOW, padding: "8px 12px" }}>
                <PostingCadenceBar accountId={accountId} range={range} smartCadence />
              </div>

              {/* Best times to post */}
              <SectionHeader icon={IconClock} title="Best times to post next" sub="When your audience is most active" />
              <div className="hope-scope" style={{ background: C.card, borderRadius: 16, boxShadow: SHADOW, padding: "8px 12px" }}>
                <AudienceOnlineHeatmap accountId={accountId} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- pieces ---------- */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.card, borderRadius: 16, boxShadow: SHADOW, padding: "22px 24px", ...style }}>{children}</div>;
}

// The blue gradient greeting banner — shared by every platform tab.
function HeroBanner({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <section style={{ position: "relative", overflow: "hidden", borderRadius: 16, padding: "30px 34px", background: `linear-gradient(120deg, ${C.primary} 0%, ${C.primaryDark} 55%, ${C.navy} 100%)`, color: "#fff", boxShadow: "0 18px 40px rgba(58,87,232,0.28)" }}>
      <div style={{ position: "absolute", right: -40, top: -60, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
      <div style={{ position: "absolute", right: 90, bottom: -90, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>{eyebrow}</div>
        <h1 style={{ fontSize: 32, fontWeight: 500, margin: "8px 0 6px", letterSpacing: "-0.3px" }}>{greeting()}, GooCampus 👋</h1>
        <p style={{ fontSize: 15, opacity: 0.92, maxWidth: 560, lineHeight: 1.55, margin: 0 }}>{children}</p>
      </div>
    </section>
  );
}

// Same banner for Facebook / LinkedIn / YouTube, with that platform's real
// headline metrics (fetched the same way the panel below it fetches).
function PlatformHero({ platform, accountId, range, rangeLabel }: { platform: PlatformKey; accountId: string; range: { from: string; to: string }; rangeLabel: string }) {
  const label = platform === "facebook" ? "Facebook" : platform === "linkedin" ? "LinkedIn" : "YouTube";
  const connected = platform === "facebook" ? true : platform === "linkedin" ? !!LI_PAGE[accountId] : !!YT_CHANNEL[accountId];
  const url = useMemo(() => {
    if (!connected) return null;
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (platform === "facebook") { p.set("account", accountId); return `/api/facebook?${p.toString()}`; }
    if (platform === "linkedin") { p.set("page", LI_PAGE[accountId] || ""); return `/api/linkedin?${p.toString()}`; }
    p.set("channel", YT_CHANNEL[accountId] || ""); return `/api/youtube?${p.toString()}`;
  }, [platform, accountId, range, connected]);

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    setData(null);
    if (!url) return;
    let ok = true;
    fetch(url).then((r) => r.json()).then((d) => { if (ok) setData(d); }).catch(() => {});
    return () => { ok = false; };
  }, [url]);

  let sub: React.ReactNode;
  if (!connected) {
    sub = <>{label} is not connected for @{accountId} yet — it is live for GooCampus World.</>;
  } else if (!data) {
    sub = <>Loading your {label} performance…</>;
  } else if (platform === "facebook") {
    const i = (data.insights || {}) as { engagement?: number; pageViews?: number; follows?: number };
    sub = <>Your Facebook page drove <b>{fmt(i.engagement || 0)}</b> engagements and <b>{fmt(i.pageViews || 0)}</b> page views this period{i.follows ? <>, plus <b>{fmt(i.follows)}</b> new follows</> : null}. Solid month.</>;
  } else if (platform === "youtube") {
    const s = (data.summary || {}) as { subscriberGain?: number; views?: number; watchHours?: number };
    sub = <>You gained <b>{fmt(s.subscriberGain || 0)}</b> subscribers this period — <b>{fmt(s.views || 0)}</b> views and <b>{fmt(s.watchHours || 0)}</b> watch hours. Solid month.</>;
  } else {
    const s = (data.summary || {}) as { followers?: number; followerGain?: number; engagementRate?: number; posts?: number };
    sub = <>You have <b>{fmt(s.followers || 0)}</b> followers (<b>+{s.followerGain || 0}</b> this period) with a <b>{s.engagementRate || 0}%</b> engagement rate across <b>{s.posts || 0}</b> posts.</>;
  }

  return <HeroBanner eyebrow={`GooCampus on ${label} · ${rangeLabel}`}>{sub}</HeroBanner>;
}

// "Old winners worth reposting" — Hope-styled card grid (same data as the real
// Overview's repost block), placed directly under Top performing posts.
function OldWinners({ posts, loading }: { posts: Post[]; loading: boolean }) {
  return (
    <Card>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.heading }}>Old winners worth refreshing</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>The best post from each of the last 6 months (by engagement). Click <b>Schedule</b> to queue it again with its original caption &amp; creative — fact-check first, medical rules change.</div>
      </div>
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 300, background: C.bg, borderRadius: 12 }} />)}
        </div>
      ) : posts.length === 0 ? (
        <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic" }}>No older posts to draw from yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {posts.map((p) => {
            const chip = typeChip(p.type);
            const title = (p.caption || "").split("\n")[0].slice(0, 80) || "(no caption)";
            // Carry the SAME post into the composer: original caption + its media
            // (all carousel slides), so scheduling it again never asks for a re-upload.
            const slides = (p.mediaUrls && p.mediaUrls.length ? p.mediaUrls : (p.mediaUrl ? [p.mediaUrl] : [])).filter(Boolean);
            const dp = new URLSearchParams({ title, brief: (p.caption || "").slice(0, 2000) });
            slides.forEach((u) => dp.append("media", u));
            const draft = dp.toString();
            return (
              <div key={p.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.card, display: "flex", flexDirection: "column" }}>
                <div style={{ position: "relative", aspectRatio: "4/5", background: C.bg }}>
                  {p.mediaUrl ? <img src={p.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                  <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 99, background: chip.bg, color: chip.fg }}>{chip.label}</span>
                </div>
                <div style={{ padding: "11px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: C.primary, marginBottom: 3 }}>{new Date(p.timestamp).toLocaleDateString("en-IN", { month: "long", year: "numeric" })} · top</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{fmtDateShort(p.timestamp)}</div>
                  <div style={{ fontSize: 12.5, color: C.heading, lineHeight: 1.35, height: 50, overflow: "hidden", marginBottom: 8 }}>{title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: C.muted, fontVariantNumeric: "tabular-nums", marginBottom: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconHeart size={13} /> {kfmt(p.likes || 0)}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconMessageCircle size={13} /> {kfmt(p.comments || 0)}</span>
                  </div>
                  <Link href={`/dashboard/hope-preview/scheduler?draft=${encodeURIComponent(draft)}`}
                    style={{ marginTop: "auto", display: "block", textAlign: "center", fontSize: 12, fontWeight: 600, background: C.primary, color: "#fff", padding: "9px 12px", borderRadius: 9, textDecoration: "none" }}>
                    Schedule
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// Post mix — Hope-styled donut with the new palette + a plain-English read.
function HopePostMix({ mix, cardStyle }: { mix: { total: number; entries: { type: string; count: number; pct: number }[] }; cardStyle?: React.CSSProperties }) {
  const stops: string[] = []; let from = 0;
  for (const e of mix.entries) { const c = fmtMeta(e.type).color; const to = from + (e.pct / 100) * 360; stops.push(`${c} ${from.toFixed(1)}deg ${to.toFixed(1)}deg`); from = to; }
  const gradient = stops.length ? `conic-gradient(${stops.join(", ")})` : `conic-gradient(${C.line} 0deg 360deg)`;
  return (
    <Card style={cardStyle}>
      <div style={{ fontSize: 16, fontWeight: 600, color: C.heading }}>Post mix</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 18 }}>What formats you posted, and what the split means.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: gradient }} />
          <div style={{ position: "absolute", inset: 15, borderRadius: "50%", background: C.card, display: "grid", placeItems: "center", textAlign: "center" }}>
            <div><div style={{ fontSize: 25, fontWeight: 600, color: C.heading }}>{mix.total}</div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Posts</div></div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 13 }}>
          {mix.entries.map((e) => { const m = fmtMeta(e.type); return (
            <div key={e.type} style={{ display: "grid", gridTemplateColumns: "16px 1fr 40px", alignItems: "center", gap: 10 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: m.color }} />
              <div>
                <div><span style={{ fontSize: 13.5, fontWeight: 600, color: C.heading }}>{m.label}</span> <span style={{ fontSize: 12, color: C.muted }}>· {e.count} posts</span></div>
                <div style={{ height: 6, background: "#EEF1FB", borderRadius: 99, marginTop: 4, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${e.pct}%`, background: m.color, borderRadius: 99 }} /></div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.heading, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(e.pct)}%</span>
            </div>
          ); })}
        </div>
      </div>
    </Card>
  );
}

// Your read — the plain-English post-mix takeaway. Lives under "Which format wins"
// (right column) so the left column ends level with it — no dead space.
function HopeYourRead({ mix }: { mix: { total: number; entries: { type: string; count: number; pct: number }[] } }) {
  const dominant = mix.entries[0];
  if (!dominant) return null;
  const reelPct = mix.entries.find((e) => e.type === "REEL")?.pct || 0;
  const carouselPct = mix.entries.find((e) => e.type === "CAROUSEL_ALBUM")?.pct || 0;
  return (
    <div style={{ background: "#F4F6FF", border: "1px solid #E1E7FE", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.primary, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 5 }}>Your read</div>
      <div style={{ fontSize: 12.5, color: C.heading, lineHeight: 1.55 }}>
        {carouselPct >= 50
          ? <>You&rsquo;re <b>Carousel-heavy</b> — great for the followers you already have, but <b>Reels</b> are the format IG shows to NEW people. Bumping Reels from <b>{Math.round(reelPct)}%</b> toward <b>~40%</b> could grow your audience faster.</>
          : reelPct >= 40
            ? <>Nice Reel-forward mix — that&rsquo;s the format IG pushes to new people. Keep <b>Carousels</b> for depth.</>
            : <>Fairly balanced. For education content, aim for <b>~40% Reels · ~40% Carousels · ~20% Static</b>.</>}
      </div>
    </div>
  );
}

// Which format wins — visual comparison with an avg-reach bar per format + winner.
function HopeFormatWins({ rows, cardStyle, footer }: { rows: { type: string; count: number; avgReach: number; avgEng: number; erPct: number }[]; cardStyle?: React.CSSProperties; footer?: React.ReactNode }) {
  if (!rows.length) return null;
  const winner = rows[0];
  const wm = fmtMeta(winner.type);
  const maxReach = Math.max(1, ...rows.map((r) => r.avgReach));
  return (
    <Card style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.heading }}>Which format wins</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#fff", background: wm.color, padding: "4px 11px", borderRadius: 99 }}><IconTrophy size={13} /> {wm.label} — top reach</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>Average performance per format, so you can see what to make more of.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map((r) => { const m = fmtMeta(r.type); const isWin = r.type === winner.type; return (
          <div key={r.type} style={{ border: `1px solid ${isWin ? m.color + "55" : C.line}`, background: isWin ? `linear-gradient(135deg, ${m.color}0F, #fff)` : "#fff", borderRadius: 14, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: m.color }} /><span style={{ fontSize: 14.5, fontWeight: 600, color: C.heading }}>{m.label}</span><span style={{ fontSize: 11.5, color: C.muted }}>· {r.count} posts</span></div>
              {isWin && <span style={{ fontSize: 10, fontWeight: 600, color: m.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>Top reach</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
              <span style={{ flex: 1, height: 10, background: "#EEF1FB", borderRadius: 99, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(r.avgReach / maxReach) * 100}%`, background: m.color, borderRadius: 99 }} /></span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.heading, minWidth: 66, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r.avgReach)}</span>
            </div>
            <div style={{ display: "flex", gap: 22, fontSize: 12 }}>
              <span style={{ color: C.muted }}>Avg reach per post</span>
              <span style={{ color: C.muted, marginLeft: "auto" }}>Avg reactions <b style={{ color: C.heading }}>{fmt(r.avgEng)}</b></span>
              <span style={{ color: C.muted }}>Engagement <b style={{ color: r.erPct >= 5 ? C.success : C.heading }}>{r.erPct.toFixed(1)}%</b></span>
            </div>
          </div>
        ); })}
      </div>
      {footer && <div style={{ marginTop: 12 }}>{footer}</div>}
    </Card>
  );
}

// How to read — 3 visual step cards instead of a wall of text.
function HopeHowToRead() {
  const steps = [
    { n: 1, icon: IconChartBar, title: "Set the base", range: "90 days / 1 year", color: C.primary, body: <>Look at what won <b>most consistently</b> — make that <b>~50–60%</b> of every month&rsquo;s plan. Your reliable format.</> },
    { n: 2, icon: IconChartLine, title: "Check momentum", range: "30 days", color: C.teal, body: <>A different format winning this month? Bump its share <b>+10–15%</b> — something is shifting.</> },
    { n: 3, icon: IconClock, title: "Tune this week", range: "7 days", color: "#6E48F8", body: <>A 7-day spike? Add <b>one or two extras</b> to test next week — don&rsquo;t flip your whole strategy on it.</> },
  ];
  return (
    <Card>
      <div style={{ fontSize: 16, fontWeight: 600, color: C.heading }}>How to read this — planning your week vs your month</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>The longer the range, the more trustworthy the signal.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 14 }}>
        {steps.map((s) => (
          <div key={s.n} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 12, right: 16, fontSize: 46, fontWeight: 600, color: `${s.color}26`, lineHeight: 1, pointerEvents: "none" }}>{s.n}</div>
            <span style={{ position: "relative", width: 40, height: 40, borderRadius: 11, background: `${s.color}18`, color: s.color, display: "grid", placeItems: "center", marginBottom: 12 }}><s.icon size={21} stroke={1.9} /></span>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.heading }}>{s.title}</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: s.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{s.range}</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, position: "relative" }}>{s.body}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 12.5, color: C.heading, background: C.bg, borderRadius: 10, padding: "10px 14px", lineHeight: 1.5 }}>
        <b>Rule of thumb:</b> a 7-day spike is worth <b>a test</b> — a 90-day lead is worth <b>a strategy</b>.
      </div>
    </Card>
  );
}

// Date-range filter shown on every tab: 7d / 30d / 90d / 1y / Custom.
function RangeFilter({ rangeKey, setRangeKey, custom, setCustom }: {
  rangeKey: RangeKey; setRangeKey: (k: RangeKey) => void;
  custom: { from: string; to: string }; setCustom: (c: { from: string; to: string }) => void;
}) {
  const OPTS: [RangeKey, string][] = [["7d", "7 days"], ["30d", "30 days"], ["60d", "60 days"], ["1y", "1 year"], ["custom", "Custom"]];
  const inputStyle: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, color: C.heading, outline: "none", fontFamily: "inherit" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ background: C.card, borderRadius: 12, boxShadow: SHADOW, padding: 6, display: "inline-flex", gap: 4 }}>
        {OPTS.map(([k, label]) => {
          const on = rangeKey === k;
          return (
            <button key={k} onClick={() => setRangeKey(k)}
              style={{ padding: "8px 14px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: on ? C.primary : "transparent", color: on ? "#fff" : C.muted, boxShadow: on ? "0 8px 18px rgba(58,87,232,0.28)" : "none", transition: "all .15s" }}>
              {label}
            </button>
          );
        })}
      </div>
      {rangeKey === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, borderRadius: 12, boxShadow: SHADOW, padding: "6px 10px" }}>
          {/* Capped at today — analytics can't report on a date that hasn't happened. */}
          <HopeDatePicker size="sm" allowClear={false} value={custom.from}
            max={custom.to && custom.to < todayLocalISO() ? custom.to : todayLocalISO()}
            onChange={(v) => setCustom({ ...custom, from: clampToTodayISO(v) })} />
          <span style={{ color: C.muted, fontSize: 13 }}>→</span>
          <HopeDatePicker size="sm" allowClear={false} value={custom.to}
            min={custom.from || undefined} max={todayLocalISO()}
            onChange={(v) => setCustom({ ...custom, to: clampToTodayISO(v) })} />
        </div>
      )}
    </div>
  );
}
function SectionHeader({ icon: Icon, title, sub }: { icon: typeof IconLayoutGrid; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, marginBottom: -8 }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: C.chip, color: C.primary, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={20} stroke={1.8} /></span>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: C.heading, letterSpacing: "-0.2px" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.muted }}>{sub}</div>
      </div>
    </div>
  );
}
function StatCard({ label, value, delta, flat, detail, action, badge, est }: { label: string; value: string; delta: number | null; flat?: boolean; detail: string; action: string; badge?: string; est?: boolean }) {
  const hasDelta = !flat && typeof delta === "number";
  const dv = delta ?? 0;
  const up = dv >= 0;
  const pct = Math.min(100, Math.abs(dv) * 4 + 12);
  const R = 24, CIRC = 2 * Math.PI * R;
  const col = hasDelta ? (up ? C.success : C.danger) : C.primary;
  return (
    <div style={{ background: C.card, borderRadius: 14, boxShadow: SHADOW, padding: "18px", display: "flex", flexDirection: "column", gap: 12, minHeight: 168 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative", width: 58, height: 58, flexShrink: 0 }}>
          <svg width="58" height="58" viewBox="0 0 58 58">
            <circle cx="29" cy="29" r={R} fill="none" stroke={C.line} strokeWidth="5" />
            <circle cx="29" cy="29" r={R} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - (hasDelta ? pct : 55) / 100)} transform="rotate(-90 29 29)" />
          </svg>
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: col }}>{hasDelta ? (up ? <IconArrowUpRight size={19} /> : <IconArrowDownRight size={19} />) : <IconChartLine size={18} />}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            {label}
            {est && <span title="Estimated from reach — Instagram doesn't expose this metric directly" style={{ fontSize: 9, fontWeight: 600, color: C.muted, background: C.bg, border: `1px solid ${C.line}`, padding: "1px 5px", borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "help" }}>est</span>}
          </div>
          <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-0.5px", lineHeight: 1.15 }}>{value}</div>
          {hasDelta
            ? <div style={{ fontSize: 12, fontWeight: 600, color: col }}>{up ? "▲" : "▼"} {Math.abs(dv).toFixed(1)}%</div>
            : badge ? <div style={{ display: "inline-block", marginTop: 3, fontSize: 10, fontWeight: 600, color: C.primary, background: "#EEF1FB", padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{badge}</div> : null}
        </div>
      </div>
      {detail && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.4 }}>{detail}</div>}
      {action && <div style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px dashed ${C.line}`, fontSize: 12.5, color: C.primary, lineHeight: 1.4 }}>{action}</div>}
    </div>
  );
}
function GenderDonut({ gender }: { gender: { label: string; value: number }[] }) {
  const total = Math.max(1, gender.reduce((s, g) => s + g.value, 0));
  const colors = GENDER_COLORS;
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
          <div><div style={{ fontSize: 19, fontWeight: 600 }}>{kfmt(total)}</div><div style={{ fontSize: 10.5, color: C.muted }}>reached</div></div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {gender.map((g, i) => (
          <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: colors[i % colors.length] }} />
            <span style={{ color: C.heading }}>{genderName(g.label)}</span>
            <span style={{ color: C.muted }}>{Math.round((g.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function AreaChart({ series, metric }: { series: Insights["series"]; metric: "reach" | "engagement" }) {
  const W = 1120, H = 220, PB = 26, PT = 12, PL = 8, PR = 8;
  const pts = (series || []).filter((s) => typeof s[metric] === "number");
  const color = metric === "reach" ? C.primary : C.teal;
  const label = metric === "reach" ? "Reach" : "Engagement";
  const [hover, setHover] = useState<number | null>(null);
  const { path, max } = useMemo(() => {
    if (pts.length < 2) return { path: { area: "", line: "" }, max: 1 };
    const max = Math.max(1, ...pts.map((p) => p[metric] || 0));
    const x = (i: number) => PL + (i / (pts.length - 1)) * (W - PL - PR);
    const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[metric] || 0).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z`;
    return { path: { area, line }, max };
  }, [pts, metric]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(frac * (pts.length - 1)))));
  };
  const hx = hover != null && pts.length > 1 ? (hover / (pts.length - 1)) * 100 : 0;
  const hy = hover != null ? ((PT + (1 - (pts[hover][metric] || 0) / max) * (H - PT - PB)) / H) * 100 : 0;

  return (
    <div style={{ position: "relative", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
        <defs><linearGradient id="hpFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={PL} x2={W - PR} y1={PT + g * (H - PT - PB)} y2={PT + g * (H - PT - PB)} stroke={C.line} strokeWidth="1" />)}
        {path.area && <path d={path.area} fill="url(#hpFill)" />}
        {path.line && <path d={path.line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      {hover != null && pts[hover] && (
        <>
          <div style={{ position: "absolute", left: `${hx}%`, top: 0, bottom: 0, width: 1, background: "rgba(35,45,66,0.18)", transform: "translateX(-0.5px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: `${hx}%`, top: `${hy}%`, width: 11, height: 11, borderRadius: 99, background: color, border: "2.5px solid #fff", transform: "translate(-50%, -50%)", boxShadow: "0 2px 6px rgba(35,45,66,0.25)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: `${hx}%`, top: 6, transform: hx > 62 ? "translateX(calc(-100% - 10px))" : "translateX(10px)", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: SHADOW, padding: "8px 11px", fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2 }}>
            <div style={{ fontWeight: 600, color: C.heading, marginBottom: 3 }}>{pts[hover].date}</div>
            <div style={{ color: C.muted, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: color }} /> {label} <b style={{ color: C.heading, marginLeft: 2 }}>{fmt(pts[hover][metric] || 0)}</b></div>
          </div>
        </>
      )}
    </div>
  );
}
