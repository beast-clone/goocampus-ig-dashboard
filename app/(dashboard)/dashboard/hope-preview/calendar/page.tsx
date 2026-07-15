import { Inter } from "next/font/google";
import { HopeShell } from "../HopeShell";
import { HopeCalendar } from "./HopeCalendar";

// Hope UI reskin — Publishing Calendar (Version 2). Self-contained Hope shell +
// the full V1 calendar (all sections/data) restyled to the Hope FullCalendar page.
// Does not touch the original app/(dashboard)/dashboard/calendar/page.tsx (Version 1).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export default function HopeCalendarPage() {
  return (
    <div className={inter.className}>
      <HopeShell active="calendar" title="Publishing Calendar" hideTopbar>
        <HopeCalendar />
      </HopeShell>
    </div>
  );
}
