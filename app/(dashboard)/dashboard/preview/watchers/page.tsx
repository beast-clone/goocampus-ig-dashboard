"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { WatchersWorkspace } from "./WatchersWorkspace";

// Watchers — web pages we follow for news (KEA / MCC counselling notices first).
// Spec: docs/WATCHERS_SPEC.md. The checking lives in lib/watchers.ts.
export default function Page() {
  return (
    <PreviewDashboardShell active="watchers" title="Watchers"
      subtitle="Links we watch for new notices — shown here, emailed and sent on Telegram the moment they appear."
      hideAccountPicker hideRange>
      {() => <WatchersWorkspace />}
    </PreviewDashboardShell>
  );
}
