"use client";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";

type EffectiveStatus = "scheduled" | "publishing" | "published" | "failed" | "draft" | "unknown";

type ScheduledPost = {
  id: string;
  particulars: string;
  publishToPage: string;
  caption: string;
  scheduleTime: string | null;
  status: string;
  effectiveStatus: EffectiveStatus;
  failureReason: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  publishedAt: string | null;
};

const STATUS_STYLE: Record<EffectiveStatus, { bg: string; text: string; dot: string; label: string }> = {
  scheduled:  { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500",  label: "Scheduled" },
  publishing: { bg: "bg-amber-50",   text: "text-amber-800",   dot: "bg-amber-500",   label: "Publishing" },
  published:  { bg: "bg-green-50",   text: "text-green-700",   dot: "bg-green-500",   label: "Published" },
  failed:     { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500",     label: "Failed" },
  draft:      { bg: "bg-gray-50",    text: "text-gray-600",    dot: "bg-gray-400",    label: "Draft" },
  unknown:    { bg: "bg-gray-50",    text: "text-gray-500",    dot: "bg-gray-300",    label: "Unknown" },
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  return (
    <DashboardShell title="Content Calendar" subtitle="Every scheduled / publishing / published / failed post across all 4 brands. Click any dot to inspect.">
      {() => <Calendar />}
    </DashboardShell>
  );
}

function Calendar() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<ScheduledPost | null>(null);
  const [statusFilter, setStatusFilter] = useState<EffectiveStatus | "all">("all");

  const load = () => {
    setLoading(true);
    const t0 = Date.now();
    fetch("/api/scheduler/queue")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { posts?: ScheduledPost[] }) => {
        setPosts(d.posts || []);
        setFetchedAt(Date.now());
        setLatencyMs(Date.now() - t0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Filter + bucket by date
  const filteredPosts = useMemo(
    () => statusFilter === "all" ? posts : posts.filter((p) => p.effectiveStatus === statusFilter),
    [posts, statusFilter],
  );
  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of filteredPosts) {
      const ts = p.publishedAt || p.scheduleTime;
      if (!ts) continue;
      const key = ymd(new Date(ts));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [filteredPosts]);

  // Build the calendar grid (always 6 rows × 7 cols = 42 cells, starting from first Sun on/before the 1st)
  const grid = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - firstOfMonth.getDay()); // back to Sunday
    const cells: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
    const today = ymd(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({
        date: d,
        inMonth: d.getMonth() === cursor.getMonth(),
        isToday: ymd(d) === today,
      });
    }
    return cells;
  }, [cursor]);

  // Counts for status filter chips
  const counts = useMemo(() => {
    const c: Record<EffectiveStatus, number> = { scheduled: 0, publishing: 0, published: 0, failed: 0, draft: 0, unknown: 0 };
    for (const p of posts) c[p.effectiveStatus] = (c[p.effectiveStatus] || 0) + 1;
    return c;
  }, [posts]);

  const prevMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d); };
  const nextMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d); };
  const jumpToday = () => { const d = new Date(); d.setDate(1); setCursor(d); };

  return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={load} />

      {/* Header controls: month nav + status filter chips */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">‹</button>
          <div className="text-lg font-semibold text-gray-900 min-w-[180px] text-center">
            {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
          </div>
          <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">›</button>
          <button onClick={jumpToday} className="text-xs font-medium ml-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Today</button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`All (${posts.length})`} />
          {(["scheduled", "publishing", "published", "failed"] as EffectiveStatus[]).map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              label={`${STATUS_STYLE[s].label} (${counts[s]})`}
              dotColor={STATUS_STYLE[s].dot}
            />
          ))}
        </div>
      </div>

      {/* Failed-post quick panel — only shows when there ARE failures */}
      {counts.failed > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-red-900">⚠ {counts.failed} {counts.failed === 1 ? "post" : "posts"} need attention</div>
            <button onClick={() => setStatusFilter("failed")} className="text-xs text-red-700 hover:underline">Show only failures →</button>
          </div>
          <div className="text-xs text-red-700">Stuck posts won&apos;t self-recover. Click a red dot below → Retry to bump it back into the n8n queue.</div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_LABELS.map((d) => (
            <div key={d} className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-400 font-medium">{d}</div>
          ))}
        </div>
        {/* Date grid */}
        <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(110px, 1fr)" }}>
          {grid.map((cell, i) => {
            const key = ymd(cell.date);
            const dayPosts = postsByDate.get(key) || [];
            return (
              <div
                key={i}
                className={`p-2 border-r border-b border-gray-100 ${!cell.inMonth ? "bg-gray-50/50" : "bg-white"} ${i % 7 === 6 ? "border-r-0" : ""}`}
              >
                <div className={`text-xs mb-1.5 ${cell.isToday ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white font-semibold" : cell.inMonth ? "text-gray-700 font-medium" : "text-gray-300"}`}>
                  {cell.date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayPosts.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={`w-full text-left rounded-md px-2 py-1 text-[10px] font-medium truncate transition hover:ring-1 hover:ring-gray-300 ${STATUS_STYLE[p.effectiveStatus].bg} ${STATUS_STYLE[p.effectiveStatus].text}`}
                      title={`${p.particulars} — ${p.publishToPage}`}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${STATUS_STYLE[p.effectiveStatus].dot}`} />
                      {p.particulars || "(no title)"}
                    </button>
                  ))}
                  {dayPosts.length > 3 && (
                    <button
                      onClick={() => setSelected(dayPosts[0])}
                      className="text-[10px] text-gray-500 hover:text-gray-900 px-2"
                    >
                      + {dayPosts.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footnote */}
      <div className="mt-3 text-[11px] text-gray-400">
        Showing all 100 most recent rows from Post Scheduler. Posts plot on their <strong>Published At</strong> if published, else <strong>Schedule Time</strong>.
        {" "}Empty days = no posts; out-of-month days greyed.
      </div>

      {/* Detail modal */}
      {selected && <DetailModal post={selected} onClose={() => setSelected(null)} onRetried={() => { setSelected(null); load(); }} />}
    </>
  );
}

function FilterChip({ active, onClick, label, dotColor }: { active: boolean; onClick: () => void; label: string; dotColor?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition ${
        active ? "border-brand bg-brand-light text-brand font-medium" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      }`}
    >
      {dotColor && <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />}
      {label}
    </button>
  );
}

function DetailModal({ post, onClose, onRetried }: { post: ScheduledPost; onClose: () => void; onRetried: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style = STATUS_STYLE[post.effectiveStatus];

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const r = await fetch("/api/scheduler/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: post.id }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || `HTTP ${r.status}`); }
      else { onRetried(); }
    } catch (e) {
      setError((e as Error).message);
    } finally { setRetrying(false); }
  }

  const whenLabel = post.publishedAt
    ? `Published ${new Date(post.publishedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
    : post.scheduleTime
    ? `Scheduled for ${new Date(post.scheduleTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
    : "No schedule";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className={`px-5 py-4 ${style.bg} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${style.dot}`} />
            <span className={`text-xs uppercase tracking-wide font-semibold ${style.text}`}>{style.label}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Title</div>
            <div className="text-base font-semibold text-gray-900">{post.particulars || "(no title)"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Brand</div>
            <div className="text-sm text-gray-700">{post.publishToPage}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Time</div>
            <div className="text-sm text-gray-700">{whenLabel}</div>
          </div>
          {post.caption && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Caption preview</div>
              <div className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap line-clamp-6">{post.caption}</div>
            </div>
          )}

          {post.effectiveStatus === "failed" && post.failureReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-red-900 mb-1">Why it failed</div>
              <div className="text-xs text-red-700">{post.failureReason}</div>
              <button
                onClick={retry}
                disabled={retrying}
                className="mt-3 text-xs font-medium bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "↻ Retry — bump back into n8n queue"}
              </button>
              {error && <div className="text-xs text-red-700 mt-2">{error}</div>}
            </div>
          )}

          {(post.instagramUrl || post.facebookUrl) && (
            <div className="flex gap-3 text-xs pt-2 border-t border-gray-100">
              {post.instagramUrl && <a href={post.instagramUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">View on Instagram ↗</a>}
              {post.facebookUrl && <a href={post.facebookUrl.split("\n")[0]} target="_blank" rel="noreferrer" className="text-brand hover:underline">View on Facebook ↗</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
