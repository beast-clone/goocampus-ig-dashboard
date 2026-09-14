import { redirect } from "next/navigation";
import { getSessionIsAdmin } from "@/lib/auth";
import { TeamCommand } from "./TeamCommand";

// Team Command — the admin's cockpit for the whole team (attendance, workload,
// tasks + day plan, running-long flags). Admin-only: a non-admin who reaches the
// URL is bounced to the Overview. Data is composed from existing endpoints.
export const dynamic = "force-dynamic";

export default function TeamCommandPage() {
  if (!getSessionIsAdmin()) redirect("/dashboard/preview");
  return <TeamCommand />;
}
