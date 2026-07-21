import { HopeOverview } from "./HopeOverview";

// Hope UI reskin — PROOF PAGE (Overview only, on the feat/hope-ui-reskin branch).
// Self-contained: its own Hope-UI shell + real @goocampus data. Does not touch
// the shared Sidebar/DashboardShell, so the rest of the dashboard is untouched.
// (Inter is loaded globally in app/layout.tsx.)

export default function HopePreviewPage() {
  return <HopeOverview />;
}
