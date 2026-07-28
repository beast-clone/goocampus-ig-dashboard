"use client";
import { useEffect, useRef, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LI_PAGE } from "@/components/PlatformOverviews";
import { useApi } from "@/lib/use-api";
import { IconEye, IconThumbUp, IconMessageCircle, IconFileText, IconPaperclip } from "@tabler/icons-react";
import { fmtDateShort } from "@/lib/date";

// pdf.js renders LinkedIn document posts (carousel PDFs) exactly as they look
// on LinkedIn — media.licdn.com serves them public + CORS-open, so the browser
// can draw real pages. Loaded lazily so text-only brands pay nothing.
type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      // Served from /public (copied by the prebuild step). Referencing it as a URL
      // instead of `new URL(..., import.meta.url)` keeps webpack from bundling the
      // worker — its import.meta breaks Terser during `next build`.
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

// LinkedIn content page (sidebar: LinkedIn → Posts) — Instagram-style card grid.
// Every post gets a visual: its real thumbnail when LinkedIn provides one, else
// a designed text-creative placeholder (most LinkedIn posts are text-only).
// Clicking a card opens the detail view: caption on top, creative, and the
// complete metrics underneath.

type Post = {
  id: string; date: string; text: string; type: string;
  impressions: number; uniqueImpressions?: number; clicks: number; reactions: number;
  comments: number; shares: number; engagementRate: number; ctr: number;
  thumbnailUrl?: string | null; permalink?: string | null; mediaTitle?: string | null;
  docUrl?: string | null;
};
type Resp = {
  source: "demo" | "live";
  page: { name: string };
  posts: Post[];
  error?: string;
};

const LI_BLUE = "#0A66C2";

function fmt(n: number | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("en-IN");
}
function dateLabel(iso: string): string {
  return fmtDateShort(iso, iso);
}

export default function LinkedInPostsPage() {
  return (
    <HopeDashboardShell active="linkedin" title="LinkedIn posts" subtitle="Every post in range — click one for the full picture.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const pageKey = LI_PAGE[accountId] ?? null;
  const qs = new URLSearchParams({ page: pageKey ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<Resp>(pageKey ? `/api/linkedin?${qs}` : null);
  const [selected, setSelected] = useState<Post | null>(null);

  if (!pageKey) {
    return <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">This brand has no LinkedIn page connected.</div>;
  }
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading posts…</div>;
  if (!data || data.error) return <div className="text-sm text-gray-400 py-16 text-center">Couldn&apos;t load posts.</div>;

  const posts = [...(data.posts || [])].sort((a, b) => b.impressions - a.impressions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm font-semibold text-gray-800">{data.page.name} · {posts.length} posts in range · by impressions</div>
        {data.source === "live"
          ? <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>
          : <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Demo</span>}
      </div>

      {posts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">No posts in this date range.</div>
      ) : (
        <>
          {/* Highlighted TOP PERFORMERS hero — the 3 best by impressions, big + prominent */}
          <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base font-semibold text-gray-900">🏆 Top performers</span>
              <span className="text-xs text-gray-400">· by impressions</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {posts.slice(0, 3).map((p) => (
                <button key={p.id} onClick={() => setSelected(p)} className="flex gap-4 rounded-xl bg-white border border-gray-100 p-3 hover:border-gray-300 hover:shadow-sm text-left">
                  <div className="w-32 aspect-square rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    {p.docUrl
                      ? <DocThumb url={p.docUrl} fallback={<Creative post={p} />} />
                      : <Creative post={p} />}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">{p.type} · {dateLabel(p.date)}</div>
                    <div className="text-[13px] text-gray-900 leading-snug mt-0.5 line-clamp-2">{p.text || "(no text)"}</div>
                    <div className="grid grid-cols-3 gap-1 mt-auto pt-2 text-center">
                      <div><div className="text-lg font-bold text-gray-900 tabular-nums">{fmt(p.impressions)}</div><div className="text-[9px] uppercase text-gray-500">Impr.</div></div>
                      <div><div className="text-lg font-bold text-gray-900 tabular-nums">{fmt(p.reactions)}</div><div className="text-[9px] uppercase text-gray-500">React.</div></div>
                      <div><div className="text-lg font-bold text-gray-900 tabular-nums">{(p.engagementRate ?? 0).toFixed(1)}%</div><div className="text-[9px] uppercase text-gray-500">Eng.</div></div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-1">All posts · {posts.length}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {posts.map((p, i) => <Card key={p.id} post={p} rank={i + 1} onClick={() => setSelected(p)} />)}
          </div>
        </>
      )}

      {selected && <DetailModal post={selected} pageName={data.page.name} onClose={() => setSelected(null)} />}
    </div>
  );
}

// Renders page 1 of a LinkedIn document post as the card thumbnail — the same
// preview LinkedIn's feed shows. Falls back to the text creative on failure.
function DocThumb({ url, fallback }: { url: string; fallback: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url, disableAutoFetch: true }).promise;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || dead) return;
        const base = page.getViewport({ scale: 1 });
        const scale = 460 / base.width;
        const vp = page.getViewport({ scale });
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        if (!dead) setState("ok");
      } catch {
        if (!dead) setState("err");
      }
    })();
    return () => { dead = true; };
  }, [url]);
  if (state === "err") return <>{fallback}</>;
  return (
    <div className="w-full h-full flex items-start justify-center bg-gray-100 overflow-hidden">
      {state === "loading" && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-400">Loading document…</div>}
      <canvas ref={canvasRef} className="w-full h-auto" />
    </div>
  );
}

// LinkedIn-style document viewer for the detail modal — real pages with ‹ › paging.
function DocViewer({ url, fallback }: { url: string; fallback: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url, disableAutoFetch: true }).promise;
        if (dead) return;
        docRef.current = doc;
        setTotal(doc.numPages);
        setPageNum(1);
        setState("ok");
      } catch {
        if (!dead) setState("err");
      }
    })();
    return () => { dead = true; };
  }, [url]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas || state !== "ok") return;
      try {
        const page = await doc.getPage(pageNum);
        const base = page.getViewport({ scale: 1 });
        const scale = 1280 / base.width;
        const vp = page.getViewport({ scale });
        canvas.width = vp.width;
        canvas.height = vp.height;
        if (dead) return;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      } catch { /* keep previous page */ }
    })();
    return () => { dead = true; };
  }, [pageNum, state]);

  if (state === "err") return <>{fallback}</>;
  return (
    <div className="relative bg-gray-100">
      {state === "loading" && <div className="aspect-square flex items-center justify-center text-sm text-gray-400">Loading document…</div>}
      <canvas ref={canvasRef} className="w-full h-auto" />
      {total > 1 && state === "ok" && (
        <>
          <button
            onClick={() => setPageNum((n) => Math.max(1, n - 1))}
            disabled={pageNum <= 1}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white text-lg disabled:opacity-25 hover:bg-black/70"
            aria-label="Previous page"
          >‹</button>
          <button
            onClick={() => setPageNum((n) => Math.min(total, n + 1))}
            disabled={pageNum >= total}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white text-lg disabled:opacity-25 hover:bg-black/70"
            aria-label="Next page"
          >›</button>
          <span className="absolute bottom-2 right-3 text-[11px] bg-black/60 text-white rounded-full px-2.5 py-1 tabular-nums">
            {pageNum} / {total}
          </span>
        </>
      )}
    </div>
  );
}

// The visual: real thumbnail, or a designed text creative for text-only posts.
function Creative({ post, big }: { post: Post; big?: boolean }) {
  if (post.thumbnailUrl) {
    return <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />;
  }
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-4 text-left"
      style={{ background: `linear-gradient(135deg, ${LI_BLUE} 0%, #084D92 60%, #063D75 100%)` }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{post.type || "POST"}</span>
      <p className={`text-white font-medium leading-snug ${big ? "text-lg line-clamp-6" : "text-[13px] line-clamp-4"}`}>
        {post.text || "(no text)"}
      </p>
      <span className="text-[10px] text-white/60">in</span>
    </div>
  );
}

function Card({ post, rank, onClick }: { post: Post; rank: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-gray-300 hover:shadow-sm text-left transition"
    >
      <div className="relative bg-gray-100 aspect-square overflow-hidden">
        {post.docUrl
          ? <DocThumb url={post.docUrl} fallback={<Creative post={post} />} />
          : <Creative post={post} />}
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-white/90 rounded-full px-2 py-0.5 text-gray-700">#{rank}</span>
        {post.docUrl && <span className="absolute top-2 right-2 text-[10px] font-semibold bg-black/60 text-white rounded-full px-2 py-0.5"><IconFileText size={11} stroke={2} className="inline -mt-0.5 mr-0.5" />Document</span>}
      </div>
      <div className="p-3">
        <div className="text-xs text-gray-800 leading-snug line-clamp-2 min-h-[2.5rem]">{post.text || "(no text)"}</div>
        <div className="text-[10px] text-gray-400 mt-1">{dateLabel(post.date)} · {post.type}</div>
        <div className="text-[11px] text-gray-600 mt-1.5 flex gap-3 tabular-nums">
          <span><IconEye size={12} stroke={1.8} className="inline -mt-0.5 mr-0.5 text-gray-400" />{fmt(post.impressions)}</span>
          <span><IconThumbUp size={12} stroke={1.8} className="inline -mt-0.5 mr-0.5 text-gray-400" />{fmt(post.reactions)}</span>
          <span><IconMessageCircle size={12} stroke={1.8} className="inline -mt-0.5 mr-0.5 text-gray-400" />{fmt(post.comments)}</span>
          <span className="ml-auto">{(post.engagementRate ?? 0).toFixed(1)}%</span>
        </div>
      </div>
    </button>
  );
}

function DetailModal({ post, pageName, onClose }: { post: Post; pageName: string; onClose: () => void }) {
  const metrics = [
    { label: "Impressions", value: fmt(post.impressions) },
    { label: "Unique impressions", value: fmt(post.uniqueImpressions) },
    { label: "Clicks", value: fmt(post.clicks) },
    { label: "Reactions", value: fmt(post.reactions) },
    { label: "Comments", value: fmt(post.comments) },
    { label: "Shares", value: fmt(post.shares) },
    { label: "Engagement rate", value: `${(post.engagementRate ?? 0).toFixed(1)}%` },
    { label: "CTR", value: `${(post.ctr ?? 0).toFixed(1)}%` },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Caption / description on top */}
        <div className="p-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: LI_BLUE }}>
                {pageName} · {dateLabel(post.date)} · {post.type}
              </div>
              <p className="text-[15px] text-gray-900 leading-relaxed whitespace-pre-wrap mt-2">{post.text || "(no text)"}</p>
              {post.mediaTitle && <p className="text-xs text-gray-500 mt-1.5"><IconPaperclip size={12} stroke={1.8} className="inline -mt-0.5 mr-1 text-gray-400" />{post.mediaTitle}</p>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
          </div>
        </div>

        {/* The creative — real document pages when it's a document post */}
        {post.docUrl ? (
          <DocViewer url={post.docUrl} fallback={<div className="aspect-video"><Creative post={post} big /></div>} />
        ) : (
          <div className="aspect-video bg-gray-100">
            <Creative post={post} big />
          </div>
        )}

        {/* Complete metrics at the bottom */}
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{m.label}</div>
                <div className="text-xl font-semibold tabular-nums mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
              style={{ background: LI_BLUE }}
            >
              Open on LinkedIn ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
