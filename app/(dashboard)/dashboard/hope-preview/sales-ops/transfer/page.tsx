"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Transfer. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <HopeDashboardShell active="sales" title="Transfer" subtitle="Move leads in bulk — e.g. when a counsellor is unexpectedly away." hideAccountPicker compact>
      {({ range }) => <LeadAssignment range={range} only="transfer" />}
    </HopeDashboardShell>
  );
}
