"use client";

import { useCallback, useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import {
  IconRefresh, IconExternalLink, IconAlertTriangle, IconKey,
  IconPlayerPlay, IconPlayerPause, IconClock, IconRoute,
} from "@tabler/icons-react";

// System → Workflows.
//
// Every recurring job this dashboard depends on runs in n8n, not in the dashboard:
// a Next.js route cannot schedule itself, so each one is an n8n workflow calling an
// /api/cron/* endpoint. That made them invisible from in here — the Airtable import
// sat switched off for hours and the only way to notice was to open n8n.
//
// This page is the register: what exists, whether it is on, and when it last ran.

type Run = { status: string; startedAt: string; ms: number | null };
type Flow = {
  id: string; name: string; active: boolean;
  schedule: string | null; endpoint: string | null; timezone: string | null;
  url: string; lastRun: Run | null;
};
type Payload = {
  connected: boolean; baseUrl: string; needsKey?: boolean; error?: string;
  checkedAt?: string; workflows: Flow[];
};

export default function WorkflowsPage() {
  return (
    <PreviewDashboardShell
      active="workflows"
      title="Workflows"
      hideAccountPicker
      hideRange
      subtitle="The scheduled jobs that keep this dashboard fed. They run in n8n, not in here."
    >
      {() => <Workflows />}
    </PreviewDashboardShell>
  );
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

function Workflows() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/n8n/workflows", { cache: "no-store" });
      setData(await res.json());
    } catch {
      setData({ connected: false, baseUrl: "", error: "Could not reach the dashboard API.", workflows: [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className="bg-white border border-gray-100 rounded-2xl p-8 text-[13px] text-[#8A92A6]">Reading n8n…</div>;
  }

  const live = data?.workflows ?? [];
  const on = live.filter((w) => w.active).length;

  return (
    <div className="space-y-3">
      {/* Why this page exists, said once. */}
      <div className="bg-[#E9ECFB] border border-[#D4DAF4] rounded-2xl px-5 py-4 flex items-start gap-3">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-white text-[#3A57E8] shrink-0">
          <IconRoute size={17} stroke={1.8} />
        </span>
        <p className="text-[12.5px] leading-relaxed text-[#3A4A7A]">
          A page in this dashboard cannot put itself on a timer, so everything recurring —
          watching the notice boards, pulling Airtable, refreshing the radar — is an n8n
          workflow that calls an endpoint here on a schedule. If something stops updating,
          this is the first place to look.
        </p>
      </div>

      {data?.needsKey ? <NeedsKey baseUrl={data.baseUrl} /> : null}

      {data && !data.connected && !data.needsKey ? (
        <div className="bg-white border border-[#F3C9C9] rounded-2xl p-5 flex items-start gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#FDEBEB] text-[#C0392B] shrink-0">
            <IconAlertTriangle size={18} stroke={1.8} />
          </span>
          <div>
            <div className="text-[13.5px] font-semibold text-[#232D42]">Could not reach n8n</div>
            <p className="text-[12.5px] text-[#8A92A6] mt-0.5">{data.error}</p>
          </div>
        </div>
      ) : null}

      {data?.connected ? (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-[#232D42] font-medium">
              {on} of {live.length} running
            </span>
            {data.checkedAt ? (
              <span className="text-[12px] text-[#8A92A6]">checked {ago(data.checkedAt)}</span>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#3A57E8] border border-[#D4DAF4] rounded-lg px-3 py-1.5 min-h-[34px] disabled:opacity-50"
            >
              <IconRefresh size={14} stroke={1.9} />
              {loading ? "Checking…" : "Refresh"}
            </button>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            {live.length === 0 ? (
              <div className="p-8 text-[13px] text-[#8A92A6]">
                No workflow in n8n currently calls an <code>/api/cron/</code> endpoint on this dashboard.
              </div>
            ) : (
              live.map((w, i) => <Row key={w.id} flow={w} first={i === 0} />)
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ flow, first }: { flow: Flow; first: boolean }) {
  const r = flow.lastRun;
  const failed = r && r.status !== "success";
  return (
    <div className={`px-5 py-4 flex items-start gap-3 flex-wrap ${first ? "" : "border-t border-gray-100"}`}>
      <span
        className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${
          flow.active ? "bg-[#E4F3EA] text-[#19A974]" : "bg-[#F6F7FB] text-[#A6ACBE]"
        }`}
        title={flow.active ? "Running" : "Switched off"}
      >
        {flow.active ? <IconPlayerPlay size={16} stroke={1.9} /> : <IconPlayerPause size={16} stroke={1.9} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold text-[#232D42]">{flow.name}</span>
          {!flow.active ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#C0392B] bg-[#FDEBEB] rounded px-1.5 py-0.5">
              Off
            </span>
          ) : null}
          {flow.timezone && flow.timezone !== "Asia/Kolkata" ? (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide text-[#8A5109] bg-[#FBEEDA] rounded px-1.5 py-0.5"
              title="Not on IST — its clock time will not be what the name says"
            >
              {flow.timezone}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3 flex-wrap mt-1 text-[12px] text-[#8A92A6]">
          {flow.schedule ? (
            <span className="inline-flex items-center gap-1">
              <IconClock size={13} stroke={1.8} /> {flow.schedule}
            </span>
          ) : null}
          {flow.endpoint ? <code className="text-[11.5px] text-[#5A6478]">{flow.endpoint}</code> : null}
        </div>
      </div>

      <div className="text-right shrink-0">
        {r ? (
          <>
            <div className={`text-[12.5px] font-medium ${failed ? "text-[#C0392B]" : "text-[#19A974]"}`}>
              {failed ? r.status : "success"}
            </div>
            <div className="text-[11.5px] text-[#8A92A6] mt-0.5">
              {ago(r.startedAt)}
              {r.ms != null ? ` · ${(r.ms / 1000).toFixed(1)}s` : ""}
            </div>
          </>
        ) : (
          <div className="text-[12px] text-[#8A92A6]">never run</div>
        )}
        <a
          href={flow.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11.5px] text-[#3A57E8] mt-1"
        >
          Open <IconExternalLink size={11} stroke={2} />
        </a>
      </div>
    </div>
  );
}

function NeedsKey({ baseUrl }: { baseUrl: string }) {
  return (
    <div className="bg-white border border-dashed border-[#D9DEEA] rounded-2xl p-5 flex items-start gap-3">
      <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#F6F7FB] text-[#A6ACBE] shrink-0">
        <IconKey size={18} stroke={1.8} />
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-[#232D42]">Connect n8n to see live status</div>
        <p className="text-[12.5px] text-[#8A92A6] mt-1 leading-relaxed">
          This page reads n8n over its API, which needs a key. In n8n go to{" "}
          <strong className="text-[#5A6478]">Settings → n8n API → Create an API key</strong>, then add it to the
          dashboard&rsquo;s environment as <code className="text-[#5A6478]">N8N_API_KEY</code>. Set{" "}
          <code className="text-[#5A6478]">N8N_BASE_URL</code> too if the instance ever moves — it currently
          defaults to <span className="text-[#5A6478]">{baseUrl}</span>.
        </p>
        <p className="text-[12.5px] text-[#8A92A6] mt-2">
          The key is read only on the server. Nothing on this page can start, stop or edit a workflow.
        </p>
      </div>
    </div>
  );
}
