"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import {
  IconBrandInstagram, IconBrandYoutube, IconExternalLink, IconHeart,
  IconMessageCircle, IconLayoutGrid, IconVideo, IconPhoto, IconX, IconChevronLeft, IconChevronRight,
  IconFlame, IconStar,
  IconArrowRight,
} from "@tabler/icons-react";
import { LoadingBlock } from "@/components/LoadingBlock";

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
type BenchmarkData = {
  competitors: (Competitor | { error: string; username: string })[];
  sourceAccount?: { id: string; handle: string };
};
// A post flattened with its author so cards/modal know who posted it.
type Post = Media & { author: string; authorPic?: string };
type YtVid = { id: string; title: string; channel: string; thumbnail: string; publishedAt: string; views: number; url: string };

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
  // "Track competitors should show here" (Nandu, 28 Sept). The ones people actually
  // add on the Competitors tab now drive this board; competitors.json is the fallback
  // for when nobody has tracked anything yet. Reading them here only works because
  // they are rows now rather than browser storage (sql/029).
  const { data: trackedResp } = useApi<{ available: boolean; items: { handle: string }[] }>(
    `/api/benchmark/tracked?accountId=goocampus`);
  // Until the competitors table exists they are still in the browser, where the
  // Competitors tab put them — and this page runs in the browser too, so it can
  // read them from there. No migration needed for the scoreboard to follow what
  // you track; the table only adds sharing them across people and devices.
  const [localHandles, setLocalHandles] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bm-tracked-goocampus");
      const parsed = raw ? JSON.parse(raw) : [];
      setLocalHandles(Array.isArray(parsed)
        ? parsed.map((x: unknown) => (typeof x === "string" ? x : (x as { handle?: string })?.handle || "")).filter(Boolean)
        : []);
    } catch { /* private mode */ }
  }, []);
  const serverHandles = (trackedResp?.items || []).map((t) => t.handle).filter(Boolean);
  const trackedHandles = serverHandles.length ? serverHandles : localHandles;
  const { data, isLoading } = useApi<BenchmarkData>(
    trackedHandles.length
      ? `/api/benchmark?accountId=goocampus&handles=${encodeURIComponent(trackedHandles.join(","))}`
      : `/api/benchmark?accountId=goocampus`);
  // People track their own handle on the Competitors tab — it belongs in the
  // compare table there. Here it does not: this page says it is about them, not
  // us, and ten of our own posts under "Top competitor content" made a liar of it.
  const ourHandle = (data?.sourceAccount?.handle || "").replace(/^@/, "").toLowerCase();
  const competitors = useMemo(
    () => (data?.competitors || []).filter(isComp).filter((c) => c.username.toLowerCase() !== ourHandle),
    [data, ourHandle]);

  // Every competitor post, tagged with its author.
  const allPosts: Post[] = useMemo(() =>
    competitors.flatMap((c) => (c.recent || []).map((m) => ({ ...m, author: nameOf(c), authorPic: c.profile_picture_url }))),
    [competitors]);
  const igLatest = useMemo(() => [...allPosts].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)).slice(0, 10), [allPosts]);
  const topByReach = useMemo(() => [...allPosts].sort((a, b) => eng(b) - eng(a)).slice(0, 10), [allPosts]);

  // Competitor YouTube uploads (public data via the YouTube API key).
  const { data: ytData, isLoading: ytLoading } = useApi<{ videos: YtVid[] }>(`/api/benchmark/youtube`);
  const ytVideos = ytData?.videos || [];

  const [open, setOpen] = useState<Post | null>(null);
  const [openYt, setOpenYt] = useState<YtVid | null>(null);

  // Six full-width bands stacked in one column came to 5.2 screens of scrolling,
  // all shouting equally — "completely cluttered" (Praveen, 28 Sept).
  //
  // Tabs alone were not the answer: two of the four were Content Radar wearing a
  // different hat — same /api/radar/trends and /api/radar/search, fewer sources,
  // and a panel telling you to go to "Content Radar → Manage alerts" to change
  // them. Hiding a duplicate behind a tab still leaves a duplicate. They are gone
  // from here; Content Radar keeps them, with the eight sources this never had.
  //
  // What is left is what only this page does: who they are, and what they posted.
  const [tab, setTab] = useState<BriefTab>("competitors");

  return (
    <div className="preview-scope space-y-6">
      <TabBar tab={tab} onChange={setTab} />

      {tab === "competitors" && (<>
      {/* Competitor scoreboard */}
      <Section title="Competitor scoreboard" badge="Instagram"
        right={`${trackedHandles.length ? "the competitors you track" : "the default list"} · click one for the full profile · last 30 days`}
        icon={<IconFlame size={18} />} accent="#3A57E8">
        {isLoading ? <RowSkeleton /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {competitors.map((c) => (
              <Link key={c.username} href={`/dashboard/preview/benchmark?profile=${encodeURIComponent(c.username)}`}
                title={`Open ${nameOf(c)} — Instagram, YouTube, what people say, and the read`}
                className="group block bg-white border border-gray-100 rounded-xl p-4 transition hover:border-brand">
                <div className="flex items-center gap-2 mb-3">
                  <Avatar url={c.profile_picture_url} name={nameOf(c)} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#232D42] truncate">{nameOf(c)}</div>
                    <div className="text-[11px] text-[#8A92A6] truncate">@{c.username}</div>
                  </div>
                  <IconArrowRight size={16} stroke={1.8} className="flex-shrink-0 text-gray-300 group-hover:text-brand transition" />
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
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Instagram — latest competitor posts (8, real thumbnails, open in dashboard) */}
      </>)}

      {tab === "posts" && (<>
      <Section title="Instagram — latest competitor posts" badge="Live" right="newest first · click to open here" icon={<IconBrandInstagram size={18} />} accent="#6E48F8">
        {isLoading ? <CardSkeleton /> : igLatest.length === 0 ? (
          <Empty>No competitor Instagram posts loaded yet.</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">
            {igLatest.map((p) => <PostCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
        )}
      </Section>

      {/* YouTube — live competitor uploads (public data) */}
      <Section title="YouTube — latest competitor uploads" badge="Live" right="newest first · click to play here" icon={<IconBrandYoutube size={18} />} accent="#079AA2">
        {ytLoading ? <CardSkeleton /> : ytVideos.length === 0 ? (
          <Empty>No competitor YouTube uploads loaded. Add channels in competitor-youtube.json.</Empty>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {ytVideos.slice(0, 8).map((v) => <YtCard key={v.id} v={v} onOpen={() => setOpenYt(v)} />)}
          </div>
        )}
      </Section>

      {/* Top competitor content — same card style as the latest-posts grid */}
      </>)}

      {tab === "competitors" && (<>
      <Section title="Top competitor content" badge="Instagram" right="most engagement · recent · click to open here" icon={<IconStar size={18} />} accent="#0EA5E9">
        {isLoading ? <CardSkeleton /> : topByReach.length === 0 ? (
          <Empty>No competitor content loaded yet.</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">
            {topByReach.map((p) => <PostCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
        )}
      </Section>

      </>)}

      {open && <PostModal p={open} onClose={() => setOpen(null)} />}
      {openYt && <YtModal v={openYt} onClose={() => setOpenYt(null)} />}
    </div>
  );
}

// Two views, in the order you'd actually work: who they are, then what they just
// posted. Search trends and web mentions used to be here as a third and fourth —
// they are Content Radar's, and they are back there now.
type BriefTab = "competitors" | "posts";
const BRIEF_TABS: { key: BriefTab; label: string; hint: string }[] = [
  { key: "competitors", label: "Competitors", hint: "who is growing, and their best content" },
  { key: "posts",       label: "Their posts", hint: "latest on Instagram and YouTube" },
];

function TabBar({ tab, onChange }: { tab: BriefTab; onChange: (t: BriefTab) => void }) {
  const active = BRIEF_TABS.find((t) => t.key === tab);
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-2 py-2">
      <div className="flex items-center gap-1 flex-wrap">
        {BRIEF_TABS.map((t) => (
          <button key={t.key} onClick={() => onChange(t.key)}
            className={`h-9 px-3.5 rounded-lg text-[13.5px] font-medium transition ${
              t.key === tab ? "bg-brand text-white" : "text-[#4A5468] hover:bg-[#F6F7FB]"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {active && <div className="text-[12px] text-[#8A92A6] px-2 pt-1.5">{active.hint}</div>}
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
    <div className="fixed inset-0 !mt-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl overflow-hidden flex flex-col md:flex-row w-[94vw] md:w-auto max-w-[94vw] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        {/* Media — shown at its TRUE aspect (a vertical reel stays vertical and fully
            visible, a square post stays square). The panel shrink-wraps the media, so
            there are no letterbox bars and nothing gets cropped. */}
        <div className="relative bg-gray-900 shrink-0 flex items-center justify-center overflow-hidden">
          {s.type === "VIDEO" && s.url
            ? <video src={s.url} poster={s.thumb} controls className="block max-h-[58vh] md:max-h-[86vh] w-auto max-w-full md:max-w-[480px] object-contain" />
            : (s.url || s.thumb)
              ? <img src={s.url || s.thumb} alt="" referrerPolicy="no-referrer" className="block max-h-[58vh] md:max-h-[86vh] w-auto max-w-full md:max-w-[480px] object-contain" />
              : <div className="flex items-center justify-center min-h-[300px] w-[300px] text-gray-300 text-sm p-10">Media preview unavailable</div>}
          {slides.length > 1 && (
            <>
              <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} className="absolute z-20 left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1.5 disabled:opacity-30"><IconChevronLeft size={18} /></button>
              <button onClick={() => setI((v) => Math.min(slides.length - 1, v + 1))} disabled={i === slides.length - 1} className="absolute z-20 right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1.5 disabled:opacity-30"><IconChevronRight size={18} /></button>
              <span className="absolute z-20 bottom-2 left-1/2 -translate-x-1/2 bg-black/55 text-white text-[11px] rounded-full px-2 py-0.5">{i + 1} / {slides.length}</span>
            </>
          )}
        </div>
        {/* Meta */}
        <div className="p-5 flex flex-col min-h-0 w-full md:w-[360px]">
          <div className="flex items-center gap-2 mb-3">
            <Avatar url={p.authorPic} name={p.author} />
            <div className="min-w-0"><div className="text-[13px] font-semibold text-[#232D42] truncate">{p.author}</div><div className="text-[11px] text-gray-400">{ago(p.timestamp)} · {p.media_type === "CAROUSEL_ALBUM" ? "Carousel" : p.media_type === "VIDEO" ? "Video" : "Image"}</div></div>
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><IconX size={18} /></button>
          </div>
          <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed overflow-y-auto flex-1 min-h-0">{p.caption || "(no caption)"}</div>
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
    <div className="fixed inset-0 !mt-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
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

// Rising-search results — the actual Google results shown INSIDE the dashboard (via
// Serper; Google's own page can't be embedded). People-also-ask + related searches are
// clickable to keep browsing without leaving. Only a result / "Open in Google" leaves.
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center text-[13px] text-gray-400">{children}</div>;
}
function RowSkeleton() { return <LoadingBlock className="!py-8" size={26} />; }
function CardSkeleton() { return <LoadingBlock className="!py-10" size={26} />; }
