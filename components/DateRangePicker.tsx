"use client";
import { useEffect, useRef, useState } from "react";
import { format, subDays } from "date-fns";
import { todayIST, daysAgoIST } from "@/lib/date";
import { IconCalendar } from "@tabler/icons-react";
import { HopeDatePicker } from "@/app/(dashboard)/dashboard/hope-preview/HopeDatePicker";

export type Range = { from: string; to: string };

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
];

export function rangeDays(r: Range): number {
  return Math.round((new Date(r.to).getTime() - new Date(r.from).getTime()) / (1000 * 60 * 60 * 24));
}

function isPresetActive(r: Range, days: number): boolean {
  const today = todayIST();
  if (r.to !== today) return false;
  const expected = daysAgoIST(days);
  return r.from === expected;
}

function fmtShort(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return d;
  }
}

// Analytics only ever looks backwards, so a future date can't return anything —
// picking one silently produced an empty range. `max` greys them out in the
// picker; clampToToday() covers the case where a date is typed straight into the
// field, which bypasses `max` in several browsers.
function todayLocal(): string {
  return todayIST(); // the team's calendar day, not the viewer's machine
}

function clampToToday(d: string): string {
  const t = todayLocal();
  return d && d > t ? t : d;
}

export function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const today = todayLocal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A custom range = the current range doesn't match any preset.
  const isCustom = !PRESETS.some((p) => isPresetActive(value, p.days));

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="flex items-center gap-1.5" ref={ref}>
      {PRESETS.map((p) => {
        const active = isPresetActive(value, p.days);
        return (
          <button
            key={p.label}
            onClick={() => {
              onChange({ from: daysAgoIST(p.days), to: todayIST() });
              setOpen(false);
            }}
            className={`px-3 py-1.5 text-xs rounded-md border transition ${
              active
                ? "bg-brand text-white border-brand shadow-sm font-medium"
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        );
      })}

      {/* Custom — a compact button; the from/to pickers drop down only when opened */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          title="Pick a custom date range"
          className={`px-3 py-1.5 text-xs rounded-md border transition inline-flex items-center gap-1.5 whitespace-nowrap ${
            isCustom
              ? "bg-brand text-white border-brand shadow-sm font-medium"
              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          <IconCalendar size={13} stroke={1.8} />
          {isCustom ? `${fmtShort(value.from)} – ${fmtShort(value.to)}` : "Custom"}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-[230px]">
            <div className="text-[11px] font-medium text-gray-500 mb-1">From</div>
            <div className="mb-2.5">
              <HopeDatePicker size="sm" allowClear={false}
                value={value.from}
                max={value.to && value.to < today ? value.to : today}
                onChange={(v) => onChange({ ...value, from: clampToToday(v) })} />
            </div>
            <div className="text-[11px] font-medium text-gray-500 mb-1">To</div>
            <HopeDatePicker size="sm" allowClear={false}
              value={value.to}
              min={value.from || undefined}
              max={today}
              onChange={(v) => onChange({ ...value, to: clampToToday(v) })} />
            <div className="text-[10.5px] text-gray-400 mt-2 leading-snug">
              Up to today — there&apos;s no data for a date that hasn&apos;t happened.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
