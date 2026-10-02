"use client";

import { useCallback, useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import {
  IconRefresh, IconExternalLink, IconAlertTriangle, IconKey,
  IconPlayerPlay, IconPlayerPause, IconClock, IconRoute, IconPlus, IconX,
} from "@tabler/icons-react";

// System → Workflows.
//
// Every recurring job this dashboard depends on runs in n8n, because a Next.js route
// cannot schedule itself. That made them invisible from in here — the Airtable import
// sat switched off and the only way to notice was to open n8n.
//
// This lists ONLY the dashboard's jobs. The n8n account also runs the TezDM funnels,
// the voucher generator and the rest; a page showing forty unrelated workflows is a
// page nobody reads. Membership is derived from whether a workflow calls an
// /api/cron/* endpoint here, so it stays correct by itself. Anything else can be
// pinned on purpose with "Track another workflow".

type Run = { status: string; startedAt: string; ms: number | null };
type Flow = {
  id: string; name: string; active: boolean; pinned: boolean;
  schedule: string | null; endpoint: string | null; timezone: string | null;
  url: string; lastRun: Run | null;
};
type Other = { id: string; name: string; active: boolean };
type Payload = {
  connected: boolean; baseUrl: string; needsKey?: boolean; error?: string;
  checkedAt?: string; workflows: Flow[]; others: Other[];
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
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/n8n/workflows", { cache: "no-store" });
      setData(await res.json());
    } catch {
      setData({ connected: false, baseUrl: "", error: "Could not reach the dashboard API.", workflows: [], others: [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const track = async (id: string, label: string) => {
    setBusy(true);
    await fetch("/api/n8n/workflows", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: id, label }),
    });
    setPick("");
    setBusy(false);
    void load();
  };

  const untrack = async (id: string) => {
    setBusy(true);
    await fetch(`/api/n8n/workflows?workflowId=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    void load();
  };

  if (loading && !data) {
    return <div className="bg-white border border-gray-100 rounded-2xl p-8 text-[13px] text-[#8A92A6]">Reading n8n…</div>;
  }

  const live = data?.workflows ?? [];
  const on = live.filter((w) => w.active).length;

  return (
    <div className="space-y-3">
      <div className="bg-[#E9ECFB] border border-[#D4DAF4] rounded-2xl px-5 py-4 flex items-start gap-3">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-white text-[#3A57E8] shrink-0">
          <IconRoute size={17} stroke={1.8} />
        </span>
        <p className="text-[12.5px] leading-relaxed text-[#3A4A7A]">
          A page in this dashboard cannot put itself on a timer, so everything recurring —
          watching the notice boards, pulling Airtable, refreshing the radar — is an n8n
          workflow that calls an endpoint here on a schedule. Only those jobs are listed;
          the rest of the n8n account is left alone. If something stops updating, this is
          the first place to look.
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
            <span className="text-[13px] text-[#232D42] font-medium">{on} of {live.length} running</span>
            {data.checkedAt ? <span className="text-[12px] text-[#8A92A6]">checked {ago(data.checkedAt)}</span> : null}
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
              live.map((w, i) => (
                <Row key={w.id} flow={w} first={i === 0} busy={busy} onUntrack={() => void untrack(w.id)} />
              ))
            )}
          </div>

          {/* Everything else in the account stays out of the list above, but can be
              pinned here when somebody wants to keep an eye on it. */}
          <div className="bg-white border border-dashed border-[#D9DEEA] rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#F6F7FB] text-[#A6ACBE] shrink-0">
                <IconPlus size={17} stroke={1.8} />
              </span>
              <div>
                <div className="text-[13.5px] font-semibold text-[#232D42]">Track another workflow</div>
                <p className="text-[12px] text-[#8A92A6] mt-0.5">
                  Add one of the other {data.others.length} workflows in n8n to this list. It only
                  changes what you see here — nothing in n8n is altered.
                </p>
              </div>
            </div>

            {data.others.length > 0 ? (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <label htmlFor="wf-pick" className="sr-only">Workflow to track</label>
                <select
                  id="wf-pick"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className="flex-1 min-w-[240px] text-[13px] text-[#232D42] bg-white border border-[#D9DEEA] rounded-lg px-3 min-h-[38px]"
                >
                  <option value="">Choose a workflow…</option>
                  {data.others.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}{o.active ? "" : "  (off)"}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!pick || busy}
                  onClick={() => {
                    const chosen = data.others.find((o) => o.id === pick);
                    if (chosen) void track(chosen.id, chosen.name);
                  }}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white bg-[#3A57E8] rounded-lg px-4 min-h-[38px] disabled:opacity-40"
                >
                  Track
                </button>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#8A92A6] mt-3">
                Every workflow in the account is already on the list.
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ flow, first, busy, onUntrack }: { flow: Flow; first: boolean; busy: boolean; onUntrack: () => void }) {
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
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#C0392B] bg-[#FDEBEB] rounded px-1.5 py-0.5">Off</span>
          ) : null}
          {flow.pinned ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5A6478] bg-[#F1F3F9] rounded px-1.5 py-0.5" title="Added by hand, not one of the dashboard's own jobs">
              Tracked
            </span>
          ) : null}
          {flow.timezone && flow.timezone !== "Asia/Kolkata" ? (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide text-[#8A5109] bg-[#FBEEDA] rounded px-1.5 py-0.5"
              title="Not on IST — it will not fire at the time its name says"
            >
              {flow.timezone}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3 flex-wrap mt-1 text-[12px] text-[#8A92A6]">
          {flow.schedule ? (
            <span className="inline-flex items-center gap-1"><IconClock size={13} stroke={1.8} /> {flow.schedule}</span>
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
              {ago(r.startedAt)}{r.ms != null ? ` · ${(r.ms / 1000).toFixed(1)}s` : ""}
            </div>
          </>
        ) : (
          <div className="text-[12px] text-[#8A92A6]">never run</div>
        )}
        <div className="flex items-center gap-2 justify-end mt-1">
          {flow.pinned ? (
            <button
              type="button"
              onClick={onUntrack}
              disabled={busy}
              className="inline-flex items-center gap-0.5 text-[11.5px] text-[#8A92A6] disabled:opacity-40"
              title="Stop showing this one here"
            >
              <IconX size={11} stroke={2} /> Untrack
            </button>
          ) : null}
          <a href={flow.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-[#3A57E8]">
            Open <IconExternalLink size={11} stroke={2} />
          </a>
        </div>
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
          The key is read only on the server, never in your browser. Nothing on this page can start, stop or edit
          a workflow — and connecting does not list your other workflows, only the ones that call this dashboard.
        </p>
      </div>
    </div>
  );
}
