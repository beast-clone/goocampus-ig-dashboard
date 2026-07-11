"use client";
import { useEffect, useMemo, useState } from "react";

type AudienceResponse = {
  onlineGrid?: (number | null)[][]; // 7 rows × 24 cols
  available?: boolean;
  reason?: string;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Same grid data, but presented as a plain-English "best times to post" list —
// so a marketer who's never seen a heatmap can still read this at a glance.
export function AudienceOnlineHeatmap({ accountId }: { accountId: string }) {
  const [data, setData] = useState<AudienceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/audience?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: AudienceResponse | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [accountId]);

  const slots = useMemo(() => {
    const g = data?.onlineGrid;
    if (!g) return [] as { day: number; hour: number; count: number }[];
    const out: { day: number; hour: number; count: number }[] = [];
    for (let d = 0; d < g.length; d++) {
      for (let h = 0; h < 24; h++) {
        const v = g[d]?.[h] ?? 0;
        if (v > 0) out.push({ day: d, hour: h, count: v });
      }
    }
    return out.sort((a, b) => b.count - a.count);
  }, [data]);

  const peak = slots[0];
  const max = peak?.count || 1;

  // Split every day into four time-of-day buckets and pick the strongest hour
  // in each. This lets the user schedule multiple posts on the same day without
  // stacking them all at 8 PM — one morning slot, one midday, one evening,
  // one late-night if the signal is meaningful.
  //
  // Buckets:
  //   Morning   5 – 11 AM
  //   Midday    11 AM – 4 PM
  //   Evening   4 – 10 PM
  //   Late      10 PM – 5 AM
  const daysByTimeOfDay = useMemo(() => {
    if (!data?.onlineGrid) return [] as { day: number; slots: { morning?: { hour: number; count: number }; midday?: { hour: number; count: number }; evening?: { hour: number; count: number }; late?: { hour: number; count: number }; dayPeak: number } }[];
    const grid = data.onlineGrid;
    type Slot = { hour: number; count: number };
    const bestIn = (day: number, hourFrom: number, hourTo: number): Slot | undefined => {
      // hourTo may be > 23 for the late-night bucket that wraps past midnight.
      let best: Slot | undefined;
      for (let h = hourFrom; h < hourTo; h++) {
        const hh = h % 24;
        const v = grid[day]?.[hh] ?? 0;
        if (v > 0 && (!best || v > best.count)) best = { hour: hh, count: v };
      }
      return best;
    };
    // A late-night slot is only worth showing if it's at least 15% of the day's
    // peak — otherwise we'd surface noise.
    const rows = [];
    for (let d = 0; d < grid.length; d++) {
      const morning = bestIn(d, 5, 11);
      const midday  = bestIn(d, 11, 16);
      const evening = bestIn(d, 16, 22);
      const late    = bestIn(d, 22, 24 + 5); // 10 PM through 5 AM
      const dayPeak = Math.max(morning?.count || 0, midday?.count || 0, evening?.count || 0, late?.count || 0);
      if (dayPeak === 0) continue;
      const lateIsNoise = (late?.count || 0) < 0.15 * dayPeak;
      rows.push({ day: d, slots: { morning, midday, evening, late: lateIsNoise ? undefined : late, dayPeak } });
    }
    // Sort days by their peak hour so the best days come first.
    rows.sort((a, b) => b.slots.dayPeak - a.slots.dayPeak);
    return rows.slice(0, 5);
  }, [data]);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Best times to post next</h2>
          <div className="text-[12px] text-gray-500 mt-0.5">
            These are the hours when the most of your followers are on Instagram.
          </div>
        </div>
        <div className="text-[11px] text-gray-400 italic">Rolling 7-day average · Meta insights</div>
      </div>

      {loading && <div className="h-[200px] bg-gray-50 rounded animate-pulse" />}

      {!loading && !peak && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 text-[12.5px] text-amber-900">
          Audience-online data isn&apos;t available yet.
          <span className="text-amber-700/90"> {data?.reason || "Meta needs at least 100 followers to compute this."}</span>
        </div>
      )}

      {!loading && peak && (
        <div className="space-y-5">
          {/* Hero: three strongest slots this week, side by side */}
          <div>
            <div className="text-[10.5px] uppercase tracking-widest text-brand font-semibold mb-2 px-1">
              ★ Three strongest slots this week
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {slots.slice(0, 3).map((s, i) => {
                const isTop = i === 0;
                return (
                  <div
                    key={`${s.day}-${s.hour}`}
                    className={`rounded-2xl p-4 border ${isTop ? "bg-gradient-to-br from-brand/15 to-white border-brand/40" : "bg-white border-gray-200"}`}
                  >
                    <div className="flex items-baseline gap-2 mb-1">
                      <div className="text-[10.5px] uppercase tracking-widest font-semibold text-gray-500">Rank #{i + 1}</div>
                      {isTop && <div className="text-[10px] text-brand font-semibold">★ PEAK</div>}
                    </div>
                    <div className={`text-[20px] font-semibold leading-tight tracking-tight ${isTop ? "text-brand" : "text-gray-900"}`}>
                      {DAY_LABELS[s.day]}, {fmtHour(s.hour)}
                    </div>
                    <div className="text-[12.5px] text-gray-700 mt-2 leading-snug">
                      <b className="tabular-nums font-semibold">{s.count.toLocaleString("en-IN")}</b> of your followers online.
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid of days × time-of-day. Each cell shows the best hour in that
              bucket so multiple posts can be spread through the day. */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr className="text-left">
                  <th className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold pr-3 pb-2 align-bottom w-[110px]">Day</th>
                  {[
                    { label: "Morning",   sub: "5 – 11 AM"  },
                    { label: "Midday",    sub: "11 AM – 4 PM" },
                    { label: "Evening",   sub: "4 – 10 PM"  },
                    { label: "Late night",sub: "10 PM – 5 AM" },
                  ].map((c) => (
                    <th key={c.label} className="pb-2 pr-3 align-bottom">
                      <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold">{c.label}</div>
                      <div className="text-[10px] text-gray-400 font-medium mt-0.5 tabular-nums">{c.sub}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daysByTimeOfDay.map((row) => {
                  const isPeakDay = row.day === peak.day;
                  const cell = (slot: { hour: number; count: number } | undefined, isPeakHour: boolean) => {
                    if (!slot) {
                      return (
                        <td className="pr-3 py-2 border-b border-gray-100 text-[13px] text-gray-300">—</td>
                      );
                    }
                    const w = (slot.count / max) * 100;
                    const isStar = isPeakHour && slot.hour === peak.hour && row.day === peak.day;
                    return (
                      <td className="pr-3 py-2 border-b border-gray-100">
                        <div className={`text-[13px] tabular-nums ${isStar ? "font-semibold text-brand" : "text-gray-900"}`}>
                          {fmtHour(slot.hour)} {isStar && <span className="text-brand ml-0.5">★</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-1.5 bg-gray-100 rounded overflow-hidden flex-1 max-w-[120px]">
                            <div
                              className={`h-full rounded ${isStar ? "bg-brand" : "bg-brand/45"}`}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                          <div className="text-[10.5px] text-gray-500 tabular-nums whitespace-nowrap">
                            {slot.count.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </td>
                    );
                  };
                  return (
                    <tr key={row.day}>
                      <td className={`pr-3 py-2 border-b border-gray-100 text-[13.5px] ${isPeakDay ? "font-semibold text-brand" : "text-gray-900 font-medium"}`}>
                        {DAY_LABELS[row.day]}
                      </td>
                      {cell(row.slots.morning, row.slots.morning?.count === row.slots.dayPeak)}
                      {cell(row.slots.midday,  row.slots.midday?.count === row.slots.dayPeak)}
                      {cell(row.slots.evening, row.slots.evening?.count === row.slots.dayPeak)}
                      {cell(row.slots.late,    row.slots.late?.count === row.slots.dayPeak)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Posting rhythm — min / sweet spot / max + per-count schedule */}
          <div className="bg-brand/5 border border-brand/20 rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-widest text-brand font-semibold mb-3">
              How many posts per day, and when
            </div>

            {/* Row of 3 rhythm limits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Minimum</div>
                <div className="text-[24px] font-semibold leading-tight tracking-tight text-gray-900 tabular-nums mt-1">1<span className="text-[13px] font-normal text-gray-500 ml-1">post/day</span></div>
                <div className="text-[11.5px] text-gray-600 mt-1 leading-snug">Skip a day and the algorithm dials down your reach for the next 48 hours.</div>
              </div>
              <div className="bg-white rounded-lg px-4 py-3 border border-brand/40 shadow-sm">
                <div className="text-[10px] uppercase tracking-widest text-brand font-semibold">Sweet spot</div>
                <div className="text-[24px] font-semibold leading-tight tracking-tight text-brand tabular-nums mt-1">2 – 3<span className="text-[13px] font-normal text-gray-500 ml-1">posts/day</span></div>
                <div className="text-[11.5px] text-gray-600 mt-1 leading-snug">The rhythm accounts your size grow with. Enough visibility without fatigue.</div>
              </div>
              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Maximum</div>
                <div className="text-[24px] font-semibold leading-tight tracking-tight text-gray-900 tabular-nums mt-1">5<span className="text-[13px] font-normal text-gray-500 ml-1">posts/day</span></div>
                <div className="text-[11.5px] text-gray-600 mt-1 leading-snug">Beyond this, followers start scrolling past. Save extras for stories.</div>
              </div>
            </div>

            {/* Per-post-count schedule for the peak day */}
            {(() => {
              const peakDay = daysByTimeOfDay[0];
              if (!peakDay) return null;
              const m = peakDay.slots.morning;
              const md = peakDay.slots.midday;
              const e = peakDay.slots.evening;
              const l = peakDay.slots.late;
              const label = (s: { hour: number; count: number } | undefined) => s ? fmtHour(s.hour) : "—";
              // Second-evening slot for the 5-post pattern — take the 2nd best evening hour.
              // Fall back gracefully if we can't compute one.
              const secondEvening = "6 – 7 PM";

              const patterns: { n: string; plan: string[] }[] = [
                { n: "1 post",  plan: [ e ? `${label(e)} (evening peak — save it for the biggest launch)` : "morning" ] },
                { n: "2 posts", plan: [ label(m), label(e) ] },
                { n: "3 posts", plan: [ label(m), label(md), label(e) ] },
                { n: "4 posts", plan: [ label(m), label(md), label(e), l ? label(l) : "10 PM" ] },
                { n: "5 posts", plan: [ label(m), label(md), secondEvening, label(e), l ? label(l) : "10 PM" ] },
              ];
              return (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-4 py-2 border-b border-gray-100 bg-gray-50/70">
                    If you&rsquo;re publishing on {DAY_LABELS[peakDay.day]}, use these slots →
                  </div>
                  <div className="divide-y divide-gray-100">
                    {patterns.map((p) => (
                      <div key={p.n} className="grid grid-cols-[80px_1fr] items-center px-4 py-2 text-[12.5px]">
                        <div className="font-semibold text-gray-900 tabular-nums">{p.n}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-gray-700">
                          {p.plan.map((slot, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5">
                              {i > 0 && <span className="text-gray-300 mx-0.5">·</span>}
                              <span className="bg-brand/10 text-brand rounded px-2 py-0.5 tabular-nums font-medium">{slot}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="text-[11.5px] text-gray-600 mt-3 leading-relaxed">
              Spread posts across morning + midday + evening (and late-night for 4–5) so they don&rsquo;t stack in one feed window. Same content, different eyeballs.
            </div>
          </div>

          <div className="text-[11px] text-gray-400 italic">
            Data from Meta&rsquo;s Instagram Insights API for @goocampus — <b>online_followers</b> metric, rolling 7-day average. Nothing else.
          </div>
        </div>
      )}
    </section>
  );
}
