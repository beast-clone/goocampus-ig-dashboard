import { PreviewOverview } from "./PreviewOverview";

// Dashboard reskin — PROOF PAGE (Overview only).
// Self-contained: its own themed shell + real @goocampus data. Does not touch
// the shared Sidebar/DashboardShell, so the rest of the dashboard is untouched.
// (Inter is loaded globally in app/layout.tsx.)

export default function PreviewPage() {
  return <PreviewOverview />;
}
