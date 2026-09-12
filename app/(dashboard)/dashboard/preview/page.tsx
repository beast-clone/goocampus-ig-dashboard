import { PreviewOverview } from "./PreviewOverview";
import { getSessionUserId } from "@/lib/auth";
import { getUserById } from "@/lib/users";

// Dashboard reskin — PROOF PAGE (Overview only).
// Self-contained: its own themed shell + real @goocampus data. Does not touch
// the shared Sidebar/DashboardShell, so the rest of the dashboard is untouched.
// (Inter is loaded globally in app/layout.tsx.)

// Reads the session cookie to greet the signed-in person by name, so force-dynamic.
export const dynamic = "force-dynamic";

export default function PreviewPage() {
  const user = getUserById(getSessionUserId());
  return <PreviewOverview person={user?.name || ""} />;
}
