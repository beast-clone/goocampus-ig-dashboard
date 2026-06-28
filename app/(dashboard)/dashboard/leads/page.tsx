"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";

type Status = "new" | "contacted" | "converted" | "lost";
type SavedLead = {
  comment_id?: string;
  ig_username?: string;
  account?: string;
  comment?: string;
  mood?: string;
  post_url?: string;
  comment_time?: string;
  reason?: string;
  status?: Status;
  saved_at?: string;
};
type LeadsData = {
  leads: SavedLead[];
  totals: { saved: number; new: number; contacted: number; converted: number; lost: number };
  byBrand: Record<string, number>;
  latencyMs: number;
};

const STATUS_LABEL: Record<Status, string> = {
  new: "New", contacted: "Contacted", converted: "Converted", lost: "Lost",
};
const STATUS_COLOR: Record<Status, string> = {
  new: "bg-violet-50 text-violet-700 border-violet-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  converted: "bg-green-50 text-green-700 border-green-200",
  lost: "bg-gray-50 text-gray-500 border-gray-200",
};

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function LeadsPage() {
  return (
    <DashboardShell title="Leads" subtitle="Leads you've saved from the Inbox — track contact + conversion.">
      {({ accountId }) => <Inner accountId={accountId} />}
    </DashboardShell>
  );
}

function Inner({ accountId }: { accountId: string }) {
  const [data, setData] = useState<LeadsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  function load() {
    setLoading(true);
    const qs = new URLSearchParams({ account: accountId });
    fetch(`/api/leads?${qs}`)
      .then((r) => r.json())
      .then((d: LeadsData) => { setData(d); setFetchedAt(Date.now()); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accountId]);

  async function setStatus(commentId: string, status: Status) {
    await fetch("/api/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId, status }),
    });
    load();
  }

  const leads = data?.leads || [];
  const filtered = statusFilter === "all"
    ? leads
    : leads.filter((l) => (l.status || "new") === statusFilter);
  const t = data?.totals || { saved: 0, new: 0, contacted: 0, converted: 0, lost: 0 };
  const conversionRate = t.saved > 0 ? Math.round((t.converted / t.saved) * 100) : 0;

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div className="text-xs text-gray-500">
          {t.saved} leads saved · {conversionRate}% converted
        </div>
        <LiveIndicator fetchedAt={fetchedAt} latencyMs={data?.latencyMs ?? null} loading={loading} onRefresh={load} />
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <FunnelStep label="Saved" value={t.saved} color="bg-violet-500" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <FunnelStep label="New (needs action)" value={t.new} color="bg-violet-400" active={statusFilter === "new"} onClick={() => setStatusFilter("new")} />
        <FunnelStep label="Contacted" value={t.contacted} color="bg-blue-500" active={statusFilter === "contacted"} onClick={() => setStatusFilter("contacted")} />
        <FunnelStep label="Converted" value={t.converted} color="bg-green-500" active={statusFilter === "converted"} onClick={() => setStatusFilter("converted")} />
      </div>

      {loading && leads.length === 0 && <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>}
      {!loading && leads.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <div className="text-sm font-medium text-gray-700">No leads saved yet</div>
          <div className="text-xs text-gray-400 mt-1">Go to the Inbox, find a real lead, click <b>“Save to CRM”</b>. It will appear here.</div>
        </div>
      )}
      {!loading && filtered.length === 0 && leads.length > 0 && (
        <div className="text-gray-400 text-sm py-6 text-center">No leads with status “{STATUS_LABEL[statusFilter as Status] || statusFilter}”.</div>
      )}

      <div className="space-y-2">
        {filtered.map((l) => (
          <LeadRow key={l.comment_id || (l.comment + (l.saved_at || ""))} lead={l} onStatus={setStatus} />
        ))}
      </div>
    </>
  );
}

function FunnelStep({ label, value, color, active, onClick }: { label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl border p-4 transition ${active ? "border-violet-500 ring-2 ring-violet-100" : "border-gray-100 hover:border-gray-200"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </button>
  );
}

function LeadRow({ lead, onStatus }: { lead: SavedLead; onStatus: (cid: string, s: Status) => void }) {
  const cid = lead.comment_id || "";
  const status: Status = lead.status || "new";
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">@{lead.ig_username || "unknown"}</span>
          <span className="text-xs text-gray-400">{lead.account}</span>
          {lead.reason && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
              🎯 {lead.reason}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <span className="text-xs text-gray-400 shrink-0">saved {timeAgo(lead.saved_at)} ago</span>
      </div>

      <p className="text-sm text-gray-800 mb-1">{lead.comment}</p>
      {lead.post_url && (
        <a href={lead.post_url} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-violet-600">
          on post ↗
        </a>
      )}

      <div className="flex items-center gap-1.5 mt-3">
        {(["new", "contacted", "converted", "lost"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => onStatus(cid, s)}
            disabled={status === s || !cid}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${
              status === s
                ? `${STATUS_COLOR[s]} font-medium`
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            } disabled:opacity-50`}
          >
            {status === s ? "✓ " : "→ "}{STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
