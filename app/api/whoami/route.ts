import { NextResponse } from "next/server";
import { isLoggedIn, setSession, getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { recordLogin } from "@/lib/attendance";

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

  // Only a session that has no identity yet may claim one. The guard below
  // ("never an admin, never someone with a personal password") was written when
  // the shared password was the whole auth model, so anything it could have
  // claimed was fair game. That reasoning expired once people got their own
  // sections and capabilities: an identified user calling this would be
  // swapping into someone else's permissions, not re-stating their own. This
  // endpoint exists for the legacy case only, and that case has no userId.
  if (getSessionUserId()) {
    return NextResponse.json({ ok: false, error: "This session already has an identity." }, { status: 403 });
  }

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
  await recordLogin(person.id);
  return NextResponse.json({ ok: true, user: person.id });
}
