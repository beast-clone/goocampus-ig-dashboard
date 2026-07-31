"use client";
import { useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { ReportView, type ReportPayload } from "@/app/(dashboard)/dashboard/hope-preview/ai-reports/ReportView";
import {
  IconBrandInstagram, IconBrandFacebook, IconBrandLinkedin, IconBrandYoutube, IconChevronRight, IconArrowLeft, IconTrash,
} from "@tabler/icons-react";
import { fmtDateShort, fmtDateTime } from "@/lib/date";

type Headline = { label: string; value: string; delta?: string };
type SavedReportMeta = {
  key: string; platform: string; accountId: string;
  period: "weekly" | "monthly" | "quarterly"; bucket: string;
  label: string; account: string; from: string; to: string; generatedAt: string;
  headline?: Headline[];
};

const PERIOD_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  weekly: { bg: "#E9ECFB", fg: "#2138B0", label: "Weekly" },
  monthly: { bg: "#E3F5EA", fg: "#157F3C", label: "Monthly" },
  quarterly: { bg: "#FCF0DA", fg: "#B45309", label: "Quarterly" },
};

const PLATFORMS = [
  { key: "instagram", label: "Instagram", Icon: IconBrandInstagram },
  { key: "facebook",  label: "Facebook",  Icon: IconBrandFacebook },
  { key: "linkedin",  label: "LinkedIn",  Icon: IconBrandLinkedin },
  { key: "youtube",   label: "YouTube",   Icon: IconBrandYoutube },
];

const metric = (m: SavedReportMeta, kw: string) =>
  (m.headline || []).find((h) => h.label.toLowerCase().includes(kw))?.value;

export default function SocialReportsPage() {
  return (
    <HopeDashboardShell
      active="reports"
      title="Social Media Reports"
      subtitle="Stored reports per channel — each keeps its own history."
      hideRange
      hideAccountPicker
    >
      {() => <SocialReports />}
    </HopeDashboardShell>
  );
}

function SocialReports() {
  const [tab, setTab] = useState<string>("instagram");
  const active = PLATFORMS.find((p) => p.key === tab) || PLATFORMS[0];
  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {PLATFORMS.map((p) => {
          const on = p.key === tab;
          return (
            <button
              key={p.key}
              onClick={() => setTab(p.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium border transition ${
                on ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-300"
              }`}
            >
              <p.Icon size={16} /> {p.label}
            </button>
          );
        })}
      </div>
      <PlatformTable key={active.key} platform={active.key} label={active.label} />
    </div>
  );
}

function PlatformTable({ platform, label }: { platform: string; label: string }) {
  const [reports, setReports] = useState<SavedReportMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Inline viewer: which stored report is open (rendered right here, not a new page).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<ReportPayload | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Soft-delete → Recycle Bin (recoverable). Row click opens the report, so stop
  // the click here.
  const trash = async (r: SavedReportMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Move this ${label} report (${fmtDateShort(r.from)} – ${fmtDateShort(r.to)}) to the Recycle Bin? You can restore it later.`)) return;
    setBusyKey(r.key);
    try {
      const res = await fetch(`/api/reports?key=${encodeURIComponent(r.key)}`, { method: "DELETE", credentials: "same-origin" });
      if (res.ok) setReports((prev) => (prev || []).filter((x) => x.key !== r.key));
    } finally { setBusyKey(null); }
  };

  useEffect(() => {
    setReports(null);
    setError(null);
    fetch(`/api/reports?platform=${platform}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setReports((d.reports || []) as SavedReportMeta[]); })
      .catch((e) => setError((e as Error).message));
  }, [platform]);

  const openRow = (r: SavedReportMeta) => {
    setOpenKey(r.key);
    setOpenReport(null);
    setOpenError(null);
    setOpenLoading(true);
    fetch(`/api/reports?key=${encodeURIComponent(r.key)}`)
      .then((res) => res.json())
      .then((d) => { if (d.error) throw new Error(d.error); setOpenReport(d.report as ReportPayload); })
      .catch((e) => setOpenError((e as Error).message))
      .finally(() => setOpenLoading(false));
  };
  const closeRow = () => { setOpenKey(null); setOpenReport(null); setOpenError(null); };

  // ── Inline report view (opened from a row) ──
  if (openKey) {
    return (
      <div>
        <button onClick={closeRow} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A5468] hover:text-[#232D42] mb-4">
          <IconArrowLeft size={16} /> Back to {label} reports
        </button>
        {openLoading && <div className="animate-pulse h-64 bg-gray-100 rounded-2xl" />}
        {openError && <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-5 py-4 text-sm">Couldn&rsquo;t open report — {openError}</div>}
        {openReport && <ReportView report={openReport} regenerating={false} />}
      </div>
    );
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-5 py-4 text-sm">Couldn&rsquo;t load — {error}</div>;
  }
  if (!reports) {
    return <div className="animate-pulse h-40 bg-gray-100 rounded-2xl" />;
  }
  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <div className="text-[#232D42] font-medium">No {label} reports stored yet</div>
        <div className="text-[#8A92A6] text-sm mt-1.5">Reports appear here automatically once they&rsquo;re generated — one row per period.</div>
      </div>
    );
  }

  const th = "text-left font-semibold px-4 py-3 text-[11px] uppercase tracking-wide text-[#8A92A6]";
  const td = "px-4 py-3 align-middle";
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-100 bg-[#FbFbFd]">
              <th className={th}>Period</th>
              <th className={th}>Report window</th>
              <th className={th}>Account</th>
              <th className={`${th} text-right`}>Reach</th>
              <th className={`${th} text-right`}>Followers</th>
              <th className={`${th} text-right`}>Engagement</th>
              <th className={th}>Generated</th>
              <th className="px-2" />
              <th className="px-2" />
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const ps = PERIOD_STYLE[r.period] || PERIOD_STYLE.monthly;
              return (
                <tr
                  key={r.key}
                  onClick={() => openRow(r)}
                  className="border-b border-gray-50 last:border-0 hover:bg-[#F7F8FC] cursor-pointer transition"
                >
                  <td className={td}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: ps.bg, color: ps.fg }}>{ps.label}</span>
                  </td>
                  <td className={`${td} font-medium text-[#232D42] whitespace-nowrap`}>{fmtDateShort(r.from)} – {fmtDateShort(r.to)}</td>
                  <td className={`${td} text-[#4A5468] whitespace-nowrap`}>@{r.account}</td>
                  <td className={`${td} text-right tabular-nums text-[#232D42]`}>{metric(r, "reach") || "—"}</td>
                  <td className={`${td} text-right tabular-nums text-[#232D42]`}>{metric(r, "follower") || "—"}</td>
                  <td className={`${td} text-right tabular-nums text-[#232D42]`}>{metric(r, "engage") || "—"}</td>
                  <td className={`${td} text-[#8A92A6] text-xs whitespace-nowrap`}>{fmtDateTime(r.generatedAt)}</td>
                  <td className="px-1 text-right">
                    <button onClick={(e) => trash(r, e)} disabled={busyKey === r.key} title="Move to Recycle Bin"
                      className="text-gray-300 hover:text-rose-500 p-1 rounded disabled:opacity-40">
                      <IconTrash size={16} />
                    </button>
                  </td>
                  <td className="px-2 text-gray-300"><IconChevronRight size={16} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
