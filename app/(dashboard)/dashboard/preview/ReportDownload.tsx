"use client";

import { useState } from "react";
import { IconDownload, IconFileText, IconFileTypePdf, IconCheck } from "@tabler/icons-react";
import { downloadMarkdown, downloadPdf, type ExportReport } from "@/lib/report-export";

// The download pair, shared by every report in the dashboard so they behave identically
// and neither format can quietly drift from the other.
//
// `build` is a function rather than the data itself: the report may be large, and
// nobody should pay to assemble a PDF's worth of rows on every render of a page they
// are only reading.
export function ReportDownload({ build, filename, disabled }: {
  build: () => ExportReport;
  filename: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<"md" | "pdf" | null>(null);
  const [done, setDone] = useState<"md" | "pdf" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: "md" | "pdf") => {
    if (busy || disabled) return;
    setBusy(kind); setErr(null);
    try {
      const report = build();
      if (kind === "md") downloadMarkdown(report, filename);
      else await downloadPdf(report, filename);
      setDone(kind);
      setTimeout(() => setDone(null), 2200);
    } catch (e) {
      // A failed download is silent otherwise — the file simply never appears, and the
      // reader is left wondering whether they missed the browser prompt.
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const base = "inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-1.5">
      {err && <span className="text-[11.5px] text-[#C03221] mr-1">{err}</span>}
      <button type="button" onClick={() => run("md")} disabled={!!busy || disabled}
        title="Download as Markdown — paste into Notion, Slack or a doc"
        className={`${base} ${done === "md"
          ? "border-[#BFE6CD] bg-[#E3F5EA] text-[#0F6E3C]"
          : "border-gray-200 bg-white text-[#4A5468] hover:border-brand hover:text-brand"}`}>
        {done === "md" ? <IconCheck size={13} stroke={2} /> : <IconFileText size={13} stroke={1.8} />}
        {busy === "md" ? "Saving…" : done === "md" ? "Saved" : "Markdown"}
      </button>
      <button type="button" onClick={() => run("pdf")} disabled={!!busy || disabled}
        title="Download as PDF — real text, every row, not a screenshot"
        className={`${base} ${done === "pdf"
          ? "border-[#BFE6CD] bg-[#E3F5EA] text-[#0F6E3C]"
          : "border-gray-200 bg-white text-[#4A5468] hover:border-brand hover:text-brand"}`}>
        {done === "pdf" ? <IconCheck size={13} stroke={2} /> : <IconFileTypePdf size={13} stroke={1.8} />}
        {busy === "pdf" ? "Building…" : done === "pdf" ? "Saved" : "PDF"}
      </button>
      <IconDownload size={13} className="text-[#C7CEDD] ml-0.5" />
    </div>
  );
}
