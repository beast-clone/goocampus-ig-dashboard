"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Per day. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <PreviewDashboardShell active="sales" title="Per day" subtitle="How many leads arrived each day, and who they went to." hideAccountPicker compact>
      {({ range }) => <LeadAssignment range={range} only="day" />}
    </PreviewDashboardShell>
  );
}
