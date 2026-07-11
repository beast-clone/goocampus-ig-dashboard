"use client";
import { DashboardShell } from "@/components/DashboardShell";
import { MyDayView } from "@/components/MyDayView";

// Admin "My Day" — the team-wide view with the "Viewing as" person switcher.
// The actual view lives in components/MyDayView.tsx, shared with each member's
// own /me/tasks page (which locks it to the signed-in person).
export default function MyDayPage() {
  return (
    <DashboardShell title="My Day" subtitle="Your queue for today — pick the person, see what's next.">
      {({ range }) => <MyDayView range={range} />}
    </DashboardShell>
  );
}
