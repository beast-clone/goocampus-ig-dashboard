"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The standalone AI Post Planner was folded into the Publishing Calendar as a tab
// (see calendar/CalendarTabs.tsx). This route redirects there — deep-linking straight
// to the planner tab — so old links/bookmarks keep working.
export default function PostPlannerPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/preview/calendar?tab=planner");
  }, [router]);
  return null;
}
