"use client";
import { useEffect, useMemo, useState } from "react";

type Post = {
  id: string;
  type: string;
  timestamp: string;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Compact "posts per week" view. One row per week, one horizontal bar per week
// showing how many posts you published. A summary strip on top with three
// clearly labelled numbers so a new reader gets the whole story in 3 seconds.
export function PostingCadenceBar({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ accountId, from: range.from, to: range.to, limit: "500", insights: "false" }).toString();
    fetch(`/api/posts?${qs}`)
      .then((r) => r.ok ? r.json() : { posts: [] })
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [accountId, range.from, range.to]);

  const { weeks, totalPosts, activeDays, silentDays, deltaPct, lastCount, prevCount } = useMemo(() => {
    if (!posts) return { weeks: [], totalPosts: 0, activeDays: 0, silentDays: 0, deltaPct: 0, lastCount: 0, prevCount: 0 };
    const from = new Date(range.from);
    const to = new Date(range.to);
    const dayMap = new Map<string, number>();
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      dayMap.set(ymd(d), 0);
    }
    for (const p of posts) {
      const key = ymd(new Date(p.timestamp));
      if (dayMap.has(key)) dayMap.set(key, dayMap.get(key)! + 1);
    }

    // Group into weeks. Label each with a "Jun 4 – 10" date range so it reads
    // like a calendar, not a jargon-y "Week of…" string.
    const days = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
    const weeks: { label: string; count: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const start = new Date(chunk[0].date);
      const end = new Date(chunk[chunk.length - 1].date);
      const startLabel = start.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const endDay = end.toLocaleDateString("en-IN", { day: "numeric" });
      const endMonth = end.toLocaleDateString("en-IN", { month: "short" });
      // If same month, just show day; else include month for the end date too.
      const label = start.getMonth() === end.getMonth() ? `${startLabel} – ${endDay}` : `${startLabel} – ${endDay} ${endMonth}`;
      weeks.push({ label, count: chunk.reduce((s, d) => s + d.count, 0) });
    }

    const totalPosts = days.reduce((s, d) => s + d.count, 0);
    const activeDays = days.filter((d) => d.count > 0).length;
    const silentDays = days.length - activeDays;

    // Last week vs the week before — both raw counts, not just delta.
    const lastCount = weeks[weeks.length - 1]?.count ?? 0;
    const prevCount = weeks[weeks.length - 2]?.count ?? 0;
    const deltaPct = prevCount === 0 ? (lastCount > 0 ? 100 : 0) : Math.round(((lastCount - prevCount) / prevCount) * 100);

    return { weeks, totalPosts, activeDays, silentDays, deltaPct, lastCount, prevCount };
  }, [posts, range.from, range.to]);

  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Posting cadence</h2>
          <div className="text-[12px] text-gray-500 mt-0.5">How many posts you published each week.</div>
        </div>
      </div>

      {loading ? (
        <div className="h-[180px] bg-gray-50 rounded animate-pulse" />
      ) : (
        <div className="space-y-4">
          {/* Row 1 — one box per week, always on a single line regardless of count */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((w, i) => {
              const isLast = i === weeks.length - 1;
              const heat = w.count === 0 ? 0 : Math.min(1, w.count / (maxWeek || 1));
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-3 ${isLast ? "border-brand bg-brand-light/30" : "border-gray-200 bg-white"}`}
                >
                  <div className="text-[10.5px] uppercase tracking-widest font-semibold text-gray-500 mb-2">
                    {w.label}
                  </div>
                  <div className="flex items-baseline gap-1.5 mb-2">
                    <div className={`text-[26px] font-semibold leading-none tabular-nums tracking-tight ${isLast ? "text-brand" : "text-gray-900"}`}>
                      {w.count}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {w.count === 1 ? "post" : "posts"}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isLast ? "bg-brand" : "bg-brand/50"}`}
                      style={{ width: `${Math.max(heat * 100, w.count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                  {isLast && (
                    <div className="text-[10px] text-brand font-medium uppercase tracking-widest mt-2">
                      This week
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Row 2 — three summary sentences, each with context + a next-step nudge */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(() => {
              const perWeek = weeks.length > 0 ? (totalPosts / weeks.length).toFixed(1) : "0";
              return (
                <Sentence
                  big={String(totalPosts)}
                  text={
                    <>
                      total post{totalPosts === 1 ? "" : "s"} published across {weeks.length} week{weeks.length === 1 ? "" : "s"}.
                      <span className="block text-gray-500 mt-1">
                        That&rsquo;s an average of <b className="tabular-nums text-gray-700">{perWeek}</b> posts per week.
                        {totalPosts > 0 && ` Your best week hit ${Math.max(...weeks.map(w => w.count))}.`}
                      </span>
                    </>
                  }
                />
              );
            })()}
            {(() => {
              const totalDays = activeDays + silentDays;
              const pct = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;
              return (
                <Sentence
                  big={`${activeDays} of ${totalDays}`}
                  text={
                    <>
                      days you posted — <b className="tabular-nums text-gray-700">{pct}%</b> of the range.
                      <span className="block text-gray-500 mt-1">
                        {silentDays === 0
                          ? "No silent days — very steady rhythm."
                          : silentDays <= 3
                            ? `Only ${silentDays} silent day${silentDays === 1 ? "" : "s"} — near-daily posting.`
                            : `You had ${silentDays} silent days. Filling a few with reposts could add reach for free.`}
                      </span>
                    </>
                  }
                />
              );
            })()}
            <Sentence
              big={`${lastCount} vs ${prevCount}`}
              text={
                lastCount === prevCount
                  ? <>posts this week vs last — <b className="text-gray-700">same rhythm</b>.<span className="block text-gray-500 mt-1">Consistency is holding.</span></>
                  : lastCount > prevCount
                    ? <>posts this week vs last — <b className="text-emerald-800 tabular-nums">{deltaPct}% more</b>.<span className="block text-emerald-800/80 mt-1">Cadence is picking up. Keep this pace and next month&rsquo;s reach should follow.</span></>
                    : <>posts this week vs last — <b className="text-rose-800 tabular-nums">{Math.abs(deltaPct)}% less</b>.<span className="block text-rose-800/80 mt-1">Slowdown detected. Reach usually drops within a week of a cadence dip — schedule 2–3 posts to catch up.</span></>
              }
              tone={deltaPct < -10 ? "warn" : deltaPct > 10 ? "good" : "flat"}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function Sentence({ big, text, tone = "flat" }: { big: string; text: React.ReactNode; tone?: "warn" | "good" | "flat" }) {
  const bg = tone === "warn" ? "bg-rose-50" : tone === "good" ? "bg-emerald-50" : "bg-gray-50";
  const bigColor = tone === "warn" ? "text-rose-800" : tone === "good" ? "text-emerald-800" : "text-gray-900";
  const textColor = tone === "warn" ? "text-rose-800" : tone === "good" ? "text-emerald-800" : "text-gray-700";
  return (
    <div className={`${bg} rounded-lg px-3.5 py-3 text-[12.5px] ${textColor} leading-snug`}>
      <span className={`text-[20px] font-semibold tabular-nums tracking-tight mr-1.5 ${bigColor}`}>{big}</span>
      <span>{text}</span>
    </div>
  );
}
