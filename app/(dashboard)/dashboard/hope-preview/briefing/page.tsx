import { BriefingClient } from "./BriefingClient";
import { getSessionUserId } from "@/lib/auth";
import { getUserById } from "@/lib/users";

// My Workspace → Briefing: the competitor-radar morning start page. First thing a
// member sees when they open My Workspace.
export const dynamic = "force-dynamic";

export default function BriefingPage() {
  const user = getUserById(getSessionUserId());
  return <BriefingClient person={user?.first || ""} />;
}
