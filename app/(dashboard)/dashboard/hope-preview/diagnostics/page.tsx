"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import {
  IconRefresh, IconShieldCheck, IconAlertTriangle, IconTool, IconCpu, IconClock, IconBolt,
  IconDatabase, IconX, IconHistory, IconServer, IconPlugConnected, IconKey, IconTrash,
} from "@tabler/icons-react";

type SysAction = { type: "reconnect" | "add-key" | "clear-cache"; label: string; provider?: string };
type SystemResult = { key: string; name: string; category: string; status: "ok" | "warn" | "error"; detail: string; expiresAt: number | null; latencyMs: number | null; repair?: { action: string; result: string; note: string }; action?: SysAction };
type Host = { rssMB: number; heapUsedMB: number; heapTotalMB: number; sysTotalMB: number; sysFreeMB: number; uptimeSec: number; node: string; platform: string; cpuLoad1: number | null };
type Summary = { checked: number; healthy: number; warn: number; error: number; repaired: number; needsYou: number };
type Report = { ranAt: number; trigger: string; summary: Summary; systems: SystemResult[]; repairs: { system: string; action: string; result: string; note: string }[]; host: Host; durationMs: number };
type HistRow = { id: string; ran_at: string; trigger: string; summary: Summary; duration_ms: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(r: any): Report {
  return { ranAt: +new Date(r.ran_at), trigger: r.trigger, summary: r.summary, systems: r.systems || [], repairs: r.repairs || [], host: r.host || {}, durationMs: r.duration_ms };
}
const fmtUptime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };
function relTime(ms: number) { const d = Math.round((Date.now() - ms) / 60000); if (d < 1) return "just now"; if (d < 60) return `${d}m ago`; const h = Math.floor(d / 60); if (h < 24) return `${h}h ago`; return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }

const PILL: Record<string, string> = {
  ok: "bg-[#1aa053]/10 text-[#1aa053]",
  warn: "bg-amber-100/70 text-amber-700",
  error: "bg-rose-100/70 text-rose-700",
};
const PILL_LABEL: Record<string, string> = { ok: "Healthy", warn: "Warning", error: "Needs you" };
const CAT_ICON: Record<string, typeof IconServer> = { Database: IconDatabase, Social: IconPlugConnected, Data: IconServer, Messaging: IconPlugConnected, AI: IconBolt, Scraping: IconServer };

export default function DiagnosticsPage() {
  return (
    <HopeDashboardShell active="diagnostics" title="Diagnostics" subtitle="One click checks every system, auto-repairs what it safely can, and flags the rest. Runs daily at 5 AM." hideAccountPicker>
      {() => <DiagnosticsBody />}
    </HopeDashboardShell>
  );
}

function DiagnosticsBody() {
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [reconnect, setReconnect] = useState<{ provider: string; name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const loadHistory = useCallback(async () => {
    try { const r = await fetch("/api/diagnostics/history"); const d = await r.json(); setHistory(d.runs || []); return (d.runs || []) as HistRow[]; } catch { return []; }
  }, []);

  useEffect(() => { (async () => {
    const runs = await loadHistory();
    if (runs[0]) { try { const r = await fetch(`/api/diagnostics/history?id=${runs[0].id}`); const d = await r.json(); if (d.run) setReport(fromRow(d.run)); } catch { /* ignore */ } }
    setLoading(false);
  })(); }, [loadHistory]);

  const run = useCallback(async () => {
    setRunning(true);
    try { const r = await fetch("/api/diagnostics/run", { method: "POST" }); const d = await r.json(); if (r.ok) { setReport(d); flash(d.summary.repaired ? `${d.summary.repaired} issue${d.summary.repaired === 1 ? "" : "s"} auto-repaired` : "All checks complete"); } loadHistory(); }
    catch { flash("Run failed — check your connection"); }
    finally { setRunning(false); }
  }, [loadHistory]);

  const openRun = useCallback(async (id: string) => {
    setShowHistory(false);
    try { const r = await fetch(`/api/diagnostics/history?id=${id}`); const d = await r.json(); if (d.run) setReport(fromRow(d.run)); } catch { /* ignore */ }
  }, []);

  const doAction = useCallback(async (a: SysAction, name: string) => {
    if (a.type === "reconnect" && a.provider) { setReconnect({ provider: a.provider, name }); return; }
    if (a.type === "clear-cache") { try { const r = await fetch("/api/diagnostics/clear-cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const d = await r.json(); flash(`Cleared ${d.cleared} cache entr${d.cleared === 1 ? "y" : "ies"} — re-running`); run(); } catch { flash("Couldn't clear cache"); } return; }
    if (a.type === "add-key") { flash(`Add the key in .env.local, then re-run diagnostics`); }
  }, [run]);

  const s = report?.summary;
  const host = report?.host;
  const avgLatency = useMemo(() => {
    const ls = (report?.systems || []).map((x) => x.latencyMs).filter((x): x is number => typeof x === "number");
    return ls.length ? Math.round(ls.reduce((a, b) => a + b, 0) / ls.length) : null;
  }, [report]);

  if (loading) return <div className="text-sm text-gray-500 py-10 text-center"><span className="inline-block w-5 h-5 border-2 border-gray-200 border-t-brand rounded-full animate-spin align-middle mr-2" />Loading last diagnostics…</div>;

  return (
    <div className="relative">
      {/* run bar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-xs text-gray-500">
          {report ? <>Last run <b className="text-[#232D42]">{relTime(report.ranAt)}</b> · {report.trigger === "cron" ? "scheduled 5 AM" : "manual"} · {report.summary.checked} systems · {report.durationMs} ms</> : "No diagnostics yet — run your first check."}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-medium bg-white text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-brand/40 hover:text-brand inline-flex items-center gap-1.5"><IconHistory size={15} stroke={1.8} /> History</button>
          <button onClick={run} disabled={running} className="text-xs font-medium bg-brand text-white px-4 py-1.5 rounded-lg hover:bg-brand-dark disabled:opacity-60 inline-flex items-center gap-1.5">
            <IconRefresh size={15} stroke={1.8} className={running ? "animate-spin" : ""} /> {running ? "Scanning & repairing…" : "Run diagnostics & auto-repair"}
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">Past runs</div>
          {history.length === 0 ? <div className="px-4 py-3 text-xs text-gray-500">No stored runs yet.</div> : (
            <ul className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id}><button onClick={() => openRun(h.id)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 text-xs">
                  <span className="text-[#232D42] font-medium w-32">{new Date(h.ran_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  <span className="text-gray-400">{h.trigger === "cron" ? "5 AM auto" : "manual"}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-[#1aa053]">{h.summary.healthy} ok</span>
                    {h.summary.repaired > 0 && <span className="text-brand">{h.summary.repaired} fixed</span>}
                    {h.summary.needsYou > 0 && <span className="text-rose-600">{h.summary.needsYou} needs you</span>}
                  </span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {report && s && (
        <>
          {/* summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
            <SumCard label="Checked" value={s.checked} tint="#8A92A6" />
            <SumCard label="Healthy" value={s.healthy} tint="#1aa053" />
            <SumCard label="Auto-repaired" value={s.repaired} tint="#3A57E8" />
            <SumCard label="Needs you" value={s.needsYou} tint="#c03221" />
          </div>

          {/* host health */}
          {host && (
            <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100">
                <span className="w-7 h-7 rounded-lg grid place-items-center bg-brand-light text-brand"><IconServer size={15} stroke={1.8} /></span>
                <h2 className="text-sm font-medium text-[#232D42]">Host health</h2>
                <span className="ml-auto text-[11px] text-gray-400">{host.platform} · Node {host.node}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-50">
                <HostStat icon={<IconCpu size={15} stroke={1.8} />} label="App memory" value={`${host.rssMB} MB`} sub={`heap ${host.heapUsedMB}/${host.heapTotalMB} MB`} />
                <HostStat icon={<IconServer size={15} stroke={1.8} />} label="System RAM" value={`${(host.sysTotalMB - host.sysFreeMB).toLocaleString("en-IN")} / ${host.sysTotalMB.toLocaleString("en-IN")} MB`} sub={host.cpuLoad1 != null ? `load ${host.cpuLoad1}` : "used / total"} />
                <HostStat icon={<IconClock size={15} stroke={1.8} />} label="Uptime" value={fmtUptime(host.uptimeSec)} sub="since last restart" />
                <HostStat icon={<IconBolt size={15} stroke={1.8} />} label="Avg response" value={avgLatency != null ? `${avgLatency} ms` : "—"} sub="across live services" />
              </div>
            </div>
          )}

          {/* systems */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg grid place-items-center bg-brand-light text-brand"><IconShieldCheck size={15} stroke={1.8} /></span>
              <h2 className="text-sm font-medium text-[#232D42]">Systems</h2>
              <span className="text-[11px] text-gray-400">· {s.checked} checked</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {report.systems.map((sys) => {
                const Icon = CAT_ICON[sys.category] || IconServer;
                return (
                  <li key={sys.key} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 w-8 h-8 rounded-lg grid place-items-center bg-gray-50 text-gray-500 shrink-0"><Icon size={17} stroke={1.7} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[#232D42]">{sys.name}</span>
                        {sys.latencyMs != null && <span className="text-[10.5px] text-gray-400">{sys.latencyMs} ms</span>}
                      </div>
                      <div className="text-[12px] text-gray-500 mt-0.5">{sys.detail}</div>
                      {sys.repair?.result === "fixed" && <div className="text-[11.5px] text-brand mt-1 inline-flex items-center gap-1"><IconTool size={12} stroke={1.9} /> Auto-repaired — {sys.repair.note}</div>}
                      {sys.repair?.result === "failed" && <div className="text-[11.5px] text-rose-600 mt-1 inline-flex items-center gap-1"><IconAlertTriangle size={12} stroke={1.9} /> {sys.repair.note}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${PILL[sys.status]}`}>{PILL_LABEL[sys.status]}</span>
                      {sys.action && (
                        <button onClick={() => doAction(sys.action!, sys.name)} className="text-[11.5px] font-medium text-brand border border-brand/25 px-2.5 py-1 rounded-lg hover:bg-brand hover:text-white transition inline-flex items-center gap-1">
                          {sys.action.type === "reconnect" ? <IconPlugConnected size={13} stroke={1.9} /> : sys.action.type === "clear-cache" ? <IconTrash size={13} stroke={1.9} /> : <IconKey size={13} stroke={1.9} />}
                          {sys.action.label}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <div className="text-sm text-[#232D42] mb-1">No diagnostics run yet.</div>
          <div className="text-xs text-gray-500 mb-4">Run your first system check — it&apos;ll auto-repair what it can and flag the rest.</div>
          <button onClick={run} disabled={running} className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-60">{running ? "Scanning…" : "Run diagnostics"}</button>
        </div>
      )}

      {reconnect && <ReconnectModal info={reconnect} onClose={() => setReconnect(null)} onDone={(m) => { flash(m); run(); }} />}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#232D42] text-white text-xs px-4 py-2.5 rounded-lg">{toast}</div>}
    </div>
  );
}

function SumCard({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-[11.5px] text-gray-500 font-medium">{label}</div>
      <div className="text-2xl font-semibold leading-none mt-1.5" style={{ color: tint }}>{value}</div>
    </div>
  );
}
function HostStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">{icon}<span className="text-[11px] font-medium">{label}</span></div>
      <div className="text-[15px] font-semibold text-[#232D42] leading-tight">{value}</div>
      <div className="text-[10.5px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

const RECONNECT_HELP: Record<string, { url: string; how: string }> = {
  linkedin: { url: "https://www.linkedin.com/developers/tools/oauth/token-generator", how: "LinkedIn → Developers → OAuth token generator → pick your app + scopes → generate, then paste the access token here." },
  meta: { url: "https://developers.facebook.com/tools/explorer/", how: "Meta → Graph API Explorer → generate a User token with your scopes, then paste it here." },
};

function ReconnectModal({ info, onClose, onDone }: { info: { provider: string; name: string }; onClose: () => void; onDone: (m: string) => void }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const help = RECONNECT_HELP[info.provider];

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await fetch("/api/diagnostics/reconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: info.provider, token }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Reconnect failed");
      onClose(); onDone(`${info.name} reconnected — token saved`);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-medium text-[#232D42]">Reconnect {info.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          <div className="text-xs text-gray-600 bg-brand-light/50 border border-brand/15 rounded-lg p-3 mb-4 leading-relaxed">
            {help?.how || "Generate a fresh access token from the provider, then paste it below."} The new token is saved to the dashboard and used immediately — <b>no redeploy</b>.
          </div>
          {help && <a href={help.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline mb-3"><IconPlugConnected size={14} stroke={1.9} /> Open {info.name} token generator ↗</a>}
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Paste the new access token</label>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={4} placeholder="Paste the token here…" className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-brand/50 font-mono resize-none" />
          {err && <div className="text-xs text-rose-600 mt-2">{err}</div>}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-3">
          <button onClick={save} disabled={saving || token.trim().length < 20} className="text-xs font-medium bg-brand text-white px-4 py-1.5 rounded-lg hover:bg-brand-dark disabled:opacity-50">{saving ? "Saving…" : "Save & reconnect"}</button>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-900 ml-auto">Cancel</button>
        </div>
      </div>
    </div>
  );
}
