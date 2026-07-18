"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { HopeCalendarV2 } from "./HopeCalendarV2";

// Publishing Calendar — "full shell" Hope UI rebuild (comparison tab). Renders the
// shared calendar data/logic inside HopeDashboardShell (standard 24px title,
// .hope-scope, flat cards) instead of the gradient-hero HopeShell version at
// /calendar. Both tabs coexist so the team can compare and pick.
export default function CalendarV2Page() {
  return (
    <HopeDashboardShell
      active="calendar"
      title="Publishing Calendar"
      subtitle="Every scheduled & published post across your accounts, month at a glance."
      hideAccountPicker
      hideRange
    >
      {() => <HopeCalendarV2 />}
    </HopeDashboardShell>
  );
}
