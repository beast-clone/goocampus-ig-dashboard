import { NextResponse } from "next/server";
import { isLoggedIn, getSessionIsAdmin, getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { fetchSbus, addSbu } from "@/lib/sbus-db";
import { bustMarketingHubCache } from "@/lib/mh-cache";

// The brand list for every brand picker in the dashboard (lib/use-sbus.ts).
// Anyone signed in can read it; only an admin can add to it, because a stray
// brand shows up in every dropdown and report for the whole team.

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLoggedIn()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ sbus: await fetchSbus() });
}

export async function POST(req: Request) {
  if (!isLoggedIn()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can add a brand." }, { status: 403 });
  try {
    const b = (await req.json()) as { name?: string };
    const name = await addSbu(String(b.name || ""), getSessionUserId() || null);
    bustMarketingHubCache();
    return NextResponse.json({ name, sbus: await fetchSbus(true) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not add the brand"), { status: 400 });
  }
}
