import { NextResponse } from "next/server";
import { isLoggedIn, setSession } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// Attach identity to an already-authenticated session (no password re-entry).
// Used when someone has a valid session but hasn't picked who they are yet
// (e.g. a legacy main-dashboard session opening /me).
//
// Guard rails: this endpoint hands out an identity WITHOUT a password, so it may
// only hand out identities that the shared password could have claimed anyway —
// never an admin, and never someone who protected their account with a personal
// password. Those must go through /api/login.
export async function POST(req: Request) {
  if (!isLoggedIn()) return NextResponse.json({ ok: false }, { status: 401 });
  let user: string | undefined;
  try {
    const b = await req.json();
    user = typeof b?.user === "string" ? b.user : undefined;
  } catch {}
  const person = await rosterById(user);
  if (!person || !person.active) {
    return NextResponse.json({ ok: false, error: "invalid user" }, { status: 400 });
  }
  if (person.isAdmin || person.hasPassword) {
    return NextResponse.json(
      { ok: false, error: "This account requires a password sign-in." },
      { status: 403 },
    );
  }
  setSession(person.id, false);
  return NextResponse.json({ ok: true, user: person.id });
}
