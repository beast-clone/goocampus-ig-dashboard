"use client";
import { useMemo, useState } from "react";

type Grid = (number | null)[][]; // 7 rows × 24 cols

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PostingHeatmap({ grid }: { grid: Grid }) {
  const [hover, setHover] = useState<{ day: number; hour: number; v: number | null } | null>(null);

  const { max, top3, allEmpty } = useMemo(() => {
    let m = 0;
    let any = false;
    const flat: { day: number; hour: number; v: number }[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = grid[d]?.[h];
        if (v == null) continue;
        any = true;
        if (v > m) m = v;
        flat.push({ day: d, hour: h, v });
      }
    }
    const sorted = flat.sort((a, b) => b.v - a.v).slice(0, 3);
    return { max: m, top3: sorted, allEmpty: !any };
  }, [grid]);

  if (allEmpty) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="text-sm font-medium mb-1">Best time to post</div>
        <div className="text-xs text-gray-500">
          Meta hasn&apos;t returned hourly online-follower data for this account yet (needs ~100 followers).
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-sm font-medium">Best time to post</div>
          <div className="text-xs text-gray-500">
            Followers online by weekday × hour. Last 7 days, darker = more online.
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {top3.map((c, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 font-mono"
            >
              {i === 0 ? "🏆 " : ""}
              {DAYS[c.day]} {String(c.hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour header */}
          <div className="flex pl-10 mb-1">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="w-6 text-center text-[9px] text-gray-400 tabular-nums"
                style={{ visibility: h % 3 === 0 ? "visible" : "hidden" }}
              >
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>

          {/* Rows */}
          {DAYS.map((day, d) => (
            <div key={d} className="flex items-center mb-0.5">
              <div className="w-10 text-[11px] text-gray-500 font-medium">{day}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const v = grid[d]?.[h];
                const intensity = v == null || max === 0 ? 0 : v / max;
                const bg = v == null
                  ? "#f3f4f6"
                  : intensityToHex(intensity);
                const isTop = top3.some((t) => t.day === d && t.hour === h);
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHover({ day: d, hour: h, v: v ?? null })}
                    onMouseLeave={() => setHover(null)}
                    className="w-6 h-6 rounded-[3px] mr-[2px] transition-transform hover:scale-125 cursor-default"
                    style={{
                      backgroundColor: bg,
                      boxShadow: isTop ? "inset 0 0 0 2px #f59e0b" : undefined,
                    }}
                  />
                );
              })}
            </div>
          ))}

          {/* Legend + tooltip area */}
          <div className="flex items-center justify-between mt-3 pl-10">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span>Less</span>
              <div className="flex gap-[2px]">
                {[0, 0.25, 0.5, 0.75, 1].map((s) => (
                  <div key={s} className="w-4 h-4 rounded-[3px]" style={{ backgroundColor: intensityToHex(s) }} />
                ))}
              </div>
              <span>More</span>
              <span className="ml-3 text-gray-400">·</span>
              <span className="text-gray-400">Grey = no data</span>
            </div>
            <div className="text-[12px] text-gray-700 tabular-nums min-w-[160px] text-right">
              {hover
                ? hover.v == null
                  ? <span className="text-gray-400">{DAYS[hover.day]} {String(hover.hour).padStart(2, "0")}:00 — no data</span>
                  : <><b>{DAYS[hover.day]} {String(hover.hour).padStart(2, "0")}:00</b> · {hover.v.toLocaleString()} online</>
                : <span className="text-gray-400">Hover a cell</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function intensityToHex(i: number): string {
  // White → violet (#7c3aed)
  const clamped = Math.max(0, Math.min(1, i));
  if (clamped === 0) return "#f3f4f6";
  const r = Math.round(248 + (124 - 248) * clamped);
  const g = Math.round(250 + (58 - 250) * clamped);
  const b = Math.round(252 + (237 - 252) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}
