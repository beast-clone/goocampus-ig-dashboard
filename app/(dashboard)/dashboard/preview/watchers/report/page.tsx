"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconAlertTriangle, IconMail, IconBrandTelegram, IconFileTypePdf, IconWorld } from "@tabler/icons-react";
import { ReportDownload } from "@/app/(dashboard)/dashboard/preview/ReportDownload";
import { fileStamp, type ExportReport } from "@/lib/report-export";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";

// The watchers report — the counterpart to the Radar one, and deliberately the same
// shape, because it answers the same question: a notice was found, so what happened?
//
// The rows with nothing in the "what was done" column are the reason this exists.
// Without it a seat matrix could appear, be scrolled past, and leave no trace — so
// "we read it and it wasn't worth a post" and "nobody looked" were the same thing on
// the screen.
//
// Two things it reports that the Radar one cannot, because a notice carries its own
// date and a headline does not:
//   · how long the notice existed before we found it
//   · whether it actually reached anybody
//
// Admin only — the endpoint enforces it.

type Item = {
  itemKey: string; title: string; url: string; group: string; site: string; summary: string | null;
  foundAt: string; postedAt: string | null; lagMins: number | null;
  emailed: boolean; telegram: boolean;
  action: string | null; reason: string | null; by: string | null; taskId: string | null;
};
type Day = {
  day: string; found: number; written: number; useful: number; notUseful: number;
  noAction: number; toldNobody: number; items: Item[];
};

const RANGES = [7, 14, 30] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  written:    { label: "Written",         cls: "bg-[#E3F5EA] text-[#0F6E3C]" },
  useful:     { label: "Useful, not now", cls: "bg-brand-light text-[#2138B0]" },
  not_useful: { label: "Not useful",      cls: "bg-[#F3F5F9] text-[#8A92A6]" },
};
const NONE = { label: "No action taken", cls: "bg-[#FBE7E4] text-[#C03221]" };

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

// "25h late" reads; "1500 minutes" does not.
function lagLabel(mins: number | null): string | null {
  if (mins === null) return null;
  if (mins < 90) return `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
const isPdf = (u: string) => /\.pdf(\?|$)/i.test(u);

export default function WatchersReportPage() {
  return (
    <PreviewDashboardShell active="watchers" title="Watchers report"
      subtitle="Every notice the watchers found, and what was done about it — including the ones nobody touched."
      hideAccountPicker hideRange>
      {() => <WatchersReport />}
    </PreviewDashboardShell>
  );
}

function WatchersReport() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [range, setRange] = useState<number>(14);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDays(null); setError(null);
    fetch(`/api/watchers/report?days=${range}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setError(d?.error || `Couldn't load the report (${r.status})`); return; }
        setDays(d.days || []);
      })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [range]);

  const totalNoAction = (days || []).reduce((n, d) => n + d.noAction, 0);
  const totalTold = (days || []).reduce((n, d) => n + d.toldNobody, 0);

  return (
    <>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <Link href="/dashboard/preview/watchers"
          className="inline-flex items-center gap-1 text-[12.5px] text-[#8A92A6] hover:text-brand">
          <IconArrowLeft size={14} stroke={1.8} /> Watchers
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="ml-auto flex items-center gap-2">
          <ReportDownload
            filename={`goocampus-watchers-${range}d-${fileStamp()}`}
            disabled={!days || days.length === 0}
            build={() => buildExport(days!, range)} />
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`text-[12px] font-medium px-2.5 py-1 rounded-lg border transition ${
                  range === r ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-200"}`}>
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The two failures worth a headline, and they are different failures: one is
          nobody answering, the other is nobody being told in the first place. */}
      {days && days.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <Headline n={totalNoAction} label="notices nobody answered"
            hint="Found and shown, with no Write this and no thumb either way." />
          <Headline n={totalTold} label="notices that reached nobody"
            hint="Found, but neither emailed nor sent on Telegram." />
        </div>
      )}

      {error && (
        <div className="bg-[#FBE7E4] text-[#C03221] rounded-xl px-4 py-3 text-[13px] inline-flex items-center gap-2">
          <IconAlertTriangle size={16} /> {error}
        </div>
      )}
      {!days && !error && <div className="text-[13px] text-[#8A92A6]">Loading…</div>}
      {days && days.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl px-6 py-10 text-center text-[13px] text-[#8A92A6]">
          No notices were found in this period.
        </div>
      )}

      <div className="space-y-4">
        {(days || []).map((d) => <DayCard key={d.day} d={d} />)}
      </div>
    </>
  );
}

function Headline({ n, label, hint }: { n: number; label: string; hint: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${n > 0 ? "bg-[#FBE7E4] border-[#F3CFC9]" : "bg-white border-gray-100"}`}>
      <div className="flex items-baseline gap-2">
        <span className={`text-[22px] font-medium tabular-nums ${n > 0 ? "text-[#C03221]" : "text-[#232D42]"}`}>{n}</span>
        <span className={`text-[13px] ${n > 0 ? "text-[#C03221]" : "text-[#4A5468]"}`}>{label}</span>
      </div>
      <div className="text-[11.5px] text-[#8A92A6] mt-0.5">{hint}</div>
    </div>
  );
}

function DayCard({ d }: { d: Day }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <span className="text-[15px] font-medium text-[#232D42]">{dayLabel(d.day)}</span>
        <span className="text-[12px] text-[#8A92A6]">
          {d.found} found · {d.written} written · {d.useful} useful · {d.notUseful} not useful
          {d.noAction > 0 && <span className="text-[#C03221]"> · {d.noAction} unanswered</span>}
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {d.items.map((i) => <Row key={i.itemKey} i={i} />)}
      </div>
    </div>
  );
}

function Row({ i }: { i: Item }) {
  const st = i.action ? STATUS[i.action] : NONE;
  const lag = lagLabel(i.lagMins);
  return (
    <div className="py-2.5 flex items-start gap-3 flex-wrap">
      <span className={`text-[11px] rounded px-1.5 py-0.5 shrink-0 w-[52px] text-center ${
        i.group === "UG" ? "bg-brand-light text-brand" : i.group === "PG" ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-[#4A5468]"}`}>
        {i.group}
      </span>
      <div className="flex-1 min-w-[260px]">
        <a href={i.url} target="_blank" rel="noreferrer" className="text-[13.5px] text-[#232D42] hover:text-brand">
          {isPdf(i.url) ? <IconFileTypePdf size={14} className="inline -mt-0.5 mr-1 text-[#C03221]" /> : <IconWorld size={14} className="inline -mt-0.5 mr-1 text-[#8A92A6]" />}
          {i.title}
        </a>
        <div className="text-[11.5px] text-[#8A92A6] mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{i.site}</span>
          {lag && (<>
            <span className="opacity-50">·</span>
            {/* The gap between a notice being published and us seeing it. Over a day is
                worth noticing: a vacant-seat matrix has a shelf life. */}
            <span className={i.lagMins !== null && i.lagMins > 1440 ? "text-[#C03221]" : ""} title="Between the notice's own date and when we found it">
              found {lag} later
            </span>
          </>)}
          <span className="opacity-50">·</span>
          <span className="inline-flex items-center gap-1.5" title="Where it was sent">
            <IconMail size={12} className={i.emailed ? "text-[#1E7B4C]" : "text-gray-300"} />
            <IconBrandTelegram size={12} className={i.telegram ? "text-[#1E7B4C]" : "text-gray-300"} />
            {!i.emailed && !i.telegram && <span className="text-[#C03221]">told nobody</span>}
          </span>
        </div>
        {i.reason && <div className="text-[11.5px] text-[#8A92A6] mt-1">&ldquo;{i.reason}&rdquo;</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {i.by && <span className="text-[11.5px] text-[#8A92A6]">{i.by}</span>}
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
      </div>
    </div>
  );
}

function buildExport(days: Day[], range: number): ExportReport {
  const found = days.reduce((n, d) => n + d.found, 0);
  const noAction = days.reduce((n, d) => n + d.noAction, 0);
  const told = days.reduce((n, d) => n + d.toldNobody, 0);
  return {
    title: "GooCampus — Watchers report",
    subtitle: `Last ${range} days · ${found} notices found · ${noAction} unanswered · ${told} reached nobody`,
    meta: [
      `${found} notices found`,
      `${noAction} nobody answered`,
      `${told} reached nobody`,
    ],
    columns: ["Group", "Notice", "Website", "Lag", "Sent", "What was done", "By", "Why not"],
    sections: days.map((d) => ({
      heading: dayLabel(d.day),
      note: `${d.found} found · ${d.written} written · ${d.useful} useful · ${d.notUseful} not useful · ${d.noAction} unanswered`,
      rows: d.items.map((i) => [
        i.group,
        i.title,
        i.site,
        lagLabel(i.lagMins) ? `found ${lagLabel(i.lagMins)} later` : "",
        [i.emailed ? "email" : "", i.telegram ? "telegram" : ""].filter(Boolean).join(" + ") || "told nobody",
        i.action ? (STATUS[i.action]?.label || i.action) : NONE.label,
        i.by || "",
        i.reason || "",
      ]),
    })),
  };
}
