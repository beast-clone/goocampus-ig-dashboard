import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { canSeeTab } from "@/lib/permissions";
import { TeamCommand } from "./TeamCommand";

// Team Command — the team view: who's in, workload, what each person is on, their plan and tasks.
// Who sees it is the "Team Command" switch on Team & access; anyone without it is sent to
// the Overview.
export const dynamic = "force-dynamic";

export default async function TeamCommandPage() {
  const me = await rosterById(getSessionUserId());
  if (!me || !canSeeTab(me, "team-command")) redirect("/dashboard/preview");
  return <TeamCommand />;
}
