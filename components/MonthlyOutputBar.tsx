"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useEffect, useMemo, useState } from "react";

type Post = { id: string; type: string; timestamp: string };
type Story = { posted_at?: string; postedAt?: string; timestamp?: string };

// Same split the weekly cadence uses — kept in step with PostingCadenceBar.
type Kind = "carousel" | "static" | "reel";
function kindOf(type: string): Kind {
  const t = (type || "").toUpperCase();
  if (t === "REEL" || t === "REELS" || t === "VIDEO") return "reel";
  if (t === "CAROUSEL_ALBUM" || t === "CAROUSEL") return "carousel";
  return "static";
}

// Month buckets are drawn in LOCAL time, not UTC. Meta returns timestamps as
// +0000, so slicing "YYYY-MM" off the raw string put anything published after
// 18:30 IST on the last day of a month into the previous month — e.g. a post at
// 2025-12-31T23:50Z is 1 January to the team that published it. The weekly
// cadence already buckets in local time; this keeps the two in step and makes a
// month mean the 1st to the 30th/31st, as the monthly report does.
const monthKey = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key: string) =>
  new Date(key + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

type Row = { key: string; label: string; carousel: number; static: number; reel: number; stories: number | null; total: number; partial: boolean; current: boolean };

// Month-by-month totals of everything published: carousels, static posts, reels
// and stories. The weekly cadence above answers "is the rhythm holding"; this
// answers "what did we actually ship in September".
export function MonthlyOutputBar({ accountId, range, months }: { accountId: string; range: { from: string; to: string }; months?: number }) {
  // A preset range is a ROLLING window — "30 days" runs 23 Aug → 22 Sep and so
  // straddles two calendar months, which made August look like a bad month when
  // only its last nine days were counted. A section headed "Monthly output"
  // should talk in whole calendar months, so `months` says how many to show
  // (30d → 1, 60d → 2, 90d → 3, 1y → 12) and this window starts at the 1st of
  // the earliest of them. Custom ranges pass nothing and keep exact clipping,
  // because there the user picked the dates deliberately.
  const win = useMemo(() => {
    if (!months) return { ...range, fetchFrom: range.from };
    const end = new Date(range.to + "T00:00:00");
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const first = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
    // fetchFrom reaches one day further back than the months we display. The API
    // filters on UTC timestamps, so a post made late on the last day of the
    // previous month UTC is the 1st locally and would otherwise never arrive to
    // be bucketed into it. The extra day is fetched, never shown as its own row.
    const fetchStart = new Date(first);
    fetchStart.setDate(fetchStart.getDate() - 1);
    return { from: ymd(first), to: range.to, fetchFrom: ymd(fetchStart) };
  }, [months, range]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [stories, setStories] = useState<Story[] | null>(null);

  useEffect(() => {
    let alive = true;
    setPosts(null);
    setStories(null);
    const qs = new URLSearchParams({ accountId, from: win.fetchFrom, to: win.to, limit: "500", insights: "false" }).toString();
    fetch(`/api/posts?${qs}`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => { if (alive) setPosts((d.posts || []) as Post[]); })
      .catch(() => { if (alive) setPosts([]); });
    const sqs = new URLSearchParams({ accountId, from: win.fetchFrom, to: win.to, limit: "500" }).toString();
    fetch(`/api/stories/historical?${sqs}`)
      .then((r) => (r.ok ? r.json() : { stories: [] }))
      .then((d) => { if (alive) setStories((d.stories || []) as Story[]); })
      .catch(() => { if (alive) setStories([]); });
    return () => { alive = false; };
  }, [accountId, win.fetchFrom, win.to]);

  const { rows, totals, storiesPartial } = useMemo(() => {
    const empty = { rows: [] as Row[], totals: null as Row | null, storiesPartial: false };
    if (!posts || !stories) return empty;

    // Every calendar month the range touches, so a month with nothing published
    // still shows as a zero rather than silently vanishing from the table.
    const keys: string[] = [];
    const start = new Date(win.from + "T00:00:00");
    const end = new Date(win.to + "T00:00:00");
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const storyMonths = stories
      .map((s) => monthKey(String(s.posted_at || s.postedAt || s.timestamp || "")))
      .filter(Boolean)
      .sort();
    // Story snapshots only started part-way through the account's history. A month
    // earlier than the first one we hold has no story data at all, which is not the
    // same as "no stories were posted" — show a dash there, never a 0.
    const firstStoryMonth = storyMonths[0];

    const byMonth = new Map<string, Row>();
    for (const k of keys) {
      // A month the range only clips into (a 60-day window starts mid-month) must
      // not read as a full month's output.
      const mStart = k + "-01";
      const mEnd = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).toISOString().slice(0, 10);
      byMonth.set(k, {
        key: k,
        label: monthLabel(k),
        carousel: 0, static: 0, reel: 0,
        stories: firstStoryMonth && k < firstStoryMonth ? null : 0,
        total: 0,
        // The month in progress is "so far", not clipped — it just hasn't ended.
        current: k === win.to.slice(0, 7),
        partial: win.from > mStart || win.to < mEnd,
      });
    }
    for (const p of posts) {
      const row = byMonth.get(monthKey(p.timestamp));
      if (!row) continue;
      row[kindOf(p.type)] += 1;
      row.total += 1;
    }
    for (const k of storyMonths) {
      const row = byMonth.get(k);
      if (row && row.stories !== null) row.stories += 1;
    }

    const built = keys.map((k) => byMonth.get(k)!).reverse(); // newest month first
    const sum: Row = {
      current: false,
      partial: built.some((r) => r.partial && !r.current),
      key: "total",
      label: `All ${built.length} month${built.length === 1 ? "" : "s"}`,
      carousel: built.reduce((s, r) => s + r.carousel, 0),
      static: built.reduce((s, r) => s + r.static, 0),
      reel: built.reduce((s, r) => s + r.reel, 0),
      stories: built.some((r) => r.stories !== null) ? built.reduce((s, r) => s + (r.stories ?? 0), 0) : null,
      total: built.reduce((s, r) => s + r.total, 0),
    };
    return { rows: built, totals: sum, storiesPartial: built.some((r) => r.stories === null) };
  }, [posts, stories, win.from, win.to]);

  const loading = !posts || !stories;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-gray-900">Monthly output</h2>
        <div className="text-[12px] text-gray-500 mt-0.5">Everything you published each month, by format.</div>
      </div>

      {loading ? (
        <div className="h-[160px] flex items-center justify-center"><LoadingBlock /></div>
      ) : rows.length === 0 ? (
        <div className="text-[13px] text-gray-500 py-6 text-center">Nothing published in this range.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-widest text-gray-500">
                  <th className="text-left font-semibold pb-2">Month</th>
                  <th className="text-right font-semibold pb-2">Carousels</th>
                  <th className="text-right font-semibold pb-2">Static posts</th>
                  <th className="text-right font-semibold pb-2">Reels</th>
                  <th className="text-right font-semibold pb-2">Stories</th>
                  <th className="text-right font-semibold pb-2">Feed total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-gray-100">
                    <td className="py-2.5 text-gray-900 font-medium">
                      {r.label}
                      {r.current
                        ? <span className="ml-1.5 text-[10.5px] font-normal text-gray-400">so far</span>
                        : r.partial && <span className="ml-1.5 text-[10.5px] font-normal text-gray-400">part month</span>}
                    </td>
                    <Cell n={r.carousel} tone="text-brand" />
                    <Cell n={r.static} tone="text-amber-700" />
                    <Cell n={r.reel} tone="text-violet-700" />
                    <Cell n={r.stories} tone="text-teal-700" />
                    <td className="py-2.5 text-right tabular-nums font-semibold text-gray-900">{r.total}</td>
                  </tr>
                ))}
                {totals && rows.length > 1 && (
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-2.5 text-gray-900 font-semibold">{totals.label}</td>
                    <Cell n={totals.carousel} tone="text-brand" bold />
                    <Cell n={totals.static} tone="text-amber-700" bold />
                    <Cell n={totals.reel} tone="text-violet-700" bold />
                    <Cell n={totals.stories} tone="text-teal-700" bold />
                    <td className="py-2.5 text-right tabular-nums font-semibold text-gray-900">{totals.total}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-[11.5px] text-gray-500 mt-3 space-y-1">
            <div>Feed total counts carousels, static posts and reels. Stories are counted apart because they expire after 24 hours.</div>
            {rows.some((r) => r.partial && !r.current) && <div>A month marked <b className="font-medium">part month</b> is only covered in part by the selected range.</div>}
            {storiesPartial && <div>A dash means stories weren&rsquo;t being recorded yet that month — not that none were posted.</div>}
          </div>
        </>
      )}
    </section>
  );
}

function Cell({ n, tone, bold }: { n: number | null; tone: string; bold?: boolean }) {
  if (n === null) return <td className="py-2.5 text-right text-gray-300 tabular-nums">—</td>;
  return (
    <td className={`py-2.5 text-right tabular-nums ${bold ? "font-semibold" : "font-medium"} ${n === 0 ? "text-gray-300" : tone}`}>{n}</td>
  );
}
