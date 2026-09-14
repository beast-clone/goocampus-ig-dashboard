"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LeadSearch } from "../LeadSearch";

// Sales Hub → Unassigned leads. The New-Leads pool (leads still with Maheen, not yet
// with a working counsellor). Reuses LeadSearch in poolMode so you can tick leads and
// assign them straight from here (batch transfer), instead of opening each in Airtable.
export default function Page() {
  return (
    <PreviewDashboardShell active="sales" title="Unassigned leads" subtitle="Leads waiting in the New-Leads pool — assign them to a counsellor directly." hideAccountPicker hideRange compact>
      {() => <LeadSearch poolMode />}
    </PreviewDashboardShell>
  );
}
