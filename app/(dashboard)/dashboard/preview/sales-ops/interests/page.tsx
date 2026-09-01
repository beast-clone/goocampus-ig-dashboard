"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → By interest. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <PreviewDashboardShell active="sales" title="By interest" subtitle="Which interests generate leads — and whether anyone owns the result." hideAccountPicker compact>
      {({ range }) => <LeadAssignment range={range} only="interest" />}
    </PreviewDashboardShell>
  );
}
