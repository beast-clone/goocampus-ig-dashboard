"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Counsellors. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <HopeDashboardShell active="sales" title="Counsellors" subtitle="How many leads each person holds, and how much of it has been worked." hideAccountPicker compact>
      {({ range }) => <LeadAssignment range={range} only="counsellors" />}
    </HopeDashboardShell>
  );
}
