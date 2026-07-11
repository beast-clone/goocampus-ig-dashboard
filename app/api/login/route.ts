import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import { isValidUserId, getUserByEmail } from "@/lib/users";
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

  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || !password || password !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  // Identity by email (preferred) or slug. Unknown/absent → no identity (legacy session).
  const byEmail = getUserByEmail(email);
  const userId = byEmail ? byEmail.id : (isValidUserId(user) ? user : undefined);
  setSession(userId);
  return NextResponse.json({ ok: true, user: userId ?? null });
}
