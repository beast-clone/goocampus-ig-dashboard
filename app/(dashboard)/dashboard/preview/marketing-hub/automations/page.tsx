"use client";
import { useState } from "react";
import {
  IconUserCheck, IconUsers, IconProgressCheck, IconRefresh, IconClock,
  IconBell, IconSend, IconLock, IconPencil, IconDatabase, IconTable,
} from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { RULE_GROUPS, type RuleEditability } from "./rules";

// Marketing Hub → Automations.
//
// Praveen's point (28 Sep): "what if Nandu leaves and someone else comes — I have
// to come to Claude and do it and deploy again". He is right, and the first step
// is being able to SEE the rules, because most of them are invisible: they live in
// a database trigger, or three files that have to agree with each other.
//
// So this reads the set out loud and says, for each one, who can change it today.
// It is deliberately read-only. Which of these become editable rows is the next
// conversation, and it is easier to have with the list in front of you.

const GROUP_ICON: Record<string, typeof IconUserCheck> = {
  owner: IconUserCheck,
  collab: IconUsers,
  status: IconProgressCheck,
  sync: IconRefresh,
  time: IconClock,
  notify: IconBell,
  publish: IconSend,
};

const EDIT_META: Record<RuleEditability, { label: string; hint: string; icon: typeof IconLock; cls: string }> = {
  team: { label: "Anyone", hint: "The team can change this from the dashboard today.", icon: IconPencil, cls: "bg-[#E8F6F0] text-[#2F9E6F] border-[#CDE9DC]" },
  airtable: { label: "In Airtable", hint: "Changed in Airtable; the dashboard follows.", icon: IconTable, cls: "bg-[#FDF3E7] text-[#C2410C] border-[#F3D3BE]" },
  code: { label: "Needs a developer", hint: "Lives in code — changing it means an edit and a deploy.", icon: IconLock, cls: "bg-[#F6F7FB] text-[#6B7385] border-gray-200" },
  database: { label: "Needs a migration", hint: "Lives in a database trigger — changing it means SQL run against production.", icon: IconDatabase, cls: "bg-[#FDECEA] text-[#C0392B] border-[#F6CFCA]" },
};

export default function AutomationsPage() {
  const [filter, setFilter] = useState<RuleEditability | "all">("all");

  const all = RULE_GROUPS.flatMap((g) => g.rules);
  const counts = {
    all: all.length,
    team: all.filter((r) => r.editable === "team").length,
    airtable: all.filter((r) => r.editable === "airtable").length,
    code: all.filter((r) => r.editable === "code").length,
    database: all.filter((r) => r.editable === "database").length,
  };
  const locked = counts.code + counts.database;

  const groups = RULE_GROUPS
    .map((g) => ({ ...g, rules: filter === "all" ? g.rules : g.rules.filter((r) => r.editable === filter) }))
    .filter((g) => g.rules.length);

  return (
    <PreviewDashboardShell
      active="marketing-hub"
      title="Marketing Hub › Automations"
      subtitle="Every rule the Hub runs on — who gets a task, who else is attached, what syncs, and who hears about it."
      hideAccountPicker
      hideRange
    >
      {() => (
        <div className="preview-scope flex flex-col gap-4">
          {/* The reason this page exists, said plainly rather than left to be inferred. */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-[14px] text-[#232D42] mb-1 font-medium">
              {locked} of these {counts.all} can&rsquo;t be changed without a developer.
            </div>
            <p className="text-[13px] text-[#4A5468] leading-relaxed max-w-3xl">
              That is the problem worth fixing. A rule like &ldquo;12thPlus work goes to Nandu&rdquo; is a fact about
              the team this month, not about the software — when someone joins or leaves it should be a dropdown,
              not a code change and a deploy. This page is the full list, so we can agree which ones become
              editable rows before building anything.
            </p>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {([
              ["all", `All ${counts.all}`],
              ["team", `Anyone ${counts.team}`],
              ["airtable", `In Airtable ${counts.airtable}`],
              ["code", `Needs a developer ${counts.code}`],
              ["database", `Needs a migration ${counts.database}`],
            ] as [RuleEditability | "all", string][]).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`text-[12.5px] font-medium rounded-lg px-3 py-1.5 border transition ${
                  filter === key ? "bg-brand-light text-brand-dark border-brand" : "bg-white text-[#4A5468] border-gray-200 hover:border-gray-300"}`}>
                {label}
              </button>
            ))}
          </div>

          {groups.map((g) => {
            const Icon = GROUP_ICON[g.key] || IconUserCheck;
            return (
              <section key={g.key} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-start gap-2.5 px-4 py-3 border-b border-gray-100">
                  <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center flex-shrink-0">
                    <Icon size={17} stroke={1.8} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-medium text-[#232D42]">{g.title}</div>
                    <div className="text-[12.5px] text-[#8A92A6]">{g.blurb}</div>
                  </div>
                  <span className="ml-auto text-[12px] text-[#8A92A6] flex-shrink-0">{g.rules.length}</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {g.rules.map((r) => {
                    const m = EDIT_META[r.editable];
                    const Badge = m.icon;
                    return (
                      <li key={r.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] text-[#232D42] leading-relaxed">{r.what}</div>
                          {r.why && <div className="text-[12.5px] text-[#8A92A6] mt-1 leading-relaxed">{r.why}</div>}
                          <div className="text-[11.5px] text-[#8A92A6] mt-1.5 font-mono">{r.where}</div>
                        </div>
                        <span title={m.hint}
                          className={`flex-shrink-0 inline-flex items-center gap-1 text-[11.5px] font-medium rounded-full border px-2.5 py-1 ${m.cls}`}>
                          <Badge size={12} stroke={2} /> {m.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </PreviewDashboardShell>
  );
}
