import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { fetchRoster } from "@/lib/team-db";

// GET /api/team-photos → { photos: { [userId]: url } } — everyone's profile picture, for
// avatars around the dashboard (My Day, owners, comments). Any signed-in person.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!getSessionUserId()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const roster = await fetchRoster();
  const photos: Record<string, string> = {};
  for (const u of roster) if (u.active && u.photoUrl) photos[u.id] = u.photoUrl;
  return NextResponse.json({ photos });
}
