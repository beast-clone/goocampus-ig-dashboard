"use client";
import { useState } from "react";
import { IconCalendarEvent, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

// Hope-UI date picker.
//
// A native <input type="date"> hands you the OS calendar — grey, un-themeable, and
// visibly foreign next to everything else in the dashboard. This is the branded
// replacement. `value`/`onChange` speak the same "YYYY-MM-DD" string the native
// input does, so it drops into existing logic unchanged.
//
// `min`/`max` grey out and disable the days outside the range, which is how
// analytics pickers stop you selecting a future date that can't have data yet.
// Scheduling pickers pass neither, because picking a future date is the point.

export function ymdStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayYmd(): string {
  return ymdStr(new Date());
}

export function HopeDatePicker({
  value, onChange, min, max, placeholder = "Pick a date", allowClear = true, size = "md", align = "left", drop = "down",
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;                 // inclusive "YYYY-MM-DD"
  max?: string;                 // inclusive "YYYY-MM-DD"
  placeholder?: string;
  allowClear?: boolean;
  size?: "sm" | "md";
  align?: "left" | "right";
  drop?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : null;
  const today = new Date();
  const [view, setView] = useState(() => {
    const b = selected || today;
    return { y: b.getFullYear(), m: b.getMonth() };
  });

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const outOfRange = (d: Date) => {
    const s = ymdStr(d);
    return (!!min && s < min) || (!!max && s > max);
  };

  // Don't offer a month whose every day is out of range — paging into 2027 to find
  // nothing selectable is just a dead end.
  const monthAllBefore = !!min && ymdStr(new Date(view.y, view.m + 1, 0)) < min;
  const monthAllAfter = !!max && ymdStr(new Date(view.y, view.m, 1)) > max;
  const canGoPrev = !monthAllBefore || !min ? true : ymdStr(new Date(view.y, view.m, 1)) > min;
  const canGoNext = !max ? true : ymdStr(new Date(view.y, view.m + 1, 0)) < max;

  const label = selected
    ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : placeholder;
  const todaySelectable = !outOfRange(today);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 ${
          size === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-3 py-2"} ${selected ? "text-gray-900" : "text-gray-400"}`}>
        <IconCalendarEvent size={size === "sm" ? 14 : 16} stroke={1.8} className="text-gray-400" />
        <span className="whitespace-nowrap">{label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Inline boxShadow — .hope-scope strips Tailwind shadow-* to none. */}
          <div style={{ boxShadow: "0 12px 32px rgba(35,45,66,.16)" }}
            className={`absolute z-50 bg-white border border-gray-200 rounded-xl p-3 w-64 ${
              align === "right" ? "right-0" : "left-0"} ${
              drop === "up" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-900">{monthLabel}</div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous month" disabled={!canGoPrev}
                  onClick={() => setView((v) => (v.m - 1 < 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
                  <IconChevronLeft size={16} stroke={2} />
                </button>
                <button type="button" aria-label="Next month" disabled={!canGoNext}
                  onClick={() => setView((v) => (v.m + 1 > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
                  <IconChevronRight size={16} stroke={2} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="text-xs text-gray-400 text-center font-medium">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />;
                const disabled = outOfRange(d);
                const isSelected = selected && sameDay(d, selected);
                return (
                  <button key={i} type="button" disabled={disabled}
                    title={disabled ? (max && ymdStr(d) > max ? "No data for a date that hasn't happened yet" : "Outside the allowed range") : undefined}
                    onClick={() => { onChange(ymdStr(d)); setOpen(false); }}
                    className={`h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-lg transition ${
                      disabled ? "text-gray-300 cursor-not-allowed"
                        : isSelected ? "bg-brand text-white font-medium"
                        : sameDay(d, today) ? "border border-brand text-brand"
                        : "text-gray-700 hover:bg-gray-100"}`}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              {allowClear ? (
                <button type="button" onClick={() => { onChange(""); setOpen(false); }}
                  className="text-xs text-gray-500 hover:text-gray-800">Clear</button>
              ) : <span />}
              <button type="button" disabled={!todaySelectable}
                onClick={() => { onChange(ymdStr(today)); setView({ y: today.getFullYear(), m: today.getMonth() }); setOpen(false); }}
                className="text-xs text-brand font-medium hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed">
                Today
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
