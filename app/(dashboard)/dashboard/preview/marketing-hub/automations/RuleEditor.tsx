"use client";
import { useEffect, useState } from "react";
import { IconTrash, IconPlus, IconAlertTriangle } from "@tabler/icons-react";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { showToast } from "@/app/(dashboard)/dashboard/preview/Toast";

// The two rules that name a person, as rows you can change.
//
// Everything else on this page is read-only description. These two are live: the
// database trigger that assigns owners reads them, and so does the code that
// attaches a collaborator to a new task — so a change here takes effect on the
// next task, with no deploy.

export type Rule = {
  id: string;
  kind: "owner" | "collaborator";
  sbu: string | null;
  content_kind: "video" | "design" | null;
  assign_to: string | null;
  priority: number;
  active: boolean;
  note: string | null;
};

const PEOPLE = [
  { value: "manya", label: "Manya" },
  { value: "praveen", label: "Praveen" },
  { value: "nikhil", label: "Nikhil" },
  { value: "nandu", label: "Nandu" },
  { value: "maheen", label: "Maheen" },
];
const POOL = "__pool__";

/** The rule in words, so the row reads as a sentence and not a set of columns. */
function sentence(r: Rule): string {
  const scope = r.sbu ? `${r.sbu}` : "any brand";
  if (r.kind === "owner") {
    const what = r.content_kind === "video" ? "video" : r.content_kind === "design" ? "design work" : "work";
    return `When ${what} for ${scope} is approved`;
  }
  return `A new task for ${scope}`;
}

export function RuleEditor({ sbus }: { sbus: string[] }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<"owner" | "collaborator" | null>(null);
  const [newSbu, setNewSbu] = useState("");
  const [newWho, setNewWho] = useState("nandu");

  const load = () =>
    fetch("/api/marketing-hub/rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRules(d.rules || []))
      .catch(() => setRules([]));
  useEffect(() => { load(); }, []);

  const save = async (id: string, patch: Partial<Rule>) => {
    setBusy(id); setErr(null);
    try {
      const r = await fetch("/api/marketing-hub/rules", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
      showToast({ who: "Rule saved", body: "It applies from the next task onward.", color: "#3A57E8", av: "✓" });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const add = async () => {
    if (!adding) return;
    setBusy("new"); setErr(null);
    try {
      const r = await fetch("/api/marketing-hub/rules", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ kind: adding, sbu: newSbu || null, assign_to: newWho }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAdding(null); setNewSbu("");
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const remove = async (r: Rule) => {
    const ok = await confirmDialog({
      title: "Remove this rule?",
      body: <>&ldquo;{sentence(r)}&rdquo; will stop applying. Tasks already assigned are not changed.</>,
      action: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/marketing-hub/rules?id=${r.id}`, { method: "DELETE", credentials: "same-origin" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not remove it");
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  if (rules === null) return <div className="text-[13px] text-[#8A92A6] px-4 py-6">Reading the rules…</div>;

  const section = (kind: "owner" | "collaborator", title: string, blurb: string) => {
    const mine = rules.filter((r) => r.kind === kind);
    return (
      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[14.5px] font-medium text-[#232D42]">{title}</div>
          <div className="text-[12.5px] text-[#8A92A6]">{blurb}</div>
        </div>
        <ul className="divide-y divide-gray-50">
          {mine.map((r) => (
            <li key={r.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-[13.5px] text-[#232D42] min-w-0 flex-1">
                {sentence(r)} <span className="text-[#8A92A6]">→</span>{" "}
                <span className="text-[#8A92A6]">{kind === "owner" ? "owner becomes" : "attach"}</span>
              </span>
              <PreviewSelect
                className="w-[178px]"
                value={r.assign_to ?? (kind === "owner" ? POOL : "")}
                onChange={(v) => save(r.id, { assign_to: v === POOL ? null : v })}
                options={kind === "owner" ? [...PEOPLE, { value: POOL, label: "Nobody — claim pool" }] : PEOPLE}
              />
              <button onClick={() => save(r.id, { active: !r.active })} disabled={busy === r.id}
                title={r.active ? "Switch this rule off" : "Switch it back on"}
                className={`text-[12px] font-medium rounded-lg border px-2.5 py-1.5 ${r.active ? "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {r.active ? "On" : "Off"}
              </button>
              <button onClick={() => remove(r)} disabled={busy === r.id}
                className="text-gray-300 hover:text-[#C03221]" title="Remove this rule">
                <IconTrash size={15} stroke={1.8} />
              </button>
            </li>
          ))}
          {!mine.length && <li className="px-4 py-6 text-[13px] text-[#8A92A6] text-center">No rules yet.</li>}
        </ul>
        <div className="px-4 py-2.5 border-t border-gray-100">
          {adding === kind ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] text-[#4A5468]">For</span>
              <PreviewSelect className="w-[210px]" value={newSbu} onChange={setNewSbu}
                options={[{ value: "", label: "any brand" }, ...sbus.map((s) => ({ value: s, label: s }))]} />
              <span className="text-[12.5px] text-[#4A5468]">{kind === "owner" ? "the owner becomes" : "attach"}</span>
              <PreviewSelect className="w-[160px]" value={newWho} onChange={setNewWho} options={PEOPLE} />
              <button onClick={add} disabled={busy === "new"}
                className="rounded-lg bg-brand text-white text-[12.5px] font-medium px-3 py-1.5 hover:bg-brand-dark disabled:opacity-50">Add</button>
              <button onClick={() => setAdding(null)} className="text-[12.5px] text-[#4A5468] px-2 py-1.5">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setAdding(kind); setNewWho(kind === "owner" ? "praveen" : "nandu"); }}
              className="text-[12.5px] text-brand hover:underline inline-flex items-center gap-1">
              <IconPlus size={13} stroke={2} /> Add a rule
            </button>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {err && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[12.5px] px-3 py-2.5">
          <IconAlertTriangle size={15} className="mt-[1px] shrink-0" /> {err}
        </div>
      )}
      {section("owner", "Who gets the task",
        "Applies from Content - Approved onward. The database enforces this, so it holds for the Airtable sync and n8n too — not only for work created here.")}
      {section("collaborator", "Who else is attached",
        "Applied when a task is created. A rule naming a brand beats the catch-all; nobody is ever both owner and collaborator.")}
    </div>
  );
}
