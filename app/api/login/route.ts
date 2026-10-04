import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import { rosterByEmail, rosterById } from "@/lib/team-db";
import { verifyPassword } from "@/lib/passwords";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordLogin } from "@/lib/attendance";

const LOGIN_MAX = 5;             // 5 attempts
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // per 15 minutes per IP

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const limit = rateLimit(`login:${ip}`, LOGIN_MAX, LOGIN_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec || 60) } },
    );
  }

  let password: string | undefined;
  let user: string | undefined;
  let email: string | undefined;
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : undefined;
    user = typeof body?.user === "string" ? body.user : undefined;
    email = typeof body?.email === "string" ? body.email : undefined;
  } catch {
    password = undefined;
  }

  if (!password) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Identity by email (preferred) or slug — looked up in the live roster (ind_users,
  // with the code list as fallback if Supabase is unreachable).
  const person = email?.trim()
    ? await rosterByEmail(email)
    : user
      ? await rosterById(user)
      : null;

  if (person) {
    // Deactivation is checked AFTER the password, not before. Answering "this
    // account is deactivated" to anyone who types the address told an attacker
    // which addresses are real and, worse, which belong to people who are no
    // longer around to notice anything happening to them. Now you have to prove
    // you are that person before the system tells you anything about them.
    //
    // A personal password is now the only way in. The shared team password used
    // to stand in for anyone who had not set one, which meant whoever knew it
    // could sign in AS a colleague — their sections, their capabilities, their
    // name on everything they then did. That was a deliberate transitional step
    // (sql/005_per_user_passwords.sql) and it has outlived its purpose: every
    // active account has its own password.
    //
    // Someone added to the roster without one can no longer log in at all, which
    // is the correct outcome — they get an invite via /api/account/accept-invite
    // and set their own.
    if (!person.passwordHash || !verifyPassword(password, person.passwordHash)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Identity proven. Only now is it safe to say the account is switched off.
    if (!person.active) {
      return NextResponse.json({ ok: false, error: "This account is deactivated." }, { status: 403 });
    }
    setSession(person.id, person.isAdmin);
    // Signing in IS the clock-in (spec §10). Doing it here rather than in My Day
    // means it happens for admins too, whatever page they open first, on the
    // server's IST clock instead of the laptop's. First sign-in of the day wins.
    await recordLogin(person.id);
    return NextResponse.json({ ok: true, user: person.id });
  }

  // No match. One response for "no such account" and for "wrong password"
  // alike, so this cannot be used to test which addresses are real before
  // spending any guesses on them — the rule /api/account/accept-invite already
  // follows deliberately.
  //
  // The identity-less session that used to live here is gone. Submitting the
  // shared password with no email minted a session with no userId that still
  // passed middleware, so anything relying on middleware alone was reachable
  // by whoever knew one static string — and every action it took landed in the
  // activity feed and attendance records with no actor, making a compromise
  // unreviewable afterwards. That password was also committed in
  // PROJECT_HANDOFF.md and pushed to five branches.
  return NextResponse.json({ ok: false }, { status: 401 });
}
