import { NextResponse } from "next/server";
import { isLoggedIn, setSession } from "@/lib/auth";
import { isValidUserId } from "@/lib/users";

// Attach identity to an already-authenticated session (no password re-entry).
// Used when someone has a valid session but hasn't picked who they are yet
// (e.g. a legacy main-dashboard session opening /me).
export async function POST(req: Request) {
  if (!isLoggedIn()) return NextResponse.json({ ok: false }, { status: 401 });
  let user: string | undefined;
  try {
    const b = await req.json();
    user = typeof b?.user === "string" ? b.user : undefined;
  } catch {}
  if (!isValidUserId(user)) return NextResponse.json({ ok: false, error: "invalid user" }, { status: 400 });
  setSession(user);
  return NextResponse.json({ ok: true, user });
}
