"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { BroadcastWorkspace } from "./BroadcastWorkspace";

// Community Broadcast — WhatsApp, on its own tab (it is not a social post, and it
// has its own queue and worker). The dashboard schedules; n8n + WAHA send.
export default function Page() {
  return (
    <PreviewDashboardShell active="broadcast" title="Community Broadcast"
      subtitle="Schedule WhatsApp messages, polls and status posts to your groups, channels and contacts."
      hideAccountPicker hideRange>
      {() => <BroadcastWorkspace />}
    </PreviewDashboardShell>
  );
}
