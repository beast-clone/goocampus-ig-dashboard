"use client";
import { useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { useSearchParams } from "next/navigation";
import { PlaybooksLibrary } from "./PlaybooksLibrary";
import { StudioCreate } from "./StudioCreate";

// Content Studio — where a story becomes a task.
//
// Two tabs. "Create" takes one item through check → decide → write → read → file.
// "Playbooks" is the house style those steps draw on: the angle picked in Create is a
// playbook, and its framework goes into the prompt. Before this, the two tabs did not
// know about each other at all — the library was fifty documents you could read and
// nothing that read them.

export default function ContentStudioPage() {
  return (
    <PreviewDashboardShell active="content-studio" title="Content Studio" hideAccountPicker hideRange
      subtitle="Perplexity checks whether it is true, Claude writes it, and it lands on the board with the caption already in it.">
      {() => <StudioTabs />}
    </PreviewDashboardShell>
  );
}

type SkillMeta = { slug: string; name: string; category: string; description: string };

function StudioTabs() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"create" | "playbooks">(sp.get("tab") === "playbooks" ? "playbooks" : "create");
  const [skills, setSkills] = useState<SkillMeta[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/marketing-skills", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.skills) setSkills(d.skills as SkillMeta[]); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // The angle picker only offers the playbooks that describe how to WRITE something.
  // The library also holds app-store, paywall and pricing frameworks; offering those as
  // an angle for an Instagram carousel is how a dropdown stops being trustworthy.
  const writing = skills.filter((s) => s.category === "Content & Copy" || s.category === "SEO & Content");

  return (
    <div className="preview-scope">
      <div className="flex items-center gap-2 mb-5">
        {(["create", "playbooks"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-[13px] font-medium px-4 py-2 rounded-xl border transition ${
              tab === k ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-300"}`}>
            {k === "create" ? "Create" : "Playbooks"}
          </button>
        ))}
      </div>
      {tab === "create" ? <StudioCreate playbooks={writing} /> : <PlaybooksLibrary />}
    </div>
  );
}
