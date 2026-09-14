"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LeadSearch } from "../LeadSearch";

// Sales Hub → Search leads. A full-CRM lead finder (name / phone / email + filters)
// with reassign-from-row. Independent of the six assignment tabs — its own data
// source (/api/leads-crm/search), so it needs neither the shared date range nor the
// heavy assignments read.
export default function Page() {
  return (
    <PreviewDashboardShell active="sales" title="Search leads" subtitle="Find any lead across the CRM by name, phone or email — and reassign from here." hideAccountPicker hideRange compact>
      {() => <LeadSearch />}
    </PreviewDashboardShell>
  );
}
