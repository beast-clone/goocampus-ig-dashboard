import { redirect } from "next/navigation";
import { getSessionIsAdmin } from "@/lib/auth";
import { Approvals } from "./Approvals";

// Approvals — admin-only queue of publish-date changes awaiting sign-off. A
// non-admin who reaches the URL is bounced to the Overview.
export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  if (!getSessionIsAdmin()) redirect("/dashboard/preview");
  return <Approvals />;
}
