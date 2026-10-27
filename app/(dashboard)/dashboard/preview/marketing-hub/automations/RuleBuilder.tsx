"use client";
import { useEffect, useMemo, useState } from "react";
import { IconArrowDown, IconArrowUp, IconChevronDown, IconPlus, IconTrash, IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { showToast } from "@/app/(dashboard)/dashboard/preview/Toast";
import { FilterBuilder } from "@/components/FilterBuilder";
import { EMPTY_FILTER, isGroup, type FilterCondition, type FilterFieldDef, type FilterModel } from "@/lib/filter-model";
import { TASK_STATUSES } from "@/lib/statuses";
import { ALL_TYPES } from "@/lib/mh-content-types";
import { useSbus } from "@/lib/use-sbus";

// The rule builder (sql/037). Each rule reads like an Airtable automation:
//   When <a task is created / its status changes to … / it is saved>
//   and <conditions — the same filter panel as the Master sheet>
//   → <hand it to someone or the editors' pool / add a collaborator / keep the previous owner>.
// Rules run top to bottom; the FIRST matching rule that hands the task over wins, and
// every matching rule adds its collaborators. The database applies them, so the
// dashboard, the Airtable sync and n8n all follow the same rules.

type Spec = { on: "created" | "status" | "save"; statuses?: string[] };
type Action = { type: "owner" | "collaborator" | "keep_previous_owner"; to?: string };
type Rule = { id: string; name: string; active: boolean; position: number; trigger_spec: Spec; conditions: FilterModel | null; actions: Action[]; note: string | null };
type Person = { value: string; label: string; active: boolean };
const POOL = "__pool__";

const FIELD_LABEL: Record<string, string> = {
  status: "Status", previous_status: "Previous status", sbu: "Brand", type: "Type", kind: "Type of work",
  priority: "Priority", owner: "Owner", owner_role: "Owner's role", owner_is_creator: "Owner wrote it", owner_changed: "Owner just changed",
};
const FIELDS: FilterFieldDef<unknown>[] = Object.entries(FIELD_LABEL).map(([key, label]) => ({ key, label, type: "select", get: () => "" }));
const ROLES = [{ value: "writer", label: "Writer" }, { value: "designer", label: "Designer" }, { value: "editor", label: "Editor" }, { value: "manager", label: "Manager" }];
const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

export function RuleBuilder() {
  const sbus = useSbus();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [engineOn, setEngineOn] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [open, setOpen] = useState<string | null>(null);      // rule being edited ("new" for a new one)
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/marketing-hub/rules-engine", { cache: "no-store" }).then((r) => r.json()).then((d) => {
    setRules(d.rules || []); setPeople(d.people || []); setEngineOn(!!d.engineOn); setCanEdit(!!d.canEdit);
  }).catch(() => setRules([]));
  useEffect(() => { load(); }, []);

  const nameOf = (k?: string) => k === POOL ? "the editors' claim pool" : people.find((p) => p.value === k)?.label || k || "—";
  const activePeople = people.filter((p) => p.active).map(({ value, label }) => ({ value, label }));
  const optionsFor = useMemo(() => (key: string) => {
    switch (key) {
      case "status": case "previous_status": return TASK_STATUSES.map((s) => ({ value: s, label: s }));
      case "sbu": return sbus.map((s) => ({ value: s, label: s }));
      case "type": return ALL_TYPES.map((t) => ({ value: t, label: t }));
      case "kind": return [{ value: "design", label: "Design" }, { value: "video", label: "Video" }];
      case "priority": return ["Urgent", "High", "Medium", "Low"].map((p) => ({ value: p, label: p }));
      case "owner": return activePeople;
      case "owner_role": return ROLES;
      default: return YES_NO;
    }
  }, [sbus, people]); // eslint-disable-line react-hooks/exhaustive-deps

  // The rule, read out loud.
  const sentence = (r: Pick<Rule, "trigger_spec" | "conditions" | "actions">) => {
    const sp = r.trigger_spec || { on: "save" };
    const when = sp.on === "created" ? "When a task is created"
      : sp.on === "status" ? `When its status changes to ${(sp.statuses || []).length ? ((xs: string[]) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`)(sp.statuses || []) : "anything"}`
      : "Whenever a task is saved";
    const conds = (r.conditions?.conditions || []).map((c) => {
      const list = (xs: string[]) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
      const one = (x: FilterCondition) => {
        const vals = (Array.isArray(x.value) ? x.value : [String(x.value ?? "")]).map((k) => (x.field === "owner" ? nameOf(k) : k));
        const no = x.op === "isNot" || x.op === "isNoneOf";
        // Yes/no questions read as plain phrases.
        if (x.field === "owner_is_creator") return (vals[0] === "yes") !== no ? "the owner wrote it" : "the owner didn't write it";
        if (x.field === "owner_changed") return (vals[0] === "yes") !== no ? "the owner just changed" : "the owner didn't change";
        const label = (FIELD_LABEL[x.field] || x.field).toLowerCase().replace(/^owner's role$/, "the owner's role");
        if (x.op === "isEmpty") return `${x.field === "owner" ? "nobody owns it" : `${label} is empty`}`;
        if (x.op === "isNotEmpty") return `${x.field === "owner" ? "someone owns it" : `${label} is set`}`;
        return `${label} ${no ? (vals.length > 1 ? "is none of" : "is not") : vals.length > 1 ? "is one of" : "is"} ${list(vals)}`;
      };
      return isGroup(c) ? `(${c.conditions.map(one).join(` ${c.conjunction} `)})` : one(c as FilterCondition);
    });
    const acts = (r.actions || []).map((a) => a.type === "owner" ? (a.to === POOL ? "send it to the editors' claim pool" : `hand it to ${nameOf(a.to)}`)
      : a.type === "collaborator" ? `add ${nameOf(a.to)} as collaborator` : "keep the previous owner as collaborator");
    return `${when}${conds.length ? ` and ${conds.join(r.conditions?.conjunction === "or" ? " or " : " and ")}` : ""} → ${acts.join(", ") || "do nothing"}.`;
  };

  const call = async (method: string, body?: unknown, qs = "") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing-hub/rules-engine${qs}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { showToast({ who: "Couldn't save", body: j.error || `HTTP ${res.status}`, color: "#C03221", av: "!" }); return null; }
      await load();
      return j;
    } finally { setBusy(false); }
  };
  const move = (i: number, d: number) => {
    if (!rules) return;
    const ids = rules.map((r) => r.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    call("PATCH", { order: ids });
  };
  const flip = async (on: boolean) => {
    const ok = await confirmDialog(on
      ? { title: "Switch to these rules?", body: "From now on, who gets each task and who is added as collaborator come only from the rules on this page. The old fixed behaviour stops. You can switch back any time.", action: "Switch to these rules", cancel: "Cancel" }
      : { title: "Switch back to the old behaviour?", body: "The rules on this page stop applying and the old fixed behaviour takes over again.", action: "Switch back", cancel: "Cancel", danger: true });
    if (ok) await call("PATCH", { engineOn: on });
  };

  if (!rules) return <div className="bg-white border border-gray-100 rounded-xl px-4 py-6 text-[13px] text-[#8A92A6]">Loading the rules…</div>;

  return (
    <section className="bg-white border border-gray-100 rounded-xl">
      <div className="px-4 py-3.5 border-b border-gray-100 flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-medium text-[#232D42]">Who gets the task — rules</h2>
          <div className="text-[12.5px] text-[#8A92A6] mt-0.5 leading-relaxed">
            Each rule says when it runs, which tasks it applies to, and what it does. Rules run top to bottom: the first one that hands the task over wins; every matching rule adds its collaborators.
          </div>
        </div>
        {canEdit && <button disabled={busy} onClick={() => setOpen("new")} className="inline-flex items-center gap-1.5 bg-brand text-white rounded-lg px-3.5 py-2 text-[13px] font-medium hover:bg-brand-dark disabled:opacity-50"><IconPlus size={15} />New rule</button>}
      </div>

      {/* Which system is in charge — the one switch, so going back is one click. */}
      <div className={`mx-4 mt-3 rounded-lg px-3 py-2.5 text-[12.5px] flex items-center gap-2 flex-wrap ${engineOn ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {engineOn ? <IconCheck size={15} /> : <IconAlertTriangle size={15} />}
        <span className="flex-1 min-w-0">{engineOn
          ? "These rules are in charge — every task follows them."
          : "These rules are ready but not switched on yet — the old fixed behaviour is still deciding who gets each task."}</span>
        {canEdit && <button disabled={busy} onClick={() => flip(!engineOn)} className="rounded-md border border-current px-2.5 py-1 font-medium disabled:opacity-50">{engineOn ? "Switch back to the old behaviour" : "Switch to these rules"}</button>}
      </div>

      {open === "new" && <RuleForm sentence={sentence} people={activePeople} optionsFor={optionsFor} busy={busy}
        onCancel={() => setOpen(null)} onSave={async (r) => { if (await call("POST", r)) setOpen(null); }} />}

      <ul className="py-1.5">
        {rules.map((r, i) => (
          <li key={r.id} className={`border-t border-gray-50 first:border-t-0 ${r.active ? "" : "opacity-60"}`}>
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#F1F3F9] text-[11px] font-medium text-[#4A5468] flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex-1 min-w-0 text-left">
                <div className="text-[13.5px] font-medium text-[#232D42] flex items-center gap-1.5">{r.name}<IconChevronDown size={14} className={`text-gray-400 transition-transform ${open === r.id ? "rotate-180" : ""}`} /></div>
                <div className="text-[12.5px] text-[#4A5468] leading-relaxed mt-0.5">{sentence(r)}</div>
                {r.note && <div className="text-[11.5px] text-[#8A92A6] mt-0.5">{r.note}</div>}
              </button>
              {canEdit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button disabled={busy || i === 0} onClick={() => move(i, -1)} title="Move up" className="text-gray-400 hover:text-brand disabled:opacity-30"><IconArrowUp size={15} /></button>
                  <button disabled={busy || i === rules.length - 1} onClick={() => move(i, 1)} title="Move down" className="text-gray-400 hover:text-brand disabled:opacity-30"><IconArrowDown size={15} /></button>
                  <button disabled={busy} onClick={() => call("PATCH", { id: r.id, active: !r.active })}
                    className={`ml-1 text-[12px] font-medium rounded-lg border px-2.5 py-1 ${r.active ? "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{r.active ? "On" : "Off"}</button>
                  <button disabled={busy} title="Delete this rule" className="text-gray-300 hover:text-[#C03221] ml-1"
                    onClick={async () => { if (await confirmDialog({ title: `Delete the rule "${r.name}"?`, body: "Tasks already assigned are not changed.", action: "Delete", cancel: "Cancel", danger: true })) call("DELETE", undefined, `?id=${r.id}`); }}><IconTrash size={15} /></button>
                </div>
              )}
            </div>
            {open === r.id && <RuleForm initial={r} sentence={sentence} people={activePeople} optionsFor={optionsFor} busy={busy} readOnly={!canEdit}
              onCancel={() => setOpen(null)} onSave={async (nr) => { if (await call("PATCH", { id: r.id, ...nr })) setOpen(null); }} />}
          </li>
        ))}
        {!rules.length && <li className="px-4 py-6 text-[13px] text-[#8A92A6] text-center">No rules yet.</li>}
      </ul>

      <div className="px-4 py-3 border-t border-gray-100 text-[12px] text-[#8A92A6] leading-relaxed">
        <b className="font-medium text-[#4A5468]">Always true, whatever the rules say:</b> a thumbnail whose maker was chosen keeps them · when a task is taken off an editor they are remembered, and get it back if it turns into video work · nobody is both owner and collaborator.
      </div>
    </section>
  );
}

// One rule's editor: name, When, conditions (Master-sheet filter panel), Then.
function RuleForm({ initial, sentence, people, optionsFor, busy, readOnly, onCancel, onSave }: {
  initial?: Rule; sentence: (r: Pick<Rule, "trigger_spec" | "conditions" | "actions">) => string;
  people: { value: string; label: string }[]; optionsFor: (k: string) => { value: string; label: string }[];
  busy: boolean; readOnly?: boolean; onCancel: () => void;
  onSave: (r: { name: string; trigger_spec: Spec; conditions: FilterModel; actions: Action[] }) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [spec, setSpec] = useState<Spec>(initial?.trigger_spec || { on: "status", statuses: ["Content - Approved"] });
  const [conds, setConds] = useState<FilterModel>(initial?.conditions || EMPTY_FILTER);
  const [actions, setActions] = useState<Action[]>(initial?.actions?.length ? initial.actions : [{ type: "owner", to: "" }]);
  const setAction = (i: number, a: Action) => setActions(actions.map((x, k) => (k === i ? a : x)));
  const toggleStatus = (s: string) => { const cur = spec.statuses || []; setSpec({ ...spec, statuses: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] }); };
  const Label = ({ t }: { t: string }) => <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6] mb-1.5">{t}</div>;
  const valid = name.trim() && actions.length && actions.every((a) => a.type === "keep_previous_owner" || a.to);

  return (
    <div className="mx-4 mb-3 bg-[#FBFCFE] border border-gray-100 rounded-xl p-4 space-y-4">
      <div>
        <Label t="Rule name" />
        <input value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} placeholder="e.g. Approved Australia carousels go to Praveen"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-brand bg-white" />
      </div>
      <div>
        <Label t="When…" />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-[260px]">
            <PreviewSelect value={spec.on} disabled={readOnly} onChange={(v) => setSpec({ on: v as Spec["on"], statuses: v === "status" ? spec.statuses || [] : undefined })}
              options={[{ value: "created", label: "A task is created" }, { value: "status", label: "Its status changes to…" }, { value: "save", label: "Any time a task is saved" }]} />
          </div>
        </div>
        {spec.on === "status" && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TASK_STATUSES.map((s) => {
              const on = (spec.statuses || []).includes(s);
              return <button key={s} type="button" disabled={readOnly} onClick={() => toggleStatus(s)}
                className={`text-[12px] rounded-full px-2.5 py-1 border ${on ? "bg-brand-light border-brand text-[#2138B0] font-medium" : "bg-white border-gray-200 text-[#4A5468]"}`}>{s}</button>;
            })}
          </div>
        )}
        {spec.on === "save" && <div className="text-[11.5px] text-[#8A92A6] mt-1.5">Checked on every save — use it for rules that must keep holding, e.g. "while in these statuses, design work stays with the designer".</div>}
      </div>
      <div className={readOnly ? "pointer-events-none" : ""}>
        <Label t="Only for tasks where… (optional)" />
        <FilterBuilder filter={conds} fields={FIELDS} optionsFor={optionsFor} onChange={setConds} title="Leave empty to apply to every task." emptyNote="No conditions — every task." />
      </div>
      <div>
        <Label t="Then…" />
        <div className="space-y-2">
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <div className="w-[260px]">
                <PreviewSelect value={a.type} disabled={readOnly} onChange={(v) => setAction(i, { type: v as Action["type"], to: v === "keep_previous_owner" ? undefined : "" })}
                  options={[{ value: "owner", label: "Hand it to (owner)" }, { value: "collaborator", label: "Add as collaborator" }, { value: "keep_previous_owner", label: "Keep the previous owner as collaborator" }]} />
              </div>
              {a.type !== "keep_previous_owner" && (
                <div className="w-[220px]">
                  <PreviewSelect value={a.to || ""} disabled={readOnly} onChange={(v) => setAction(i, { ...a, to: v })} placeholder="Pick someone"
                    options={[...(a.type === "owner" ? [{ value: POOL, label: "Nobody — editors' claim pool" }] : []), ...people]} />
                </div>
              )}
              {!readOnly && actions.length > 1 && <button onClick={() => setActions(actions.filter((_, k) => k !== i))} className="text-gray-400 hover:text-rose-500"><IconX size={15} /></button>}
            </div>
          ))}
        </div>
        {!readOnly && <button onClick={() => setActions([...actions, { type: "collaborator", to: "" }])} className="mt-2 text-[12.5px] font-medium text-brand inline-flex items-center gap-1"><IconPlus size={14} />Add action</button>}
      </div>
      <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 text-[12.5px] text-[#4A5468]"><b className="font-medium text-[#232D42]">Reads as:</b> {sentence({ trigger_spec: spec, conditions: conds, actions })}</div>
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-[13px] font-medium text-[#4A5468] px-3 py-2 rounded-lg hover:bg-gray-50">Cancel</button>
          <button disabled={busy || !valid} onClick={() => onSave({ name: name.trim(), trigger_spec: spec, conditions: conds, actions })}
            className="text-[13px] font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50">{initial ? "Save rule" : "Add rule"}</button>
        </div>
      )}
    </div>
  );
}
