"use client";
import { useEffect, useState } from "react";
import { IconBell, IconCalendarEvent, IconClock } from "@tabler/icons-react";
import { showToast } from "@/app/(dashboard)/dashboard/preview/Toast";
import { PAGES, SETTINGS, type PostingLimit } from "@/lib/app-settings";
import { loadAppSettings, useAppSettings } from "@/lib/use-app-settings";
import { builtInTaskMinutes } from "@/lib/task-estimate";
import { useContentTypes } from "@/lib/use-content-types";
import { TEAM_NAMES } from "@/lib/team-names";

// The numbers the dashboard runs on, changed by an admin on the Rules page (27 Oct):
// Scheduler → posting limits, My Day → default time per task type, Notifications →
// when the due-today reminder starts. Saved in mh_settings (sql/042); every screen
// reads them through lib/app-settings.ts.

const PAGE_LABEL: Record<string, string> = { "GooCampus Main": "GooCampus Main", "GooCampus World": "GooCampus World", "12Plus / GC India": "12th Plus" };
type Meta = Record<string, { at: string; by: string | null }>;

export function RuleSettings({ tab }: { tab: string }) {
  useAppSettings();
  const types = useContentTypes();
  const [meta, setMeta] = useState<Meta>({});
  const [canEdit, setCanEdit] = useState(false);
  const loadMeta = () => fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).then((d) => { setMeta(d.meta || {}); setCanEdit(!!d.canEdit); }).catch(() => {});
  useEffect(() => { void loadMeta(); }, []);
  const save = async (key: string, value: unknown, done: string) => {
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { showToast({ who: "Couldn't save", body: d.error || `HTTP ${r.status}`, color: "#C03221", av: "!" }); return false; }
    await loadAppSettings(true); await loadMeta();
    showToast({ who: "Saved", body: done, color: "#1AA053", av: "✓" });
    return true;
  };
  const lastChanged = (k: string) => meta[k] ? `Last changed by ${TEAM_NAMES[meta[k].by || ""] || meta[k].by || "an admin"} · ${new Date(meta[k].at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Built-in values — not changed yet";

  if (tab === "scheduler") {
    const start = Object.fromEntries(PAGES.map((p) => [p, { ...SETTINGS.posting[p] }])) as Record<string, PostingLimit>;
    return <Card key={`posting-${JSON.stringify(start)}`} icon={<IconCalendarEvent size={16} stroke={1.8} />} title="Posting limits"
      sub="How many posts a page can take in a day, and how far apart. Going over warns before posting." foot={lastChanged("posting")} canEdit={canEdit}
      start={start} count={(a, b) => PAGES.reduce((n, p) => n + Number(a[p].min !== b[p].min) + Number(a[p].max !== b[p].max) + Number(a[p].gap !== b[p].gap), 0)}
      onSave={(v) => save("posting", v, "Posting limits — the Scheduler uses them from now on.")}
      head={["Page", "Posts a day", "Gap between posts"]}
      rows={(v, set) => PAGES.map((p) => (
        <tr key={p} className={v[p].min !== start[p].min || v[p].max !== start[p].max || v[p].gap !== start[p].gap ? "bg-[#FAFBFF]" : ""}>
          <td className="px-4 py-2.5 text-[13.5px] text-[#232D42]">{PAGE_LABEL[p]}</td>
          <td className="px-4 py-2.5"><Num v={v[p].min} min={0} max={v[p].max} on={(n) => set({ ...v, [p]: { ...v[p], min: n } })} disabled={!canEdit} />
            <span className="mx-2 text-[#8A92A6]">to</span><Num v={v[p].max} min={Math.max(1, v[p].min)} max={20} on={(n) => set({ ...v, [p]: { ...v[p], max: n } })} disabled={!canEdit} /></td>
          <td className="px-4 py-2.5"><Num v={v[p].gap} step={15} min={0} max={720} on={(n) => set({ ...v, [p]: { ...v[p], gap: n } })} disabled={!canEdit} /><span className="ml-2 text-[12.5px] text-[#8A92A6]">min</span></td>
        </tr>
      ))} />;
  }
  if (tab === "my-day") {
    const start = Object.fromEntries(types.map((t) => [t, SETTINGS.taskMinutes[t] || builtInTaskMinutes(t)])) as Record<string, number>;
    return <Card key={`est-${JSON.stringify(start)}`} icon={<IconClock size={16} stroke={1.8} />} title="Default time per task type"
      sub="Used only when nobody has set a time on the task. Today's plan, Workload and Team Command use it." foot={lastChanged("taskMinutes")} canEdit={canEdit}
      start={start} count={(a, b) => types.filter((t) => a[t] !== b[t]).length}
      // Only types that differ from the built-in rule are stored.
      onSave={(v) => save("taskMinutes", Object.fromEntries(types.filter((t) => v[t] !== builtInTaskMinutes(t)).map((t) => [t, v[t]])), "Default times — plans and workloads use them from now on.")}
      head={["Type of content", "Default time"]}
      rows={(v, set) => types.map((t) => (
        <tr key={t} className={v[t] !== start[t] ? "bg-[#FAFBFF]" : ""}>
          <td className="px-4 py-2.5 text-[13.5px] text-[#232D42]">{t}</td>
          <td className="px-4 py-2.5"><Num v={v[t]} step={15} min={15} max={600} on={(n) => set({ ...v, [t]: n })} disabled={!canEdit} /><span className="ml-2 text-[12.5px] text-[#8A92A6]">min</span></td>
        </tr>
      ))} />;
  }
  if (tab === "notify") {
    const start = { h: SETTINGS.remindHours };
    return <Card key={`rem-${start.h}`} icon={<IconBell size={16} stroke={1.8} />} title="Due-today reminder"
      sub="When the owner is nudged about a task due today." foot={lastChanged("remindHours")} canEdit={canEdit}
      start={start} count={(a, b) => Number(a.h !== b.h)} onSave={(v) => save("remindHours", v.h, "Reminder time.")}
      rows={(v, set) => [(
        <tr key="h"><td className="px-4 py-3 text-[13.5px] text-[#232D42]"><div className="font-medium">Start reminding</div><div className="text-[12.5px] text-[#8A92A6]">before the end of the owner&apos;s shift, while there&apos;s still time to finish</div></td>
          <td className="px-4 py-3 whitespace-nowrap"><Num v={v.h} min={1} max={8} on={(n) => set({ h: n })} disabled={!canEdit} /><span className="ml-2 text-[12.5px] text-[#8A92A6]">hours before the day ends</span></td></tr>
      )]} />;
  }
  return null;
}

function Card<T>({ icon, title, sub, foot, canEdit, start, count, onSave, head, rows }: {
  icon: React.ReactNode; title: string; sub: string; foot: string; canEdit: boolean; start: T;
  count: (a: T, b: T) => number; onSave: (v: T) => Promise<boolean>; head?: string[];
  rows: (v: T, set: (v: T) => void) => React.ReactNode[];
}) {
  const [v, setV] = useState<T>(start);
  const [busy, setBusy] = useState(false);
  const n = count(v, start);
  return (
    <section className="bg-white border border-gray-100 rounded-2xl">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-brand-light text-brand flex items-center justify-center flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0"><h2 className="text-[16px] font-medium text-[#232D42]">{title}</h2><div className="text-[12.5px] text-[#8A92A6]">{sub}</div></div>
        <span className={`text-[11px] rounded-full px-2.5 py-0.5 whitespace-nowrap ${canEdit ? "bg-emerald-50 text-emerald-700" : "bg-[#F1F3F9] text-[#6B7487]"}`}>{canEdit ? "You can change it" : "Admins can change it"}</span>
      </div>
      <table className="w-full border-collapse">
        {head && <thead><tr>{head.map((h) => <th key={h} className="text-left text-[11px] tracking-wide font-medium text-[#8A92A6] px-4 pt-3 pb-1.5 uppercase">{h}</th>)}</tr></thead>}
        <tbody className="[&>tr]:border-t [&>tr]:border-gray-100">{rows(v, setV)}</tbody>
      </table>
      <div className="flex items-center gap-2.5 px-5 py-3 border-t border-gray-100 flex-wrap">
        <span className="mr-auto text-[12px] text-[#8A92A6]">{n ? `${n} change${n > 1 ? "s" : ""} not saved yet.` : foot}</span>
        {canEdit && <>
          <button disabled={!n || busy} onClick={() => setV(start)} className="h-9 px-3.5 rounded-lg border border-gray-200 text-[13px] font-medium text-[#232D42] disabled:opacity-45">Undo changes</button>
          <button disabled={!n || busy} onClick={async () => { setBusy(true); await onSave(v); setBusy(false); }} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-brand-dark disabled:opacity-45">Save</button>
        </>}
      </div>
    </section>
  );
}

function Num({ v, on, min, max, step = 1, disabled }: { v: number; on: (n: number) => void; min: number; max: number; step?: number; disabled?: boolean }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const btn = "w-8 h-[34px] text-[16px] text-[#4A5468] hover:text-brand hover:bg-[#F6F7FB] disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <span className="inline-flex items-center border border-[#E3E6EE] rounded-[9px] overflow-hidden h-[34px] align-middle">
      <button type="button" className={btn} disabled={disabled || v <= min} onClick={() => on(clamp(v - step))}>−</button>
      <input value={v} disabled={disabled} onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) on(clamp(n)); }}
        className="w-12 h-[34px] text-center text-[14px] text-[#232D42] border-x border-[#E3E6EE] outline-none disabled:bg-white" />
      <button type="button" className={btn} disabled={disabled || v >= max} onClick={() => on(clamp(v + step))}>+</button>
    </span>
  );
}
