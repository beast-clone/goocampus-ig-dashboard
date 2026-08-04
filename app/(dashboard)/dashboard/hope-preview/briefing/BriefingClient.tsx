"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { CompetitorBriefing } from "./CompetitorBriefing";

// Client wrapper so the server page can hand over just the (serializable) name and
// this file owns the render-prop function HopeDashboardShell expects.
export function BriefingClient({ person }: { person: string }) {
  return (
    <HopeDashboardShell active="my-workspace" title="My Workspace" hideAccountPicker hideRange
      subtitle="Your competitor radar — what rivals posted, ran, and grew, in one glance.">
      {() => <CompetitorBriefing person={person} />}
    </HopeDashboardShell>
  );
}
