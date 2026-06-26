"use client";
import { format, subDays } from "date-fns";

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

export function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex items-center gap-2">
      {PRESETS.map((p) => {
        const active = isPresetActive(value, p.days);
        return (
          <button
            key={p.label}
            onClick={() => onChange({ from: format(subDays(new Date(), p.days), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") })}
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
      <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
      <span className="text-xs text-gray-400">→</span>
      <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
    </div>
  );
}
