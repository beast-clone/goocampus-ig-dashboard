import { PreviewShell } from "../PreviewShell";
import { CalendarTabs } from "./CalendarTabs";

// Dashboard reskin — Publishing Calendar (Version 2). Self-contained themed shell +
// the full V1 calendar (all sections/data) restyled to the theme FullCalendar page.
// Does not touch the original app/(dashboard)/dashboard/calendar/page.tsx (Version 1).
// (Inter is loaded globally in app/layout.tsx.)

export default function PreviewCalendarPage() {
  return (
    <PreviewShell active="calendar" title="Publishing Calendar" hideTopbar>
      {/* This page was never wrapped, so none of the reskin reached it — no type
          scale, no 4px corners, no 34px fields, no 1440px column, no card
          padding. Every other tab wraps itself the same way. */}
      <div className="preview-scope">
        <CalendarTabs />
      </div>
    </PreviewShell>
  );
}
