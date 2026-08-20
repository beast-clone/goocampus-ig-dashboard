"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Per day. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <HopeDashboardShell active="sales" title="Per day" subtitle="How many leads arrived each day, and who they went to." hideAccountPicker>
      {({ range }) => <LeadAssignment range={range} only="day" />}
    </HopeDashboardShell>
  );
}
