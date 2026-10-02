import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { disconnectGmail } from "@/lib/gmail-api";
import { safeError } from "@/lib/errors";

// POST /api/watchers/disconnect-email
// Forgets the connected Google account, so nothing is sent until one is connected
// again. Admin only, for the same reason connecting is: it decides the sending
// address for everyone.
//
// This only drops our copy of the grant. Google keeps its own record until the
// account owner removes it at myaccount.google.com/permissions.
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can change the sending account." }, { status: 403 });
  try {
    await disconnectGmail();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't disconnect"), { status: 502 });
  }
}
