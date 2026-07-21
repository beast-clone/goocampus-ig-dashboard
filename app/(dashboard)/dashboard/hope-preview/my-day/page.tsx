import { HopeMyDay } from "./HopeMyDay";

// Hope UI reskin — My Day (Version 2 preview). Self-contained: its own Hope-themed
// shell + the full decluttered My Day layout. Does not touch the shared
// Sidebar/DashboardShell or the original components/MyDayView.tsx (Version 1).
// (Inter is loaded globally in app/layout.tsx.)

export default function HopeMyDayPage() {
  return <HopeMyDay />;
}
