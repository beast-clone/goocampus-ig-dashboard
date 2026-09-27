"use client";

import { useMemo, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { ReportDownload } from "@/app/(dashboard)/dashboard/preview/ReportDownload";
import { fileStamp, type ExportReport } from "@/lib/report-export";
import { RELEASES, type ChangeKind } from "@/lib/changelog";

// What's new — the dashboard explaining itself.
//
// Everyone can see it, deliberately. The Radar report and the AI usage report are
// admin-only because they say who did what and what it cost; this one exists so the
// team finds out what changed without Praveen having to tell each of them.
//
// Copy lives in lib/changelog.ts and is written by hand. See the note at the top of
// that file before adding a release.

const KIND: Record<ChangeKind, { label: string; cls: string }> = {
  new:     { label: "New",     cls: "bg-brand-light text-[#2138B0]" },
  fixed:   { label: "Fixed",   cls: "bg-[#E3F5EA] text-[#0F6E3C]" },
  changed: { label: "Changed", cls: "bg-[#FDF6E7] text-[#8A5A00]" },
  removed: { label: "Removed", cls: "bg-[#F3F5F9] text-[#8A92A6]" },
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function ChangelogPage() {
  return (
    <PreviewDashboardShell active="changelog" title="What's new" hideAccountPicker hideRange
      subtitle="Everything that changed in the dashboard, newest first — what it was, and what it is now.">
      {() => <Changelog />}
    </PreviewDashboardShell>
  );
}

function Changelog() {
  const [tab, setTab] = useState<string>("");

  // Built from the entries rather than hard-coded, so a new area appears in the filter
  // the moment somebody writes about it.
  const areas = useMemo(() => {
    const seen = new Set<string>();
    for (const r of RELEASES) for (const c of r.changes) seen.add(c.where);
    return Array.from(seen).sort();
  }, []);

  const releases = useMemo(() => {
    if (!tab) return RELEASES;
    return RELEASES
      .map((r) => ({ ...r, changes: r.changes.filter((c) => c.where === tab) }))
      .filter((r) => r.changes.length > 0);
  }, [tab]);

  const build = (): ExportReport => ({
    title: "GooCampus Marketing OS — what's new",
    subtitle: tab ? `Changes affecting ${tab}` : "Everything that changed, newest first",
    meta: [`${releases.reduce((n, r) => n + r.changes.length, 0)} changes across ${releases.length} release${releases.length === 1 ? "" : "s"}`],
    columns: ["Kind", "What changed", "Detail", "Where"],
    sections: releases.map((r) => ({
      heading: `${r.title} — ${dayLabel(r.date)}`,
      note: r.summary,
      rows: r.changes.map((c) => [KIND[c.kind].label, c.what, c.detail, c.where]),
    })),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setTab("")}
          className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg border transition ${
            !tab ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-200"}`}>
          Everything
        </button>
        {areas.map((a) => (
          <button key={a} onClick={() => setTab(a)}
            className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg border transition ${
              tab === a ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-200"}`}>
            {a}
          </button>
        ))}
        <div className="ml-auto">
          <ReportDownload build={build} filename={`goocampus-whats-new-${fileStamp()}`}
            disabled={releases.length === 0} />
        </div>
      </div>

      {releases.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-[13px] text-[#8A92A6]">
          Nothing logged for {tab} yet.
        </div>
      ) : releases.map((r, i) => (
        <section key={`${r.date}-${i}`} className="bg-white border border-gray-100 rounded-2xl px-5 py-4">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2 className="text-[15.5px] font-semibold text-[#232D42]">{r.title}</h2>
            <span className="text-[12.5px] text-[#A6ACBE]">{dayLabel(r.date)}</span>
            {i === 0 && (
              <span className="text-[10.5px] font-bold uppercase tracking-wider bg-[#E3F5EA] text-[#0F6E3C] rounded-full px-2 py-[2px]">
                Latest
              </span>
            )}
          </div>
          <p className="text-[13px] text-[#8A92A6] mt-0.5 mb-3">{r.summary}</p>

          <div>
            {r.changes.map((c, j) => (
              <div key={j} className="flex gap-3 py-2.5 border-t border-[#F3F5F9] first:border-t-0">
                <span className={`shrink-0 w-[62px] text-center text-[10.5px] font-bold uppercase tracking-wider rounded-md px-1.5 py-[3px] h-fit mt-0.5 ${KIND[c.kind].cls}`}>
                  {KIND[c.kind].label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-[#232D42]">{c.what}</div>
                  <p className="text-[12.8px] text-[#8A92A6] leading-relaxed mt-0.5">{c.detail}</p>
                </div>
                <span className="shrink-0 text-[11.5px] text-[#A6ACBE] whitespace-nowrap mt-1">{c.where}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
