"use client";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import {
  IconBrandInstagram, IconBrandYoutube, IconExternalLink, IconHeart,
  IconMessageCircle, IconLayoutGrid, IconVideo, IconPhoto, IconX, IconChevronLeft, IconChevronRight,
  IconFlame, IconTrendingUp, IconMessages, IconStar, IconSearch,
} from "@tabler/icons-react";

// ── data shapes (mirror lib/instagram.ts CompetitorSnapshot / CompetitorMedia) ──
type Media = {
  id: string; caption?: string; media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string; thumbnail_url?: string; permalink?: string; timestamp: string;
  like_count?: number; comments_count?: number;
  children?: { data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string }[] };
};
type Competitor = {
  username: string; name?: string; biography?: string; profile_picture_url?: string;
  followers_count: number; follows_count?: number; media_count: number;
  recent: Media[]; engagementRatePct: number; postsLast30d: number;
  avgLikesRecent: number; avgCommentsRecent: number;
};
type BenchmarkData = { competitors: (Competitor | { error: string; username: string })[] };
// A post flattened with its author so cards/modal know who posted it.
type Post = Media & { author: string; authorPic?: string };
type YtVid = { id: string; title: string; channel: string; thumbnail: string; publishedAt: string; views: number; url: string };
// Google Trends (free) — audience demand, from /api/radar/trends.
type TrendBreakout = { title: string; trafficNum?: number; traffic?: string; articles?: { title: string; url: string; source: string | null }[] };
type TrendsResp = { breakouts: TrendBreakout[]; ideas: { seed: string; ideas: string[] }[]; fetchedAt?: string };
// Web mentions about competitors (news/web + sentiment), from /api/radar/search.
type Mention = { platform: string; title: string; url: string; source: string | null; publishedAt: string; snippet: string; sentiment: "positive" | "negative" | "neutral"; about?: string };

const isComp = (c: BenchmarkData["competitors"][number]): c is Competitor => !("error" in c);
const nfmt = (n: number | undefined) => (n ?? 0) >= 1000 ? `${((n ?? 0) / 1000).toFixed(1)}k` : String(n ?? 0);
const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const nameOf = (c: Competitor) => c.name || c.username;
const eng = (m: Media) => (m.like_count || 0) + (m.comments_count || 0);

export function CompetitorBriefing() {
  // Competitors come from competitors.json (the default niche) — edit that file to
  // add/remove competitors and the whole briefing updates.
  const { data, isLoading } = useApi<BenchmarkData>(`/api/benchmark?accountId=goocampus`);
  const competitors = useMemo(() => (data?.competitors || []).filter(isComp), [data]);

  // Every competitor post, tagged with its author.
  const allPosts: Post[] = useMemo(() =>
    competitors.flatMap((c) => (c.recent || []).map((m) => ({ ...m, author: nameOf(c), authorPic: c.profile_picture_url }))),
    [competitors]);
  const igLatest = useMemo(() => [...allPosts].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)).slice(0, 10), [allPosts]);
  const topByReach = useMemo(() => [...allPosts].sort((a, b) => eng(b) - eng(a)).slice(0, 10), [allPosts]);

  // Competitor YouTube uploads (public data via the YouTube API key).
  const { data: ytData, isLoading: ytLoading } = useApi<{ videos: YtVid[] }>(`/api/benchmark/youtube`);
  const ytVideos = ytData?.videos || [];

  // Google Trends — what the audience is searching (demand, not competitor data).
  const { data: trends } = useApi<TrendsResp>(`/api/radar/trends`);
  const risingQueries = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const g of trends?.ideas || []) for (const q of g.ideas) {
      const k = q.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(q); }
    }
    return out.slice(0, 18);
  }, [trends]);

  const [open, setOpen] = useState<Post | null>(null);
  const [openYt, setOpenYt] = useState<YtVid | null>(null);
  const [openTrend, setOpenTrend] = useState<string | null>(null);

  return (
    <div className="hope-scope space-y-6">
      {/* Competitor scoreboard */}
      <Section title="Competitor scoreboard" badge="Instagram" right="who's growing & posting most · last 30 days" icon={<IconFlame size={18} />} accent="#3A57E8">
        {isLoading ? <RowSkeleton n={3} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {competitors.map((c) => (
              <div key={c.username} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Avatar url={c.profile_picture_url} name={nameOf(c)} size={34} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[#232D42] truncate">{nameOf(c)}</div>
                    <a href={`https://instagram.com/${c.username}`} target="_blank" rel="noreferrer" className="text-[11px] text-brand hover:underline">@{c.username}</a>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <Metric label="Followers" value={nfmt(c.followers_count)} />
                  <Metric label="Following" value={nfmt(c.follows_count)} />
                  <Metric label="Total posts" value={nfmt(c.media_count)} />
                  <Metric label="Posts / 30d" value={String(c.postsLast30d)} />
                  <Metric label="Avg likes" value={nfmt(c.avgLikesRecent)} />
                  <Metric label="Avg comments" value={nfmt(c.avgCommentsRecent)} />
                  <Metric label="Eng. rate" value={`${c.engagementRatePct.toFixed(1)}%`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Instagram — latest competitor posts (8, real thumbnails, open in dashboard) */}
      <Section title="Instagram — latest competitor posts" badge="Live" right="newest first · click to open here" icon={<IconBrandInstagram size={18} />} accent="#6E48F8">
        {isLoading ? <CardSkeleton n={10} /> : igLatest.length === 0 ? (
          <Empty>No competitor Instagram posts loaded yet.</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">
            {igLatest.map((p) => <PostCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
        )}
      </Section>

      {/* YouTube — live competitor uploads (public data) */}
      <Section title="YouTube — latest competitor uploads" badge="Live" right="newest first · click to play here" icon={<IconBrandYoutube size={18} />} accent="#079AA2">
        {ytLoading ? <CardSkeleton n={5} /> : ytVideos.length === 0 ? (
          <Empty>No competitor YouTube uploads loaded. Add channels in competitor-youtube.json.</Empty>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {ytVideos.slice(0, 8).map((v) => <YtCard key={v.id} v={v} onOpen={() => setOpenYt(v)} />)}
          </div>
        )}
      </Section>

      {/* Top competitor content — same card style as the latest-posts grid */}
      <Section title="Top competitor content" badge="Instagram" right="most engagement · recent · click to open here" icon={<IconStar size={18} />} accent="#0EA5E9">
        {isLoading ? <CardSkeleton n={10} /> : topByReach.length === 0 ? (
          <Empty>No competitor content loaded yet.</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">
            {topByReach.map((p) => <PostCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
        )}
      </Section>

      {/* What students are searching now — Google Trends, enlarged. Seeds come from the
          topics you track in Content Radar → Manage alerts. */}
      <Section title="What students are searching now" badge="Google Trends" right="audience demand · add keywords in Content Radar → Manage alerts" icon={<IconSearch size={18} />} accent="#3A57E8" flat>
        {(trends?.breakouts?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
            {trends!.breakouts.slice(0, 6).map((b, i) => (
              <button key={i} onClick={() => setOpenTrend(b.title)} className="text-left border border-gray-100 rounded-xl p-3.5 hover:border-brand transition block w-full">
                <div className="text-[13.5px] font-medium text-[#232D42]">{b.title}</div>
                {(b.traffic || b.trafficNum) && <div className="text-[12px] text-emerald-600 mt-0.5">↑ {b.traffic || `${(b.trafficNum || 0).toLocaleString()}+ searches`}</div>}
              </button>
            ))}
          </div>
        )}
        {risingQueries.length > 0 ? (
          <div className="flex flex-wrap gap-2.5">
            {risingQueries.map((q, i) => (
              <button key={i} onClick={() => setOpenTrend(q)}
                className="inline-flex items-center gap-1.5 text-[13.5px] bg-white border border-gray-200 hover:border-brand hover:bg-brand-light/40 text-[#232D42] rounded-full px-4 py-2 transition">
                <IconTrendingUp size={13} className="text-brand" /> {q}
              </button>
            ))}
          </div>
        ) : <div className="text-[13px] text-gray-400">Loading rising searches…</div>}
        <div className="text-[12px] text-gray-400 mt-4">Real rising queries around your tracked topics (Google Autocomplete + Daily Trends, free). Click one to preview; add or change topics in <b>Content Radar → Manage alerts</b>.</div>
      </Section>

      {/* What people are saying — full width */}
      <Section title="What people are saying" badge="News & web" right="about your competitors" icon={<IconMessages size={18} />} accent="#079AA2" flat>
        <MentionsSection names={competitors.map((c) => nameOf(c).split("|")[0].trim())} />
      </Section>

      {open && <PostModal p={open} onClose={() => setOpen(null)} />}
      {openYt && <YtModal v={openYt} onClose={() => setOpenYt(null)} />}
      {openTrend && <TrendModal q={openTrend} onClose={() => setOpenTrend(null)} />}
    </div>
  );
}

// ── building blocks ──
// Prominent, colour-coded section header so each block is instantly distinguishable.
function Section({ title, badge, right, icon, children, flat, accent = "#3A57E8" }: { title: string; badge?: string; right?: string; icon?: React.ReactNode; children: React.ReactNode; flat?: boolean; accent?: string }) {
  const inner = (
    <>
      <div className="flex items-center gap-3 mb-4">
        {icon && <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: `${accent}1A`, color: accent }}>{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-[16.5px] font-semibold text-[#232D42] leading-tight">{title}</div>
          {right && <div className="text-[11.5px] text-gray-400 mt-0.5 truncate">{right}</div>}
        </div>
        {badge && <span className="text-[11px] font-medium rounded-full px-2.5 py-1 shrink-0 self-start" style={{ background: `${accent}14`, color: accent }}>{badge}</span>}
      </div>
      {children}
    </>
  );
  return flat
    ? <div className="bg-white border border-gray-100 rounded-2xl p-5">{inner}</div>
    : <div className="bg-white border border-gray-100 rounded-2xl p-5">{inner}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-[11.5px] py-0.5"><span className="text-gray-400">{label}</span><span className="font-semibold text-[#232D42] tabular-nums">{value}</span></div>;
}

function Avatar({ url, name, size = 28 }: { url?: string; name: string; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return url
    ? <img src={url} alt={name} referrerPolicy="no-referrer" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />
    : <span style={{ width: size, height: size }} className="rounded-full bg-brand-light text-brand text-[10px] font-semibold flex items-center justify-center shrink-0">{initials}</span>;
}

const TypeIcon = ({ t }: { t: Media["media_type"] }) =>
  t === "CAROUSEL_ALBUM" ? <IconLayoutGrid size={13} /> : t === "VIDEO" ? <IconVideo size={13} /> : <IconPhoto size={13} />;

function PostCard({ p, onOpen }: { p: Post; onOpen: () => void }) {
  const src = p.thumbnail_url || p.media_url;
  return (
    <button onClick={onOpen} className="text-left bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-brand hover:shadow-sm transition group">
      <div className="relative aspect-square bg-gray-100">
        {src
          ? <img src={src} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300"><IconPhoto size={24} /></div>}
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-black/55 text-white text-[10px] rounded-md px-1.5 py-0.5"><TypeIcon t={p.media_type} /> {p.media_type === "CAROUSEL_ALBUM" ? "Carousel" : p.media_type === "VIDEO" ? "Video" : "Image"}</span>
      </div>
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 mb-1"><Avatar url={p.authorPic} name={p.author} /><span className="text-[11.5px] font-medium text-[#232D42] truncate">{p.author}</span><span className="text-[10.5px] text-gray-400 ml-auto shrink-0">{ago(p.timestamp)}</span></div>
        <div className="text-[11.5px] text-gray-600 line-clamp-2 leading-snug min-h-[30px]">{p.caption?.replace(/\n/g, " ") || "(no caption)"}</div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-0.5"><IconHeart size={12} /> {nfmt(p.like_count)}</span>
          <span className="inline-flex items-center gap-0.5"><IconMessageCircle size={12} /> {nfmt(p.comments_count)}</span>
          <span className="ml-auto text-brand text-[11px] opacity-0 group-hover:opacity-100 transition">Open →</span>
        </div>
      </div>
    </button>
  );
}

// In-dashboard viewer — carousel children slide here; nothing bounces out.
function PostModal({ p, onClose }: { p: Post; onClose: () => void }) {
  const slides = p.media_type === "CAROUSEL_ALBUM" && p.children?.data?.length
    ? p.children.data.map((c) => ({ type: c.media_type, url: c.media_url, thumb: c.thumbnail_url }))
    : [{ type: p.media_type, url: p.media_url, thumb: p.thumbnail_url }];
  const [i, setI] = useState(0);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((v) => Math.min(slides.length - 1, v + 1)); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, slides.length]);
  const s = slides[i];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 overflow-hidden max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Media */}
        <div className="relative bg-black flex items-center justify-center min-h-[320px]">
          {s.type === "VIDEO" && s.url
            ? <video src={s.url} poster={s.thumb} controls className="max-h-[90vh] w-full object-contain" />
            : (s.url || s.thumb)
              ? <img src={s.url || s.thumb} alt="" referrerPolicy="no-referrer" className="max-h-[90vh] w-full object-contain" />
              : <div className="text-gray-500 text-sm p-10">Media preview unavailable</div>}
          {slides.length > 1 && (
            <>
              <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1.5 disabled:opacity-30"><IconChevronLeft size={18} /></button>
              <button onClick={() => setI((v) => Math.min(slides.length - 1, v + 1))} disabled={i === slides.length - 1} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1.5 disabled:opacity-30"><IconChevronRight size={18} /></button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/55 text-white text-[11px] rounded-full px-2 py-0.5">{i + 1} / {slides.length}</span>
            </>
          )}
        </div>
        {/* Meta */}
        <div className="p-5 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3">
            <Avatar url={p.authorPic} name={p.author} />
            <div className="min-w-0"><div className="text-[13px] font-semibold text-[#232D42] truncate">{p.author}</div><div className="text-[11px] text-gray-400">{ago(p.timestamp)} · {p.media_type === "CAROUSEL_ALBUM" ? "Carousel" : p.media_type === "VIDEO" ? "Video" : "Image"}</div></div>
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><IconX size={18} /></button>
          </div>
          <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed overflow-y-auto flex-1">{p.caption || "(no caption)"}</div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[12.5px] text-gray-600">
            <span className="inline-flex items-center gap-1"><IconHeart size={14} /> {nfmt(p.like_count)}</span>
            <span className="inline-flex items-center gap-1"><IconMessageCircle size={14} /> {nfmt(p.comments_count)}</span>
            {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="ml-auto text-brand hover:underline inline-flex items-center gap-1">Open on Instagram <IconExternalLink size={12} /></a>}
          </div>
        </div>
      </div>
    </div>
  );
}

function YtCard({ v, onOpen }: { v: YtVid; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="text-left bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-brand hover:shadow-sm transition group">
      <div className="relative aspect-video bg-gray-100">
        {v.thumbnail
          ? <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300"><IconBrandYoutube size={24} /></div>}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-10 h-10 rounded-full bg-black/60 group-hover:bg-red-600 transition flex items-center justify-center text-white"><IconBrandYoutube size={20} /></span>
        </span>
      </div>
      <div className="p-2.5">
        <div className="text-[12px] font-medium text-[#232D42] line-clamp-2 leading-snug min-h-[32px]">{v.title}</div>
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">
          <span className="truncate">{v.channel}</span>
          <span className="ml-auto shrink-0">{nfmt(v.views)} views</span>
        </div>
      </div>
    </button>
  );
}

function YtModal({ v, onClose }: { v: YtVid; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="aspect-video bg-black">
          <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${v.id}?autoplay=1`} title={v.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-[#232D42]">{v.title}</div>
              <div className="text-[11.5px] text-gray-400 mt-0.5">{v.channel} · {nfmt(v.views)} views · {ago(v.publishedAt)}</div>
            </div>
            <a href={v.url} target="_blank" rel="noreferrer" className="text-brand text-[12px] inline-flex items-center gap-1 shrink-0">YouTube <IconExternalLink size={12} /></a>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 shrink-0"><IconX size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Rising-search preview — opens INSIDE the dashboard. Clean, single-purpose card:
// the search term + two clear actions. Only the buttons leave the dashboard.
function TrendModal({ q, onClose }: { q: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-light text-brand"><IconSearch size={16} /></span>
          <div className="text-[13px] font-medium text-[#232D42]">Rising search on Google</div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><IconX size={18} /></button>
        </div>
        <div className="px-5 py-6">
          <div className="text-[18px] font-semibold text-[#232D42] leading-snug">{q}</div>
          <div className="text-[13px] text-gray-500 mt-1.5">Students are searching this on Google right now — a strong topic to turn into content.</div>
          <div className="flex gap-2 mt-5">
            <a href={`https://www.google.com/search?q=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-brand text-white rounded-xl px-4 py-2.5 text-[13px] font-medium hover:bg-brand-dark">
              <IconExternalLink size={15} /> Open in Google
            </a>
            <a href={`https://trends.google.com/trends/explore?geo=IN&q=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 border border-gray-200 text-[#4A5468] rounded-xl px-4 py-2.5 text-[13px] font-medium hover:border-gray-300">
              <IconTrendingUp size={15} /> See the trend
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Live competitor mentions — searches each competitor name via /api/radar/search
// (Google News + web) and shows recent items with sentiment.
function MentionsSection({ names }: { names: string[] }) {
  const [mentions, setMentions] = useState<Mention[] | null>(null);
  const [openM, setOpenM] = useState<Mention | null>(null);
  const key = names.join("|");
  useEffect(() => {
    if (!names.length) { setMentions([]); return; }
    let cancelled = false;
    // Serper (Google Search) → real snippets + direct links.
    fetch(`/api/benchmark/mentions?names=${encodeURIComponent(names.join(","))}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { mentions: [] }))
      .then((d) => { if (!cancelled) setMentions((d.mentions || []).slice(0, 10)); })
      .catch(() => { if (!cancelled) setMentions([]); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mentions) return <div className="animate-pulse h-24 bg-gray-100 rounded-xl" />;
  if (mentions.length === 0) return <div className="text-[13px] text-gray-400 py-4 text-center">No recent mentions found for these competitors.</div>;

  const dot = (s: Mention["sentiment"]) => s === "positive" ? "bg-emerald-500" : s === "negative" ? "bg-rose-500" : "bg-gray-300";
  return (
    <>
      <div className="flex flex-col divide-y divide-gray-50">
        {mentions.map((m, i) => (
          <button key={i} onClick={() => setOpenM(m)} className="flex items-start gap-2.5 py-2.5 hover:bg-brand-light/40 rounded-lg px-1 transition text-left w-full">
            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot(m.sentiment)}`} title={m.sentiment} />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] text-[#232D42] leading-snug line-clamp-2">{m.title}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{m.about && <span className="text-brand">{m.about}</span>}{m.about ? " · " : ""}{m.source || m.platform}{m.publishedAt ? ` · ${m.publishedAt}` : ""}</div>
            </div>
            <IconChevronRight size={13} className="text-gray-300 mt-1 shrink-0" />
          </button>
        ))}
      </div>
      {openM && <MentionModal m={openM} onClose={() => setOpenM(null)} />}
    </>
  );
}

// Mention preview — opens INSIDE the dashboard. The article opens externally only via
// the explicit "Open article" button.
function MentionModal({ m, onClose }: { m: Mention; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const s = m.sentiment;
  const pill = s === "positive" ? "bg-emerald-50 text-emerald-700" : s === "negative" ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-500";
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 shrink-0">
          <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 capitalize ${pill}`}>{s}</span>
          <span className="text-[12px] text-gray-400 truncate">{m.about && <span className="text-brand">{m.about}</span>}{m.about ? " · " : ""}{m.source || m.platform}</span>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><IconX size={18} /></button>
        </div>
        <div className="px-5 py-5 overflow-y-auto">
          <div className="text-[16px] font-semibold text-[#232D42] leading-snug">{m.title}</div>
          {m.snippet
            ? <div className="text-[13.5px] text-gray-700 leading-relaxed mt-2.5">{m.snippet}</div>
            : <div className="text-[13px] text-gray-400 mt-2.5">No preview text — open the article to read the full story.</div>}
          <div className="text-[11.5px] text-gray-400 mt-3">{m.source || m.platform}{m.publishedAt ? ` · ${m.publishedAt}` : ""}</div>
          <a href={m.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 bg-brand text-white rounded-xl px-4 py-2.5 text-[13px] font-medium hover:bg-brand-dark">
            <IconExternalLink size={15} /> Open article
          </a>
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center text-[13px] text-gray-400">{children}</div>;
}
function RowSkeleton({ n }: { n: number }) { return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>; }
function CardSkeleton({ n }: { n: number }) { return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="aspect-[3/4] bg-gray-100 rounded-xl animate-pulse" />)}</div>; }
