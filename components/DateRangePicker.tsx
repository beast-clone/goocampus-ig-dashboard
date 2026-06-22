"use client";
import { format, subDays } from "date-fns";

export type Range = { from: string; to: string };

export function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const presets: { label: string; days: number }[] = [
    { label: "7d", days: 7 },
    { label: "14d", days: 14 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
  ];
  return (
    <div className="flex items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => onChange({ from: format(subDays(new Date(), p.days), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") })}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-200 hover:bg-gray-50"
        >
          {p.label}
        </button>
      ))}
      <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
      <span className="text-xs text-gray-400">→</span>
      <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="px-3 py-1.5 text-xs rounded-md border border-gray-200" />
    </div>
  );
}
