import { PreviewOverview } from "./PreviewOverview";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// Dashboard reskin — PROOF PAGE (Overview only).
// Self-contained: its own themed shell + real @goocampus data. Does not touch
// the shared Sidebar/DashboardShell, so the rest of the dashboard is untouched.
// (Inter is loaded globally in app/layout.tsx.)

// Reads the session cookie to greet the signed-in person by name, so force-dynamic.
export const dynamic = "force-dynamic";

export default async function PreviewPage() {
  const user = await rosterById(getSessionUserId());
  // First name, not the full one. The Team record's full name is whatever somebody
  // typed — Nikhil's reads "Nikhi" — and a greeting is the one place a typo is
  // read as the dashboard not knowing who you are. Falls back to the full name
  // for anyone whose record has no first name.
  return <PreviewOverview person={user?.first || user?.name || ""} />;
}
