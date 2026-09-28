import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { fetchRoster } from "@/lib/team-db";

// The team, for any signed-in screen that lists people (owner pickers, chat,
// My Day's person switcher…). /api/admin/team has the same people but is
// admin-only and carries permissions; this carries only what a picker shows.
// Inactive people are included, flagged, so old tasks can still name them.

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLoggedIn()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const team = (await fetchRoster()).map((u) => ({
    id: u.id, first: u.first || u.name, name: u.name, initials: u.initials,
    role: u.role, active: u.active, photoUrl: u.photoUrl,
  }));
  return NextResponse.json({ team });
}
