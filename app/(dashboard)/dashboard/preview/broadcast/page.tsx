"use client";
import { useState } from "react";
import { IconUsersGroup } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { BroadcastWorkspace } from "./BroadcastWorkspace";

// Community Broadcast — WhatsApp, on its own tab (it is not a social post, and it
// has its own queue and worker). The dashboard schedules; n8n + WAHA send.
export default function Page() {
  // Groups & members sat under the New message button and was missed there, so
  // it lives beside the tab name. The state is here because the button and the
  // panel it opens are now in two different components.
  const [groupsOpen, setGroupsOpen] = useState(false);

  return (
    <PreviewDashboardShell active="broadcast" title="Community Broadcast"
      subtitle="Schedule WhatsApp messages, polls and status posts to your groups, channels and contacts."
      titleAction={
        <button onClick={() => setGroupsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/35 bg-white/15 text-white text-[12.5px] font-medium px-3 py-1.5 hover:bg-white/25 transition">
          <IconUsersGroup size={15} /> Groups &amp; members
        </button>
      }
      hideAccountPicker hideRange>
      {() => <BroadcastWorkspace groupsOpen={groupsOpen} onGroupsOpenChange={setGroupsOpen} />}
    </PreviewDashboardShell>
  );
}
