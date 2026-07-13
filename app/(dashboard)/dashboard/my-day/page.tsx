"use client";
import { DashboardShell } from "@/components/DashboardShell";
import { MyDayView } from "@/components/MyDayView";

// Admin "My Day" — the team-wide view with the "Viewing as" person switcher.
// The actual view lives in components/MyDayView.tsx, shared with each member's
// own /me/tasks page (which locks it to the signed-in person).
export default function MyDayPage() {
  return (
    <DashboardShell title="Daily Planner" subtitle="Each person's queue for today — pick a teammate, see what's next." hideAccountPicker>
      {({ range }) => <MyDayView range={range} />}
    </DashboardShell>
  );
}
