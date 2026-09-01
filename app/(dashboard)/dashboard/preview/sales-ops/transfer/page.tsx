"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Transfer. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <PreviewDashboardShell active="sales" title="Transfer" subtitle="Move leads in bulk — e.g. when a counsellor is unexpectedly away." hideAccountPicker compact>
      {({ range }) => <LeadAssignment range={range} only="transfer" />}
    </PreviewDashboardShell>
  );
}
