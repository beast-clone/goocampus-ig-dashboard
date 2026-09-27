"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconAlertTriangle } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";

// The radar report — Maheen's screen.
//
// One row per thing the Radar showed, per day, and what was done about it. The rows with
// nothing in the "what was done" column are the reason this page exists: before it, an
// item could be shown all day, scrolled past, and leave no trace, so "we decided against
// it" and "nobody looked" were the same thing on the screen.
//
// Written each night by api/cron/radar-rolloff. Admin only — the endpoint enforces it.

type Item = {
  itemKey: string; kind: string; title: string; source: string | null; url: string | null;
  interest: string | null; timeSensitive: boolean; action: string | null; by: string | null; taskId: string | null;
};
type Day = {
  day: string; shown: number; written: number; useful: number; notUseful: number;
  noAction: number; missedUrgent: number; items: Item[];
};

const RANGES = [7, 14, 30] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  written:    { label: "Written",        cls: "bg-[#E3F5EA] text-[#0F6E3C]" },
  useful:     { label: "Useful, not now", cls: "bg-brand-light text-[#2138B0]" },
  not_useful: { label: "Not useful",     cls: "bg-[#F3F5F9] text-[#8A92A6]" },
};
const NONE = { label: "No action taken", cls: "bg-[#FBE7E4] text-[#C03221]" };

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default function RadarReportPage() {
  return (
    <PreviewDashboardShell active="radar" title="Radar report" subtitle="Every day the radar closed, what it showed, and what was done about it — including the items nobody touched." hideAccountPicker hideRange>
      {() => <RadarReport />}
    </PreviewDashboardShell>
  );
}

function RadarReport() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [range, setRange] = useState<number>(14);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDays(null); setError(null);
    fetch(`/api/radar/report?days=${range}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setError(d?.error || `Couldn't load the report (${r.status})`); return; }
        setDays(d.days || []);
      })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [range]);

  const totalMissed = (days || []).reduce((n, d) => n + d.missedUrgent, 0);

  return (
    <>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <Link href="/dashboard/preview/radar"
          className="inline-flex items-center gap-1 text-[12.5px] text-[#8A92A6] hover:text-brand">
          <IconArrowLeft size={14} stroke={1.8} /> Content Radar
        </Link>
      </div>
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <div className="ml-auto flex gap-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-[12px] font-medium px-2.5 py-1 rounded-lg border transition ${
                range === r ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-200"}`}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      {/* The one number worth putting above everything: an urgent item nobody touched is a
          post that can never be made now, where an evergreen one is only late. */}
      {totalMissed > 0 && (
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-3 mb-4">
          <IconAlertTriangle size={17} stroke={1.8} className="text-[#C03221] shrink-0" />
          <span className="text-[13.5px] text-[#232D42]">
            <b className="font-semibold">{totalMissed} time-sensitive {totalMissed === 1 ? "item" : "items"}</b> went past
            with no action in the last {range} days
          </span>
        </div>
      )}

      {error && (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <div className="text-sm text-[#232D42] mb-1">{error}</div>
          <div className="text-xs text-[#8A92A6]">This report is for admins.</div>
        </div>
      )}

      {!error && days === null && (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-sm text-[#8A92A6]">Loading…</div>
      )}

      {!error && days?.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <div className="text-sm text-[#232D42] mb-1">Nothing logged yet.</div>
          <div className="text-xs text-[#8A92A6]">
            The radar closes itself at 11:59 PM — the first day appears tomorrow morning.
          </div>
        </div>
      )}

      {!error && days && days.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#F7F8FC]">
                {["What the radar showed", "Source", "What was done", "By"].map((h) => (
                  <th key={h} className="text-left text-[11.5px] font-semibold uppercase tracking-wider text-[#8A92A6] px-4 py-2.5 border-b border-gray-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <FragmentDay key={d.day} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FragmentDay({ d }: { d: Day }) {
  return (
    <>
      <tr>
        {/* The day's own summary sits in its heading row, so a week reads as a few
            sentences before anybody has to read a single item. */}
        <td colSpan={4} className="bg-[#FAFBFF] px-4 py-2.5 text-[13px] font-semibold text-[#232D42] border-b border-gray-100">
          {dayLabel(d.day)}
          <span className="ml-2 font-normal text-[12.5px] text-[#8A92A6]">
            {d.shown} shown
            {d.written > 0 && <> · {d.written} written</>}
            {d.useful > 0 && <> · {d.useful} useful</>}
            {d.notUseful > 0 && <> · {d.notUseful} not useful</>}
            {d.noAction > 0 && <> · {d.noAction} no action</>}
          </span>
        </td>
      </tr>
      {d.items.map((it) => {
        const st = it.action ? STATUS[it.action] || NONE : NONE;
        return (
          <tr key={it.itemKey} className="border-b border-gray-100 last:border-0">
            <td className="px-4 py-2.5 text-[13.5px] text-[#232D42] align-top">
              {it.timeSensitive && !it.action && (
                <span className="inline-block align-[2px] mr-2 text-[10px] font-medium px-2 py-[2px] rounded-full bg-[#FBE7E4] text-[#C03221]">
                  Was urgent
                </span>
              )}
              {it.url ? (
                <a href={it.url} target="_blank" rel="noreferrer" className="hover:text-brand">{it.title}</a>
              ) : it.title}
            </td>
            <td className="px-4 py-2.5 text-[13px] text-[#8A92A6] align-top whitespace-nowrap">{it.source || it.kind}</td>
            <td className="px-4 py-2.5 align-top whitespace-nowrap">
              <span className={`inline-flex items-center text-[12px] font-medium rounded-md px-2 py-[3px] ${st.cls}`}>{st.label}</span>
            </td>
            <td className="px-4 py-2.5 text-[13px] text-[#8A92A6] align-top whitespace-nowrap">
              {/* A claim of work links to the work. "Written" with nothing behind it is
                  exactly the kind of number this report exists to stop. */}
              {it.taskId ? (
                <Link href={`/dashboard/preview/marketing-hub?open=${it.taskId}`} className="text-brand hover:underline">
                  {it.by || "Open task"}
                </Link>
              ) : it.by || "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
