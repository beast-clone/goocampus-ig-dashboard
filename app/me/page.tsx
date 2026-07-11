import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLoggedIn, getSessionUserId } from "@/lib/auth";
import { isValidUserId } from "@/lib/users";
import WhoAmI from "@/components/WhoAmI";

export const metadata: Metadata = {
  title: "My GooCampus",
  description: "Your individual GooCampus workspace — day plan, tasks, team chat.",
};

// The individual (per-person) dashboard. Rendered from the self-contained
// page in /public/individual.html so its own styling stays isolated from the
// main app's Tailwind globals. It reads identity via /api/me and persists
// per-person data via /api/individual/*.
export default function IndividualDashboardPage() {
  // Not signed in at all → send to login. Signed in but no identity yet
  // (e.g. a legacy session) → show the quick name-picker (no password re-entry).
  if (!isLoggedIn()) redirect("/login?next=/me");
  if (!isValidUserId(getSessionUserId())) return <WhoAmI />;
  return (
    <iframe
      src="/individual.html"
      title="Individual dashboard"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
