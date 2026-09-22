"use client";
import { useEffect, useState } from "react";
import { IconCalendarEvent, IconWand } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Planner } from "../post-planner/PostPlanner";

// Publishing Calendar → the ONE calendar (docs/CALENDAR_SPEC.md): the Marketing Hub
// content calendar now shows every task + channels + posts made outside the dashboard,
// so this page only keeps the AI planner (?tab=planner) and sends everything else there.
// (PreviewCalendar.tsx is the old publishing calendar, no longer routed.)
const MERGED = "/dashboard/preview/marketing-hub?tab=calendar";
export function CalendarTabs() {
  const router = useRouter();
  const [planner, setPlanner] = useState<boolean | null>(null);
  useEffect(() => {
    const isPlanner = new URLSearchParams(window.location.search).get("tab") === "planner";
    if (!isPlanner) router.replace(MERGED);
    setPlanner(isPlanner);
  }, [router]);
  if (!planner) return null;

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-full text-[14px] font-medium px-4 transition ${
      active ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"
    }`;
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex h-9 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <a href={MERGED} className={pill(false)}><IconCalendarEvent size={16} /> Content calendar</a>
          <span className={pill(true)}><IconWand size={16} /> AI planner</span>
        </div>
      </div>
      <Planner />
    </div>
  );
}
