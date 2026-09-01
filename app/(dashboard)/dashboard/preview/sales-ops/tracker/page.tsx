"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Leads tracker. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <PreviewDashboardShell active="sales" title="Leads tracker" subtitle="Leads you've pinned, plus everything the alert rules caught." hideAccountPicker compact>
      {({ range }) => <LeadAssignment range={range} only="tracker" />}
    </PreviewDashboardShell>
  );
}
