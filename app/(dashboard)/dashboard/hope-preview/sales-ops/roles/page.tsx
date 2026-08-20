"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Roles. The only sub-page with no date range: who is a counsellor
// isn't scoped to a window, so the range picker and PDF export are hidden — with
// both that and the account picker off, the shell drops the control bar entirely.
export default function Page() {
  return (
    <HopeDashboardShell active="sales" title="Roles" subtitle="What each lead-holder is: counsellor, holding pool, partner router or inactive." hideAccountPicker hideRange compact>
      {({ range }) => <LeadAssignment range={range} only="roles" />}
    </HopeDashboardShell>
  );
}
