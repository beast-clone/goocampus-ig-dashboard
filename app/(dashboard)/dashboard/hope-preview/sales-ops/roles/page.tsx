"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Roles. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <HopeDashboardShell active="sales" title="Roles" subtitle="What each lead-holder is: counsellor, holding pool, partner router or inactive." hideAccountPicker compact>
      {({ range }) => <LeadAssignment range={range} only="roles" />}
    </HopeDashboardShell>
  );
}
