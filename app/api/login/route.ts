import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
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
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : undefined;
  } catch {
    password = undefined;
  }

  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || !password || password !== expected) {
    // TEMP diagnostic — returns ONLY lengths + first/last chars, never the values themselves.
    // Useful for tracking down autofill / encoding issues. Remove after the lockout is solved.
    return NextResponse.json({
      ok: false,
      _debug: {
        gotLen: password?.length ?? 0,
        gotFirst: password?.slice(0, 2) || "",
        gotLast: password?.slice(-2) || "",
        expectedLen: expected?.length ?? 0,
        expectedFirst: expected?.slice(0, 2) || "",
        expectedLast: expected?.slice(-2) || "",
        match: password === expected,
      },
    }, { status: 401 });
  }
  setSession();
  return NextResponse.json({ ok: true });
}
