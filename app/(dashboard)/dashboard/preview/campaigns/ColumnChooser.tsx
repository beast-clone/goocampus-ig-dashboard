"use client";
import { IconEye, IconEyeOff, IconArrowUp, IconArrowDown, IconArrowBarUp } from "@tabler/icons-react";

// Which of the sheet's own columns are shown next to the lead, and in what order.
//
// The dashboard writes to six columns; everything else in the sheet comes along
// read-only. That is right by default — the domicile state is what someone needs
// mid-call — but a sheet also carries columns nobody wants to look at, and the
// one that matters is often last. So: hide them, and move them.
//
// Order is stored as a list of headers. A column added to the sheet later isn't
// in that list and appears at the end rather than vanishing.

export type ColumnPrefs = { order: string[]; hidden: string[]; widths?: Record<string, number> };

export function applyPrefs(all: string[], prefs?: ColumnPrefs | null): string[] {
  const order = prefs?.order || [];
  const hidden = new Set(prefs?.hidden || []);
  const known = order.filter((h) => all.includes(h));
  const rest = all.filter((h) => !known.includes(h));
  return [...known, ...rest].filter((h) => !hidden.has(h));
}

/** Same list, hidden ones included, so they can be switched back on. */
export function orderedAll(all: string[], prefs?: ColumnPrefs | null): string[] {
  const order = prefs?.order || [];
  const known = order.filter((h) => all.includes(h));
  return [...known, ...all.filter((h) => !known.includes(h))];
}

export function ColumnChooser({ all, prefs, onChange, reorder = true }: {
  all: string[];
  prefs: ColumnPrefs;
  onChange: (next: ColumnPrefs) => void;
  /** Arrows for ordering. Off at setup: order is set by dragging the real headers. */
  reorder?: boolean;
}) {
  const rows = orderedAll(all, prefs);
  const hidden = new Set(prefs.hidden || []);

  const move = (header: string, to: number) => {
    const next = rows.filter((h) => h !== header);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, header);
    onChange({ ...prefs, order: next });
  };

  const toggle = (header: string) => {
    const h = new Set(hidden);
    if (h.has(header)) h.delete(header); else h.add(header);
    onChange({ order: rows, hidden: [...h] });
  };

  if (rows.length === 0) {
    return <p className="text-[12px] text-[#A6ACBE]">Every column in this tab is already mapped above.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((h, i) => {
        const off = hidden.has(h);
        return (
          <div key={h} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${off ? "border-gray-100 bg-[#FCFCFE]" : "border-gray-200"}`}>
            <span className={`flex-1 min-w-0 truncate text-[12px] ${off ? "text-[#C9CDD8] line-through" : "text-[#232D42]"}`} title={h}>{h}</span>
            {reorder && (<>
            <button type="button" onClick={() => move(h, 0)} disabled={i === 0} title="Move to the front"
              className="p-1 rounded-md text-[#A6ACBE] hover:text-brand hover:bg-brand-light disabled:opacity-25 disabled:hover:bg-transparent">
              <IconArrowBarUp size={13} stroke={1.9} />
            </button>
            <button type="button" onClick={() => move(h, i - 1)} disabled={i === 0} title="Move up"
              className="p-1 rounded-md text-[#A6ACBE] hover:text-brand hover:bg-brand-light disabled:opacity-25 disabled:hover:bg-transparent">
              <IconArrowUp size={13} stroke={1.9} />
            </button>
            <button type="button" onClick={() => move(h, i + 1)} disabled={i === rows.length - 1} title="Move down"
              className="p-1 rounded-md text-[#A6ACBE] hover:text-brand hover:bg-brand-light disabled:opacity-25 disabled:hover:bg-transparent">
              <IconArrowDown size={13} stroke={1.9} />
            </button>
            </>)}
            {/* Hidden, not deleted. The sheet keeps the column and everything in it;
                this only decides what the table bothers to show. */}
            <button type="button" onClick={() => toggle(h)} title={off ? "Show this column" : "Hide this column"}
              className={`p-1 rounded-md ${off ? "text-brand hover:bg-brand-light" : "text-[#A6ACBE] hover:text-[#C0392B] hover:bg-[#FDECEA]"}`}>
              {off ? <IconEye size={13} stroke={1.9} /> : <IconEyeOff size={13} stroke={1.9} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
