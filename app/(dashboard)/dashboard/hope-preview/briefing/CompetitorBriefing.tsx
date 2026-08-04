"use client";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import {
  IconBrandInstagram, IconBrandLinkedin, IconBrandYoutube, IconExternalLink, IconHeart,
  IconMessageCircle, IconLayoutGrid, IconVideo, IconPhoto, IconX, IconChevronLeft, IconChevronRight,
  IconSpeakerphone, IconFlame, IconPlugConnected, IconTrendingUp, IconMessages,
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

export function CompetitorBriefing({ person }: { person: string }) {
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

  const [open, setOpen] = useState<Post | null>(null);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const who = person ? person.charAt(0).toUpperCase() + person.slice(1) : "team";

  return (
    <div className="hope-scope space-y-6">
      {/* Header */}
      <div className="rounded-2xl px-6 py-5" style={{ background: "linear-gradient(100deg,#3A57E8,#6E48F8)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-white text-[19px] font-semibold">Competitor radar · {greet}, {who}</div>
            <div className="text-[#D7DDFB] text-[12.5px] mt-0.5">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · what the competition is doing — everything here is about them, not us.</div>
          </div>
          <span className="inline-flex items-center gap-1.5 bg-white/15 text-white rounded-full px-3 py-1.5 text-[12px]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300" /> Instagram · live</span>
        </div>
      </div>

      {/* Competitor scoreboard */}
      <Section title="Competitor scoreboard" badge="Live · Instagram" right="who's growing & posting most · last 30 days" icon={<IconFlame size={15} className="text-brand" />}>
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
      <Section title="Instagram — latest competitor posts" badge="Live" right="newest first · click to open here" icon={<IconBrandInstagram size={15} className="text-brand" />}>
        {isLoading ? <CardSkeleton n={10} /> : igLatest.length === 0 ? (
          <Empty>No competitor Instagram posts loaded yet.</Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {igLatest.map((p) => <PostCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
        )}
      </Section>

      {/* LinkedIn — placeholder (needs a competitor-channel connector) */}
      <Section title="LinkedIn — competitor posts" badge="Connect" icon={<IconBrandLinkedin size={15} className="text-brand" />}>
        <ConnectPlaceholder platform="LinkedIn" note="Add competitor LinkedIn company pages to pull their posts here. Needs a LinkedIn competitor-channel connector." />
      </Section>

      {/* YouTube — placeholder */}
      <Section title="YouTube — competitor uploads" badge="Connect" icon={<IconBrandYoutube size={15} className="text-brand" />}>
        <ConnectPlaceholder platform="YouTube" note="Add competitor YouTube channels to pull their latest uploads with thumbnails. Needs a YouTube competitor-channel connector." />
      </Section>

      {/* Top competitor content — same card style as the latest-posts grid */}
      <Section title="Top competitor content" badge="Live · Instagram" right="most engagement · recent · click to open here" icon={<IconTrendingUp size={15} className="text-brand" />}>
        {isLoading ? <CardSkeleton n={10} /> : topByReach.length === 0 ? (
          <Empty>No competitor content loaded yet.</Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {topByReach.map((p) => <PostCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
        )}
      </Section>

      {/* Ads + Mentions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Section title="Competitor ads running now" badge="Connect" icon={<IconSpeakerphone size={15} className="text-brand" />} flat>
          <ConnectPlaceholder platform="Meta Ad Library" note="See which ads competitors are actively running (creatives, placements, how long live). Needs the Meta Ad Library connector authorized." />
        </Section>
        <Section title="What people are saying" badge="Connect" icon={<IconMessages size={15} className="text-brand" />} flat>
          <ConnectPlaceholder platform="Mentions" note="Public mentions & comments about competitors (Reddit, Quora, review sites) will surface here so you can see sentiment. Needs the mentions connector." />
        </Section>
      </div>

      {open && <PostModal p={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── building blocks ──
function Section({ title, badge, right, icon, children, flat }: { title: string; badge?: string; right?: string; icon?: React.ReactNode; children: React.ReactNode; flat?: boolean }) {
  const inner = (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {icon}
        <span className="text-[14px] font-semibold text-[#232D42]">{title}</span>
        {badge && <span className={`text-[10.5px] font-medium rounded-full px-2 py-0.5 ${badge === "Connect" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{badge}</span>}
        {right && <span className="ml-auto text-[11.5px] text-gray-400">{right}</span>}
      </div>
      {children}
    </>
  );
  return flat ? <div className="bg-white border border-gray-100 rounded-2xl p-5">{inner}</div> : <div>{inner}</div>;
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

function ConnectPlaceholder({ platform, note }: { platform: string; note: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center">
      <IconPlugConnected size={26} className="mx-auto text-[#8A92A6]" />
      <div className="text-[13.5px] font-medium text-[#232D42] mt-2">{platform} feed not connected yet</div>
      <div className="text-[12.5px] text-[#8A92A6] mt-1 max-w-md mx-auto">{note}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center text-[13px] text-gray-400">{children}</div>;
}
function RowSkeleton({ n }: { n: number }) { return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>; }
function CardSkeleton({ n }: { n: number }) { return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="aspect-[3/4] bg-gray-100 rounded-xl animate-pulse" />)}</div>; }
