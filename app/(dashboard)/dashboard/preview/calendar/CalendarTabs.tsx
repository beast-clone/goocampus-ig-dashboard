"use client";
import { useEffect, useState } from "react";
import { IconCalendarEvent, IconWand } from "@tabler/icons-react";
import { PreviewCalendar } from "./PreviewCalendar";
import { Planner } from "../post-planner/PostPlanner";

// Publishing Calendar = two tabs:
//   • Content calendar — the real, all-sections publishing calendar (PreviewCalendar).
//   • AI planner       — the @12thplus AI post planner (relocated from its own nav item).
// Deep-link ?tab=planner opens straight to the AI planner (used by the old
// /post-planner route, which now redirects here).
export function CalendarTabs() {
  const [tab, setTab] = useState<"calendar" | "planner">("calendar");
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "planner") {
      setTab("planner");
    }
  }, []);

  // 36px tall like every control in Business Suite, 14px/500 like its tabs.
  // The page now sits inside .preview-scope, where --brand is bare RGB channels —
  // the old inline background:var(--brand) went invalid there and the active tab
  // turned white-on-white. bg-brand is the in-scope way to say the same colour.
  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-full text-[14px] font-medium px-4 transition ${
      active ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"
    }`;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex h-9 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setTab("calendar")} className={pill(tab === "calendar")}>
            <IconCalendarEvent size={16} /> Content calendar
          </button>
          <button onClick={() => setTab("planner")} className={pill(tab === "planner")}>
            <IconWand size={16} /> AI planner
          </button>
        </div>
      </div>
      {tab === "calendar" ? <PreviewCalendar /> : <Planner />}
    </div>
  );
}
