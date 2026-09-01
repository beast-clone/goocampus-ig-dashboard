"use client";
import { useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import {
  IconBrandInstagram, IconBrandFacebook, IconBrandLinkedin, IconBrandYoutube,
  IconTrash, IconRestore, IconTrashX,
} from "@tabler/icons-react";
import { fmtDateShort, fmtDateTime } from "@/lib/date";

type SavedReportMeta = {
  key: string; platform: string; accountId: string;
  period: "weekly" | "monthly" | "quarterly"; bucket: string;
  label: string; account: string; from: string; to: string; generatedAt: string;
  trashedAt?: string;
};

const PERIOD_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  weekly: { bg: "#E9ECFB", fg: "#2138B0", label: "Weekly" },
  monthly: { bg: "#E3F5EA", fg: "#157F3C", label: "Monthly" },
  quarterly: { bg: "#FCF0DA", fg: "#B45309", label: "Quarterly" },
};
const PLATFORM_ICON: Record<string, typeof IconBrandInstagram> = {
  instagram: IconBrandInstagram, facebook: IconBrandFacebook, linkedin: IconBrandLinkedin, youtube: IconBrandYoutube,
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ReportsTrashPage() {
  return (
    <PreviewDashboardShell
      active="reports"
      title="Recycle Bin"
      subtitle="Deleted reports live here — restore them anytime. Deleting from the bin removes them permanently."
      hideRange
      hideAccountPicker
    >
      {() => <TrashList />}
    </PreviewDashboardShell>
  );
}

function TrashList() {
  const [reports, setReports] = useState<SavedReportMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetch("/api/reports?trash=1", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setReports((d.reports || []) as SavedReportMeta[]); })
      .catch((e) => setError((e as Error).message));
  };
  useEffect(load, []);

  const restore = async (r: SavedReportMeta) => {
    setBusyKey(r.key);
    try {
      const res = await fetch("/api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ action: "restore", key: r.key }),
      });
      if (res.ok) setReports((prev) => (prev || []).filter((x) => x.key !== r.key));
    } finally { setBusyKey(null); }
  };
  const purge = async (r: SavedReportMeta) => {
    if (!window.confirm(`Permanently delete this ${cap(r.platform)} report (${fmtDateShort(r.from)} – ${fmtDateShort(r.to)})? This cannot be undone.`)) return;
    setBusyKey(r.key);
    try {
      const res = await fetch(`/api/reports?key=${encodeURIComponent(r.key)}&permanent=1`, { method: "DELETE", credentials: "same-origin" });
      if (res.ok) setReports((prev) => (prev || []).filter((x) => x.key !== r.key));
    } finally { setBusyKey(null); }
  };

  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-5 py-4 text-sm">Couldn&rsquo;t load — {error}</div>;
  if (!reports) return <div className="animate-pulse h-40 bg-gray-100 rounded-2xl" />;
  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
        <IconTrash size={30} className="mx-auto text-[#8A92A6]" />
        <div className="text-[#232D42] font-medium mt-3">Recycle Bin is empty</div>
        <div className="text-[#8A92A6] text-sm mt-1.5 max-w-md mx-auto">Reports you delete are moved here so you can recover them. Nothing is removed automatically.</div>
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
              <th className={th}>Channel</th>
              <th className={th}>Period</th>
              <th className={th}>Report window</th>
              <th className={th}>Account</th>
              <th className={th}>Deleted</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const ps = PERIOD_STYLE[r.period] || PERIOD_STYLE.monthly;
              const Icon = PLATFORM_ICON[r.platform];
              const busy = busyKey === r.key;
              return (
                <tr key={r.key} className="border-b border-gray-50 last:border-0">
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1.5 text-[#4A5468]">{Icon && <Icon size={16} />}{cap(r.platform)}</span>
                  </td>
                  <td className={td}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: ps.bg, color: ps.fg }}>{ps.label}</span>
                  </td>
                  <td className={`${td} font-medium text-[#232D42] whitespace-nowrap`}>{fmtDateShort(r.from)} – {fmtDateShort(r.to)}</td>
                  <td className={`${td} text-[#4A5468] whitespace-nowrap`}>@{r.account}</td>
                  <td className={`${td} text-[#8A92A6] text-xs whitespace-nowrap`}>{r.trashedAt ? fmtDateTime(r.trashedAt) : "—"}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => restore(r)} disabled={busy}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-brand border border-brand rounded-lg px-2.5 py-1 hover:bg-brand-light disabled:opacity-50">
                        <IconRestore size={14} /> Restore
                      </button>
                      <button onClick={() => purge(r)} disabled={busy} title="Delete permanently"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-rose-600 border border-rose-200 rounded-lg px-2.5 py-1 hover:bg-rose-50 disabled:opacity-50">
                        <IconTrashX size={14} /> Delete forever
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
