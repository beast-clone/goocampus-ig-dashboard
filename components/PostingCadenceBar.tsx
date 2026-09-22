"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useEffect, useMemo, useState } from "react";

type Post = {
  id: string;
  type: string;
  timestamp: string;
};

// Reels and plain videos are VIDEOS; images and carousels are POSTS. The team
// tracks the two separately because they cost completely different effort, so
// they are never added into a single "posts" number (Manya, comments 22 Sep).
function isVideo(type: string): boolean {
  const t = (type || "").toUpperCase();
  return t === "REEL" || t === "REELS" || t === "VIDEO";
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Compact "posts per week" view. One row per week, one horizontal bar per week
// showing how many posts you published. A summary strip on top with three
// clearly labelled numbers so a new reader gets the whole story in 3 seconds.
export function PostingCadenceBar({ accountId, range, smartCadence }: { accountId: string; range: { from: string; to: string }; smartCadence?: boolean }) {
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

  const { weeks, totalPosts, totalStatic, totalVideos, activeDays, silentDays, cmp } = useMemo(() => {
    const empty = { weeks: [] as { label: string; count: number; posts: number; videos: number; days: number }[], totalPosts: 0, totalStatic: 0, totalVideos: 0, activeDays: 0, silentDays: 0, cmp: null as null | { curr: number; prev: number; deltaPct: number; mode: string; days: number; label: string } };
    if (!posts) return empty;
    const from = new Date(range.from);
    const to = new Date(range.to);
    const dayMap = new Map<string, { posts: number; videos: number }>();
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      dayMap.set(ymd(d), { posts: 0, videos: 0 });
    }
    for (const p of posts) {
      const key = ymd(new Date(p.timestamp));
      const cell = dayMap.get(key);
      if (!cell) continue;
      if (isVideo(p.type)) cell.videos += 1; else cell.posts += 1;
    }

    // Group into weeks. Label each with a "Jun 4 – 10" date range so it reads
    // like a calendar, not a jargon-y "Week of…" string.
    const days = Array.from(dayMap.entries()).map(([date, v]) => ({ date, posts: v.posts, videos: v.videos, count: v.posts + v.videos }));
    const weeks: { label: string; count: number; posts: number; videos: number; days: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const start = new Date(chunk[0].date);
      const end = new Date(chunk[chunk.length - 1].date);
      const startLabel = start.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const endDay = end.toLocaleDateString("en-IN", { day: "numeric" });
      const endMonth = end.toLocaleDateString("en-IN", { month: "short" });
      // If same month, just show day; else include month for the end date too.
      const label = start.getMonth() === end.getMonth() ? `${startLabel} – ${endDay}` : `${startLabel} – ${endDay} ${endMonth}`;
      weeks.push({
        label,
        count: chunk.reduce((s, d) => s + d.count, 0),
        posts: chunk.reduce((s, d) => s + d.posts, 0),
        videos: chunk.reduce((s, d) => s + d.videos, 0),
        days: chunk.length,
      });
    }

    const totalPosts = days.reduce((s, d) => s + d.count, 0);
    const totalStatic = days.reduce((s, d) => s + d.posts, 0);
    const totalVideos = days.reduce((s, d) => s + d.videos, 0);
    const activeDays = days.filter((d) => d.count > 0).length;
    const silentDays = days.length - activeDays;

    // "This week vs last" — but never flag a slowdown on an IN-PROGRESS final week.
    // In smart mode, if the last bucket is a partial week, compare the last two
    // COMPLETE weeks instead (or, if there aren't two, say the week's in progress).
    const lastWeek = weeks[weeks.length - 1];
    const partial = !!smartCadence && !!lastWeek && lastWeek.days < 7;
    let curr: number, prev: number, mode: string, label: string;
    const dcount = lastWeek?.days ?? 0;
    if (partial) {
      const complete = weeks.filter((w) => w.days === 7);
      if (complete.length >= 2) {
        curr = complete[complete.length - 1].count; prev = complete[complete.length - 2].count; mode = "complete"; label = "pieces · last full week vs the one before";
      } else {
        curr = lastWeek!.count; prev = 0; mode = "inprogress"; label = "";
      }
    } else {
      curr = weeks[weeks.length - 1]?.count ?? 0; prev = weeks[weeks.length - 2]?.count ?? 0; mode = "normal"; label = "pieces this week vs last";
    }
    const deltaPct = prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    return { weeks, totalPosts, totalStatic, totalVideos, activeDays, silentDays, cmp: { curr, prev, deltaPct, mode, days: dcount, label } };
  }, [posts, range.from, range.to, smartCadence]);

  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Posting cadence</h2>
          <div className="text-[12px] text-gray-500 mt-0.5">Posts and videos you published each week, counted separately.</div>
        </div>
      </div>

      {loading ? (
        <div className="h-[180px] flex items-center justify-center"><LoadingBlock /></div>
      ) : (
        <div className="space-y-4">
          {/* Row 1 — one box per week, always on a single line regardless of count */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((w, i) => {
              const isLast = i === weeks.length - 1;
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-3 ${isLast ? "border-brand bg-brand-light/30" : "border-gray-200 bg-white"}`}
                >
                  <div className="text-[10.5px] uppercase tracking-widest font-semibold text-gray-500 mb-2">
                    {w.label}
                  </div>
                  <div className="flex items-baseline gap-3 mb-2">
                    <div>
                      <div className={`text-[26px] font-semibold leading-none tabular-nums tracking-tight ${isLast ? "text-brand" : "text-gray-900"}`}>
                        {w.posts}
                      </div>
                      <div className="text-[10.5px] text-gray-500 mt-0.5">{w.posts === 1 ? "post" : "posts"}</div>
                    </div>
                    <div className="w-px self-stretch bg-gray-200" />
                    <div>
                      <div className="text-[26px] font-semibold leading-none tabular-nums tracking-tight text-violet-700">
                        {w.videos}
                      </div>
                      <div className="text-[10.5px] text-gray-500 mt-0.5">{w.videos === 1 ? "video" : "videos"}</div>
                    </div>
                  </div>
                  {/* Split bar — the two kinds sit side by side and are never merged
                      into one length, so a heavy video week can't read as a heavy
                      posting week. */}
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full ${isLast ? "bg-brand" : "bg-brand/50"}`}
                      style={{ width: `${(w.posts / (maxWeek || 1)) * 100}%` }}
                    />
                    <div
                      className={`h-full ${isLast ? "bg-violet-600" : "bg-violet-400"}`}
                      style={{ width: `${(w.videos / (maxWeek || 1)) * 100}%` }}
                    />
                  </div>
                  {isLast && (
                    <div className="text-[10px] text-brand font-medium uppercase tracking-widest mt-2">
                      {smartCadence && w.days < 7 ? "This week · so far" : "This week"}
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
                  big={`${totalStatic} + ${totalVideos}`}
                  text={
                    <>
                      post{totalStatic === 1 ? "" : "s"} and video{totalVideos === 1 ? "" : "s"} across {weeks.length} week{weeks.length === 1 ? "" : "s"}.
                      <span className="block text-gray-500 mt-1">
                        That&rsquo;s <b className="tabular-nums text-gray-700">{(totalStatic / (weeks.length || 1)).toFixed(1)}</b> posts and{" "}
                        <b className="tabular-nums text-violet-700">{(totalVideos / (weeks.length || 1)).toFixed(1)}</b> videos per week
                        (<b className="tabular-nums text-gray-700">{perWeek}</b> pieces in all).
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
            {cmp && cmp.mode === "inprogress" ? (
              <Sentence
                big={`${cmp.curr}`}
                text={<>piece{cmp.curr === 1 ? "" : "s"} published so far this week — <b className="text-gray-700 tabular-nums">{cmp.days} day{cmp.days === 1 ? "" : "s"} in</b>.<span className="block text-gray-500 mt-1">Too early to call a trend — check back once the week fills out.</span></>}
                tone="flat"
              />
            ) : (
              <Sentence
                big={`${cmp?.curr ?? 0} vs ${cmp?.prev ?? 0}`}
                text={
                  (cmp?.curr ?? 0) === (cmp?.prev ?? 0)
                    ? <>{cmp?.label} — <b className="text-gray-700">same rhythm</b>.<span className="block text-gray-500 mt-1">Consistency is holding.</span></>
                    : (cmp?.curr ?? 0) > (cmp?.prev ?? 0)
                      ? <>{cmp?.label} — <b className="text-emerald-800 tabular-nums">{cmp?.deltaPct}% more</b>.<span className="block text-emerald-800/80 mt-1">Cadence is picking up. Keep this pace and next month&rsquo;s reach should follow.</span></>
                      : <>{cmp?.label} — <b className="text-rose-800 tabular-nums">{Math.abs(cmp?.deltaPct ?? 0)}% less</b>.<span className="block text-rose-800/80 mt-1">Slowdown detected. Reach usually drops within a week of a cadence dip — schedule 2–3 posts to catch up.</span></>
                }
                tone={(cmp?.deltaPct ?? 0) < -10 ? "warn" : (cmp?.deltaPct ?? 0) > 10 ? "good" : "flat"}
              />
            )}
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
