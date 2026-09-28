"use client";
import { useState } from "react";
import { IconChevronRight, IconLock } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { RULE_GROUPS } from "./rules";
import { RuleEditor } from "./RuleEditor";
import { SBU_OPTIONS } from "@/lib/sbus";

// Marketing Hub → Automations.
//
// The first version put six editable dropdowns above a twenty-seven item reference
// list — and three of those items DESCRIBED the dropdowns, so you read the same
// rule twice in two different forms. Praveen's verdict was that the whole layout
// was confusing, and he was right: two unrelated jobs were sharing a page as
// equals.
//
// So the page is the rules you can change. Everything else the Hub does by itself
// is still written down, because hiding it is how it became invisible in the first
// place — but it is folded away, and clearly reference rather than controls.

export default function AutomationsPage() {
  const [open, setOpen] = useState(false);
  const rest = RULE_GROUPS.flatMap((g) => g.rules).length;

  return (
    <PreviewDashboardShell
      active="marketing-hub"
      introTab="marketing-hub-automations"
      title="Automations"
      subtitle="Marketing Hub settings — who each new task is given to, and who is added as collaborator."
      hideAccountPicker
      hideRange
    >
      {() => (
        <div className="preview-scope flex flex-col gap-4">
          <div className="text-[13px] text-[#4A5468] leading-relaxed max-w-3xl space-y-1">
            <p>
              When a task is created or approved in the Marketing Hub (Master sheet, Pipeline,
              Content calendar), the Hub fills in its owner and collaborator using the rules below.
            </p>
            <p>
              Change a name or switch a rule off and it takes effect straight away, for the next
              task that is created or moves to approved. Nothing needs deploying.
            </p>
          </div>

          <RuleEditor sbus={[...SBU_OPTIONS]} />

          {/* Reference, folded away. It is here so nothing is hidden, not because
              anyone needs it open. */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <button onClick={() => setOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[#F6F7FB]">
              <IconChevronRight size={15} stroke={2}
                className={`text-[#8A92A6] transition-transform ${open ? "rotate-90" : ""}`} />
              <span className="text-[13.5px] text-[#232D42]">
                The other {rest} things the Hub does automatically
              </span>
              <span className="ml-auto text-[12px] text-[#8A92A6] inline-flex items-center gap-1">
                <IconLock size={12} stroke={2} /> ask a developer to change these
              </span>
            </button>

            {open && (
              <div className="border-t border-gray-100">
                {RULE_GROUPS.map((g) => (
                  <section key={g.key} className="border-b border-gray-50 last:border-b-0">
                    <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">
                      {g.title}
                    </div>
                    <ul className="pb-2">
                      {g.rules.map((r) => (
                        <li key={r.id} className="px-4 py-2">
                          <div className="text-[13px] text-[#4A5468] leading-relaxed">{r.what}</div>
                          {r.why && <div className="text-[12px] text-[#8A92A6] mt-0.5 leading-relaxed">{r.why}</div>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PreviewDashboardShell>
  );
}
