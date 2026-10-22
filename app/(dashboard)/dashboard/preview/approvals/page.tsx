import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { canSeeTab } from "@/lib/permissions";
import { TeamCommand } from "../team-command/TeamCommand";

// Approvals — publish-date changes waiting for an admin (same cards Team Command had).
// Who sees it is the "Approvals" switch on Team & access; anyone without it is sent to
// the Overview.
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const me = await rosterById(getSessionUserId());
  if (!me || !canSeeTab(me, "approvals")) redirect("/dashboard/preview");
  return <TeamCommand mode="approvals" />;
}
