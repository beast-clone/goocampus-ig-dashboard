"use client";
import { useEffect, useState } from "react";
import { IconCalendarEvent, IconWand } from "@tabler/icons-react";
import { HopeCalendar } from "./HopeCalendar";
import { Planner } from "../post-planner/PostPlanner";

// Publishing Calendar = two tabs:
//   • Content calendar — the real, all-sections publishing calendar (HopeCalendar).
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

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-md transition ${
      active ? "text-white" : "text-gray-600 hover:text-gray-900"
    }`;
  // `bg-brand` is a .hope-scope-scoped utility; this page's shell renders the tab
  // bar outside that scope, so the active background comes from --brand inline.
  const activeStyle = { background: "var(--brand, #3A57E8)" };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex bg-white border border-gray-200 rounded-lg p-1 gap-1">
          <button onClick={() => setTab("calendar")} className={pill(tab === "calendar")} style={tab === "calendar" ? activeStyle : undefined}>
            <IconCalendarEvent size={16} /> Content calendar
          </button>
          <button onClick={() => setTab("planner")} className={pill(tab === "planner")} style={tab === "planner" ? activeStyle : undefined}>
            <IconWand size={16} /> AI planner
          </button>
        </div>
      </div>
      {tab === "calendar" ? <HopeCalendar /> : <Planner />}
    </div>
  );
}
