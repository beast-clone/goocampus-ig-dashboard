"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { IconBuildingSkyscraper } from "@tabler/icons-react";

export default function CompanyReportsPage() {
  return (
    <HopeDashboardShell
      active="reports"
      title="Company Reports"
      subtitle="General company & marketing reports — not tied to a single social channel."
      hideRange
      hideAccountPicker
    >
      {() => (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <IconBuildingSkyscraper size={30} className="mx-auto text-[#8A92A6]" />
          <div className="text-[#232D42] font-medium mt-3 text-base">Company reports live here</div>
          <div className="text-[#8A92A6] text-sm mt-1.5 max-w-md mx-auto">
            Overall marketing / company rollups (across channels, leads &amp; sales) will be stored and shown here.
            Tell me what a company report should contain and I&rsquo;ll wire it up.
          </div>
        </div>
      )}
    </HopeDashboardShell>
  );
}
