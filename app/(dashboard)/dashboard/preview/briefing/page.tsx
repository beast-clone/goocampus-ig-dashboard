import { BriefingClient } from "./BriefingClient";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// My Workspace → Briefing: the competitor-radar morning start page. First thing a
// member sees when they open My Workspace.
export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const user = await rosterById(getSessionUserId());
  return <BriefingClient person={user?.first || ""} />;
}
