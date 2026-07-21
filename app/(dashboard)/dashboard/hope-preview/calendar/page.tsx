import { HopeShell } from "../HopeShell";
import { HopeCalendar } from "./HopeCalendar";

// Hope UI reskin — Publishing Calendar (Version 2). Self-contained Hope shell +
// the full V1 calendar (all sections/data) restyled to the Hope FullCalendar page.
// Does not touch the original app/(dashboard)/dashboard/calendar/page.tsx (Version 1).
// (Inter is loaded globally in app/layout.tsx.)

export default function HopeCalendarPage() {
  return (
    <HopeShell active="calendar" title="Publishing Calendar" hideTopbar>
      <HopeCalendar />
    </HopeShell>
  );
}
