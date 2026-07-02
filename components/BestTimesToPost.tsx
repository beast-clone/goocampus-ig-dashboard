"use client";
import { useMemo } from "react";

type Grid = (number | null)[][]; // 7 rows × 24 cols

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtHour(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr} ${ampm}`;
}

// Ranked, action-oriented replacement for the raw 7×24 heatmap. Same data, but the
// answer to the actual question ("when should I post?") is served up as the top 6
// windows on their own cards instead of asking the reader to decode colour intensity.
export default function BestTimesToPost({ grid }: { grid: Grid }) {
  const { top, allEmpty, absoluteMax, hourAverages } = useMemo(() => {
    const flat: { day: number; hour: number; v: number }[] = [];
    const hourSums: number[] = new Array(24).fill(0);
    const hourCounts: number[] = new Array(24).fill(0);
    let m = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = grid[d]?.[h];
        if (v == null) continue;
        if (v > m) m = v;
        flat.push({ day: d, hour: h, v });
        hourSums[h] += v;
        hourCounts[h] += 1;
      }
    }
    flat.sort((a, b) => b.v - a.v);
    const hourAverages = hourSums.map((s, i) => hourCounts[i] > 0 ? s / hourCounts[i] : 0);
    return { top: flat.slice(0, 6), allEmpty: flat.length === 0, absoluteMax: m, hourAverages };
  }, [grid]);

  if (allEmpty) {
    return (
      <div className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Meta hasn&apos;t returned hourly online-follower data for this account yet (needs ~100 followers).
      </div>
    );
  }

  const hourMax = Math.max(...hourAverages);
  const bestGeneralHour = hourAverages.indexOf(hourMax);

  return (
    <div className="space-y-6">
      {/* Top 6 slots — one card per slot, ranked. */}
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">Top 6 post-time slots (highest online followers)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {top.map((slot, i) => {
            const share = (slot.v / absoluteMax) * 100;
            return (
              <div key={`${slot.day}-${slot.hour}`} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                <div className={`text-2xl font-bold w-8 tabular-nums ${
                  i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-400" : "text-gray-300"
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="text-base font-semibold text-gray-900">{DAYS_FULL[slot.day]}</div>
                    <div className="text-base font-semibold text-brand tabular-nums">{fmtHour(slot.hour)}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-700 tabular-nums">{slot.v.toLocaleString("en-IN")}</span> followers online
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${share}%`, background: "linear-gradient(90deg, #7c3aed, #ec4899)" }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hour-of-day summary — one small stat + a mini vertical bar sparkline so the
          reader sees when in the DAY the crowd shows up, independent of the specific
          weekday. Answers "morning or evening?" in one glance. */}
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">Activity by hour of day (avg across all 7 days)</div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-stretch gap-1 h-24">
            {hourAverages.map((v, h) => {
              // Convert directly to pixel height so we don't depend on the parent's
              // computed height being propagated through nested flex containers.
              const barPx = hourMax > 0 ? Math.max((v / hourMax) * 96, 3) : 3;
              const isBest = h === bestGeneralHour && hourMax > 0;
              return (
                <div key={h} className="flex-1 flex flex-col justify-end" title={`${fmtHour(h)}: ${Math.round(v).toLocaleString("en-IN")} online`}>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${barPx}px`,
                      background: isBest
                        ? "linear-gradient(180deg, #ec4899, #7c3aed)"
                        : "linear-gradient(180deg, #a78bfa, #7c3aed)",
                      opacity: isBest ? 1 : 0.55,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1.5 tabular-nums px-1">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>11 PM</span>
          </div>
          <div className="text-xs text-gray-600 mt-3 border-t border-gray-100 pt-2.5">
            Peak hour across all days: <span className="font-semibold text-brand">{fmtHour(bestGeneralHour)}</span>
            {" "}— <span className="tabular-nums">{Math.round(hourMax).toLocaleString("en-IN")}</span> followers online on average.
          </div>
        </div>
      </div>

      {/* Fallback — small note that this is a distilled view */}
      <div className="text-[11px] text-gray-400">
        Ranking based on Meta&apos;s hourly follower-online data for the last 7 days. Grey days above (Wed / Thu) had no data returned.
      </div>
    </div>
  );
}

// Re-export DAYS for consumers that might want it (kept for backwards-compat with
// callers of the old heatmap that used the same shape).
export { DAYS };
