import { Inter } from "next/font/google";
import { HopeOverview } from "./HopeOverview";

// Hope UI reskin — PROOF PAGE (Overview only, on the feat/hope-ui-reskin branch).
// Self-contained: its own Hope-UI shell + real @goocampus data. Does not touch
// the shared Sidebar/DashboardShell, so the rest of the dashboard is untouched.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export default function HopePreviewPage() {
  return (
    <div className={inter.className}>
      <HopeOverview />
    </div>
  );
}
