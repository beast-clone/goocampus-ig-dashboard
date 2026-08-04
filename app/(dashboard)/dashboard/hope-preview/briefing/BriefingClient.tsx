"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { CompetitorBriefing } from "./CompetitorBriefing";

// Client wrapper — owns the single page header (shell banner) with a live greeting,
// then renders the competitor briefing.
export function BriefingClient({ person }: { person: string }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const who = person ? person.charAt(0).toUpperCase() + person.slice(1) : "team";
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <HopeDashboardShell active="my-workspace" title={`Competitor radar · ${greet}, ${who}`} hideAccountPicker hideRange
      subtitle={`${date} · what the competition is doing — everything here is about them, not us.`}>
      {() => <CompetitorBriefing />}
    </HopeDashboardShell>
  );
}
