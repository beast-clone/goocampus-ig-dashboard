"use client";
import { useEffect, useRef, useState } from "react";
import { format, subDays } from "date-fns";
import { IconCalendar } from "@tabler/icons-react";

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
  const today = format(new Date(), "yyyy-MM-dd");
  if (r.to !== today) return false;
  const expected = format(subDays(new Date(), days), "yyyy-MM-dd");
  return r.from === expected;
}

function fmtShort(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return d;
  }
}

export function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
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
              onChange({ from: format(subDays(new Date(), p.days), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") });
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
            <input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-200 mb-2.5"
            />
            <div className="text-[11px] font-medium text-gray-500 mb-1">To</div>
            <input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-200"
            />
          </div>
        )}
      </div>
    </div>
  );
}
