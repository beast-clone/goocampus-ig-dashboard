import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import { rosterByEmail, rosterById } from "@/lib/team-db";
import { verifyPassword } from "@/lib/passwords";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

  const shared = process.env.DASHBOARD_PASSWORD;
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
    if (!person.active) {
      return NextResponse.json({ ok: false, error: "This account is deactivated." }, { status: 403 });
    }
    // Personal password, if set, is the ONLY password that works for this person.
    // No personal password yet → the shared team password still logs them in.
    const ok = person.hasPassword
      ? verifyPassword(password, person.passwordHash)
      : !!shared && password === shared;
    if (!ok) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    setSession(person.id, person.isAdmin);
    return NextResponse.json({ ok: true, user: person.id });
  }

  // Someone typed an email we don't know → reject (don't silently log them in
  // as an identity-less session; that hides typos).
  if (email?.trim()) {
    return NextResponse.json({ ok: false, error: "Unknown email." }, { status: 401 });
  }

  // Legacy flow: no identity given, shared password only → identity-less session.
  if (!shared || password !== shared) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  setSession(undefined);
  return NextResponse.json({ ok: true, user: null });
}
