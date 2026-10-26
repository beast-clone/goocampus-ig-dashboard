"use client";
import { useEffect, useState } from "react";
import { IconArrowRight, IconBolt } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { RULE_TABS, TASK_FLOW, type RuleEditability } from "./rules";
import { RuleEditor } from "./RuleEditor";

// Rules (was "Automations").
//
// Praveen, 26 Oct: the page was confusing — six dropdowns about owners, and the
// rules the dashboard really runs on folded away as "the other 24 things". He
// wanted every rule in the dashboard, readable by anyone, broken down by tab:
// "if it is content pending it will be with Manya; content approved goes to
// Praveen". So the page is now one tab per area, each rule a plain "when → what"
// line with a badge saying who can change it. The rules the team CAN change (who
// gets new and approved tasks) sit on the My Day tab, worded the same way.

const BADGE: Record<RuleEditability, { label: string; cls: string }> = {
  team: { label: "You can change it", cls: "bg-emerald-50 text-emerald-700" },
  code: { label: "Fixed", cls: "bg-[#F1F3F9] text-[#6B7487]" },
  airtable: { label: "Set in Airtable", cls: "bg-amber-50 text-amber-700" },
};
const TAB_KEY = "rules-tab";

export default function RulesPage() {
  const [tab, setTab] = useState(RULE_TABS[0].key);
  useEffect(() => { try { const t = localStorage.getItem(TAB_KEY); if (t && RULE_TABS.some((x) => x.key === t)) setTab(t); } catch { /* private mode */ } }, []);
  const pick = (k: string) => { setTab(k); try { localStorage.setItem(TAB_KEY, k); } catch { /* private mode */ } };
  const cur = RULE_TABS.find((t) => t.key === tab) || RULE_TABS[0];

  return (
    <PreviewDashboardShell
      active="marketing-hub"
      introTab="marketing-hub-automations"
      title="Rules"
      subtitle="Everything the dashboard does on its own — who gets a task, when it moves, what is checked, who hears about it."
      hideAccountPicker
      hideRange
    >
      {() => (
        <div className="preview-scope flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap text-[12px] text-[#8A92A6]">
            {(Object.keys(BADGE) as RuleEditability[]).map((k) => (
              <span key={k} className={`rounded-full px-2.5 py-0.5 ${BADGE[k].cls}`}>{BADGE[k].label}{k === "code" ? " — ask a developer" : ""}</span>
            ))}
          </div>

          <div className="flex gap-1.5 flex-wrap bg-white border border-gray-100 rounded-xl p-2">
            {RULE_TABS.map((t) => (
              <button key={t.key} onClick={() => pick(t.key)}
                className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium transition ${t.key === cur.key ? "bg-brand-light text-[#2138B0]" : "text-[#4A5468] hover:bg-[#F6F7FB]"}`}>
                {t.title}<span className="ml-1.5 text-[11px] text-[#8A92A6] font-normal">{t.rules.length}</span>
              </button>
            ))}
          </div>

          {cur.key === "my-day" && (
            <section className="bg-white border border-gray-100 rounded-xl">
              <div className="px-4 py-3.5 border-b border-gray-100">
                <h2 className="text-[16px] font-medium text-[#232D42]">How a task moves</h2>
                <div className="text-[12.5px] text-[#8A92A6] mt-0.5">The path every task follows, and who holds it at each step.</div>
              </div>
              <div className="flex items-stretch gap-1 p-4 overflow-x-auto">
                {TASK_FLOW.map((s, i) => (
                  <div key={s.status} className="flex items-stretch gap-1 flex-1 min-w-[160px]">
                    {i > 0 && <div className="flex items-center text-gray-300"><IconArrowRight size={16} /></div>}
                    <div className="flex-1 border border-gray-100 rounded-xl px-3 py-2.5 bg-[#FBFCFE]">
                      <div className="text-[10.5px] uppercase tracking-wide text-[#8A92A6]">{s.step}</div>
                      <div className="text-[13.5px] font-medium text-[#232D42] mt-0.5">{s.status}</div>
                      <div className="text-[12.5px] text-[#4A5468] mt-1 leading-relaxed">{s.who}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {cur.key === "my-day" && <RuleEditor />}

          <section className="bg-white border border-gray-100 rounded-xl">
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-brand-light text-brand flex items-center justify-center"><IconBolt size={16} stroke={1.8} /></span>
              <div>
                <h2 className="text-[16px] font-medium text-[#232D42]">{cur.title} rules</h2>
                <div className="text-[12.5px] text-[#8A92A6]">{cur.blurb}</div>
              </div>
            </div>
            <ul className="divide-y divide-gray-50">
              {cur.rules.map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-start gap-3" title={`Where it lives: ${r.where}`}>
                  <span className="text-[11px] font-medium text-[#2138B0] bg-brand-light rounded-md px-2 py-0.5 whitespace-nowrap mt-[1px]">{r.when}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-[#232D42] leading-relaxed">{r.what}</div>
                    {r.why && <div className="text-[12px] text-[#8A92A6] mt-0.5 leading-relaxed">{r.why}</div>}
                  </div>
                  <span className={`text-[11px] rounded-full px-2.5 py-0.5 whitespace-nowrap ${BADGE[r.editable].cls}`}>{BADGE[r.editable].label}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </PreviewDashboardShell>
  );
}
