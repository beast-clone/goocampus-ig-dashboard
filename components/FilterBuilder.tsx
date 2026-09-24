"use client";
import { useState } from "react";
import { IconCheck, IconChevronDown, IconPlus, IconTrash } from "@tabler/icons-react";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { OPS_BY_TYPE, type FilterCondition, type FilterFieldDef, type FilterModel, type FilterOp } from "@/lib/filter-model";

// Airtable-style filter builder — rows of Field · Operator · Value joined by a
// top-level AND/OR. The operators and the value control follow the field's type.
//
// Lifted out of the Marketing Hub so Sales Ops could have the same thing rather
// than a second filter UI that slowly disagrees with the first. The page supplies
// its own fields and its own `optionsFor`, which is the only thing that knew about
// tasks, the team roster or the pipeline stages.

function FilterMultiSelect({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-left bg-white">
        <span className="truncate text-gray-700">{value.length ? `${value.length} selected` : "Select…"}</span>
        <IconChevronDown size={13} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+4px)] z-[56] bg-white border border-gray-200 rounded-lg shadow-lg p-1 min-w-[170px] max-h-56 overflow-auto">
            {options.length === 0 && <div className="px-2 py-1.5 text-[12px] text-gray-400">No options</div>}
            {options.map((o) => (
              <button key={o.value} onClick={() => toggle(o.value)} className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-gray-50 text-left">
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${value.includes(o.value) ? "bg-brand border-brand text-white" : "border-gray-300"}`}>{value.includes(o.value) && <IconCheck size={10} stroke={3} />}</span>
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function FilterBuilder<T>({ filter, fields, optionsFor, onChange, emptyNote = "No conditions — showing everything. Add one below." }: {
  filter: FilterModel;
  fields: FilterFieldDef<T>[];
  /** The choices for a select/owner field, in the page's own vocabulary. */
  optionsFor: (fieldKey: string) => { value: string; label: string }[];
  onChange: (f: FilterModel) => void;
  emptyNote?: string;
}) {
  const update = (i: number, patch: Partial<FilterCondition>) => onChange({ ...filter, conditions: filter.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const remove = (i: number) => onChange({ ...filter, conditions: filter.conditions.filter((_, idx) => idx !== i) });
  // A new row starts on the first field this page offers — the master sheet could
  // assume "status" existed; a shared builder cannot.
  const add = () => {
    const first = fields[0];
    if (!first) return;
    const op = OPS_BY_TYPE[first.type][0];
    onChange({ ...filter, conditions: [...filter.conditions, { field: first.key, op: op.op, value: op.arity === "many" ? [] : op.arity === "none" ? undefined : "" }] });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-[560px] max-w-[92vw]">
      {filter.conditions.length === 0 && <div className="text-[12px] text-gray-400 px-1 pb-2">{emptyNote}</div>}
      <div className="space-y-2">
        {filter.conditions.map((c, i) => {
          const def = fields.find((f) => f.key === c.field);
          const ops = OPS_BY_TYPE[def?.type || "text"];
          const opDef = ops.find((o) => o.op === c.op) || ops[0];
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="w-[52px] flex-shrink-0 text-[12px]">
                {i === 0 ? <span className="text-gray-400 pl-1">Where</span>
                  : i === 1 ? <PreviewSelect value={filter.conjunction} onChange={(v) => onChange({ ...filter, conjunction: v as "and" | "or" })} options={[{ value: "and", label: "and" }, { value: "or", label: "or" }]} />
                  : <span className="text-gray-400 pl-1">{filter.conjunction}</span>}
              </div>
              <div className="w-[130px] flex-shrink-0">
                <PreviewSelect value={c.field} onChange={(v) => { const nd = fields.find((f) => f.key === v)!; const first = OPS_BY_TYPE[nd.type][0]; update(i, { field: v, op: first.op, value: first.arity === "many" ? [] : first.arity === "none" ? undefined : "" }); }} options={fields.map((f) => ({ value: f.key, label: f.label }))} />
              </div>
              <div className="w-[130px] flex-shrink-0">
                <PreviewSelect value={c.op} onChange={(v) => { const a = ops.find((o) => o.op === v)!.arity; update(i, { op: v as FilterOp, value: a === "many" ? [] : a === "none" ? undefined : (Array.isArray(c.value) ? "" : c.value || "") }); }} options={ops.map((o) => ({ value: o.op, label: o.label }))} />
              </div>
              <div className="flex-1 min-w-0">
                {opDef.arity === "none" ? <span className="text-[12px] text-gray-300 pl-1">—</span>
                  : def?.type === "date" ? <input type="date" value={String(c.value || "")} onChange={(e) => update(i, { value: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
                  : def?.type === "text" ? <input value={String(c.value || "")} onChange={(e) => update(i, { value: e.target.value })} placeholder="value" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
                  : opDef.arity === "many" ? <FilterMultiSelect options={optionsFor(c.field)} value={Array.isArray(c.value) ? c.value : []} onChange={(vals) => update(i, { value: vals })} />
                  : <PreviewSelect value={String(c.value || "")} onChange={(v) => update(i, { value: v })} placeholder="Select…" options={[{ value: "", label: "Select…" }, ...optionsFor(c.field)]} />}
              </div>
              <button onClick={() => remove(i)} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><IconTrash size={14} /></button>
            </div>
          );
        })}
      </div>
      <button onClick={add} className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-brand"><IconPlus size={14} />Add condition</button>
    </div>
  );
}
