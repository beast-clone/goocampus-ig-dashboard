"use client";

import { useEffect, useState } from "react";
import { IconAlertTriangle, IconChevronDown, IconCircleCheck, IconCoin, IconClock } from "@tabler/icons-react";

// What every AI run in Content Studio actually did — Playbooks and Create together.
//
// ai_usage already knew the bill. It did not know the work: every playbook run logged
// the word "playbook", so two hundred rows looked identical and none said which
// playbook, what was asked of it, or whether somebody replaced the framework with their
// own prompt. The columns for that arrive with sql/024_ai_usage_detail.sql.
//
// Admin only — it carries free text the team typed and the money each run spent.

type Run = {
  id: string; at: string; where: string; what: string; task: string | null;
  usedCustom: boolean; customPrompt: string | null;
  tokens: number; promptTokens: number; completionTokens: number;
  cost: number | null; seconds: number | null; by: string | null;
  model: string; ok: boolean; error: string | null;
};
type Resp = {
  runs: Run[];
  totals: { runs: number; tokens: number; cost: number; failed: number; custom: number };
  days: number;
};

const RANGES = [7, 30, 90] as const;
const money = (n: number) => `$${n.toFixed(2)}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export function UsageReport() {
  const [data, setData] = useState<Resp | null>(null);
  const [days, setDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null); setNeedsMigration(false);
    fetch(`/api/content/usage?days=${days}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setError(d?.error || `HTTP ${r.status}`); setNeedsMigration(!!d?.needsMigration); return; }
        setData(d);
      })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [days]);

  if (needsMigration) {
    return (
      <Panel>
        <div className="flex items-start gap-2.5">
          <IconAlertTriangle size={18} className="text-[#B7791F] shrink-0 mt-0.5" />
          <div className="text-[13px] text-[#232D42]">
            <b className="font-semibold">One SQL file to run first.</b>
            <p className="text-[#8A92A6] mt-1">
              The report needs the detail columns from <code className="text-[12px] bg-[#F3F5F9] px-1 py-0.5 rounded">sql/024_ai_usage_detail.sql</code>.
              Run it in the Supabase SQL editor on <b className="font-medium">Beast Clone</b>, then reload.
            </p>
          </div>
        </div>
      </Panel>
    );
  }
  if (error) return <Panel><div className="text-[13px] text-[#C03221]">{error}</div><div className="text-[12px] text-[#8A92A6] mt-1">This report is for admins.</div></Panel>;
  if (!data) return <Panel><div className="text-[13px] text-[#8A92A6]">Loading…</div></Panel>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-[15px] font-semibold text-[#232D42]">What the AI has been doing</h2>
        <span className="text-[12.5px] text-[#8A92A6]">Playbooks and Create, newest first</span>
        <div className="ml-auto flex gap-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)}
              className={`text-[12px] font-medium px-2.5 py-1 rounded-lg border transition ${
                days === r ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-200"}`}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="Runs" value={String(data.totals.runs)} />
        <Stat label="Tokens" value={data.totals.tokens.toLocaleString()} icon={<IconCoin size={14} />} />
        <Stat label="Spent" value={money(data.totals.cost)} />
        <Stat label="Own prompt" value={`${data.totals.custom} of ${data.totals.runs}`} />
      </div>

      {data.totals.failed > 0 && (
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-2.5">
          <IconAlertTriangle size={15} className="text-[#C03221] shrink-0" />
          <span className="text-[13px] text-[#232D42]">
            <b className="font-semibold">{data.totals.failed}</b> run{data.totals.failed === 1 ? "" : "s"} failed — they cost nothing but produced nothing.
          </span>
        </div>
      )}

      {data.runs.length === 0 ? (
        <Panel>
          <div className="text-[13px] text-[#232D42]">Nothing run in the last {days} days.</div>
          <div className="text-[12px] text-[#8A92A6] mt-1">Every Playbook and Create run will appear here.</div>
        </Panel>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#F7F8FC]">
                  {["When", "Where", "What", "Asked for", "Own prompt", "Tokens", "Cost", "Took", "By"].map((h) => (
                    <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#8A92A6] px-3 py-2.5 border-b border-gray-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <RunRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ r, open, onToggle }: { r: Run; open: boolean; onToggle: () => void }) {
  // The task and the custom prompt are the two long fields. They are truncated in the
  // row and opened underneath, because a table where one cell is a paragraph stops
  // being a table.
  const expandable = !!(r.task || r.customPrompt || r.error);
  return (
    <>
      <tr onClick={expandable ? onToggle : undefined}
        className={`border-b border-gray-100 last:border-0 ${expandable ? "cursor-pointer hover:bg-[#FBFCFE]" : ""} ${r.ok ? "" : "bg-[#FFF9F8]"}`}>
        <td className="px-3 py-2.5 text-[12.5px] text-[#8A92A6] whitespace-nowrap">{when(r.at)}</td>
        <td className="px-3 py-2.5 text-[12.5px] whitespace-nowrap">
          <span className="inline-block text-[11px] font-medium px-2 py-[2px] rounded-full bg-[#F3F5F9] text-[#4A5468]">{r.where}</span>
        </td>
        <td className="px-3 py-2.5 text-[13px] text-[#232D42] font-medium whitespace-nowrap">{r.what}</td>
        <td className="px-3 py-2.5 text-[12.5px] text-[#4A5468] max-w-[260px]">
          <span className="block truncate">{r.task || "—"}</span>
        </td>
        <td className="px-3 py-2.5 text-[12.5px] whitespace-nowrap">
          {r.usedCustom
            ? <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[2px] rounded-full bg-brand-light text-[#2138B0]">Yes</span>
            : <span className="text-[#A6ACBE]">No</span>}
        </td>
        <td className="px-3 py-2.5 text-[12.5px] text-[#4A5468] tabular-nums whitespace-nowrap">{r.tokens.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-[12.5px] text-[#4A5468] tabular-nums whitespace-nowrap">{r.cost != null ? money(r.cost) : "—"}</td>
        <td className="px-3 py-2.5 text-[12.5px] text-[#8A92A6] tabular-nums whitespace-nowrap">
          {r.seconds != null ? `${r.seconds}s` : "—"}
        </td>
        <td className="px-3 py-2.5 text-[12.5px] text-[#8A92A6] whitespace-nowrap">
          {r.by || "—"}
          {expandable && <IconChevronDown size={13} className={`inline ml-1.5 transition ${open ? "rotate-180" : ""}`} />}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100">
          <td colSpan={9} className="px-3 pb-3 pt-0 bg-[#FBFCFE]">
            <div className="space-y-2 pl-1">
              {r.task && <Field label="Asked for">{r.task}</Field>}
              {r.usedCustom && r.customPrompt && <Field label="Their own prompt">{r.customPrompt}</Field>}
              {r.error && <Field label="Failed with" danger>{r.error}</Field>}
              <div className="text-[11.5px] text-[#A6ACBE]">
                {r.model} · {r.promptTokens.toLocaleString()} in, {r.completionTokens.toLocaleString()} out
                {r.ok && <> · <IconCircleCheck size={11} className="inline -mt-0.5 text-[#0F6E3C]" /> finished</>}
                {r.seconds != null && <> · <IconClock size={11} className="inline -mt-0.5" /> {r.seconds}s</>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children, danger }: { label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A6ACBE] mb-0.5">{label}</div>
      <div className={`text-[12.5px] whitespace-pre-wrap leading-relaxed ${danger ? "text-[#C03221]" : "text-[#3B4457]"}`}>{children}</div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-[#A6ACBE] flex items-center gap-1">{icon}{label}</div>
      <div className="text-[17px] font-semibold text-[#232D42] tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-gray-100 rounded-2xl p-6">{children}</div>;
}
