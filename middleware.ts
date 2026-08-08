import { NextRequest, NextResponse } from "next/server";

// Edge-runtime middleware — uses Web Crypto (crypto.subtle), NOT node:crypto.
// Two responsibilities:
//   1. Auth-gate /dashboard/* and most /api/* (mutations require valid signed cookie)
//   2. CSRF: on state-changing methods (POST/PUT/DELETE/PATCH), require Origin or Referer to match Host
//      (exception: /api/login — no session yet, and /api/cron/* — auth via header secret)

// Public API routes that should NOT require auth (callable without cookie):
const PUBLIC_API_ROUTES = new Set<string>([
  "/api/login",
  "/api/logout",
  "/api/auth/google/start",
  "/api/auth/google/callback",
  "/api/lead-form/submit", // public: leads submit the per-post capture form without a login
]);

// CRON routes that auth themselves via x-cron-secret header — middleware should NOT gate them
const CRON_PREFIX = "/api/cron";

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Hex-encoded HMAC-SHA256 of `payload` using `secret`.
async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyCookie(value: string | undefined, secret: string): Promise<boolean> {
  if (!value || !value.includes(".")) return false;
  const idx = value.lastIndexOf(".");
  const token = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!token || !sig) return false;
  const expected = await hmacHex(secret, token);
  return safeEqualHex(sig, expected);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const secret = process.env.SESSION_SECRET;

  // CSRF: same-origin check on every mutating request EXCEPT login/cron
  if (
    MUTATING_METHODS.has(method) &&
    !PUBLIC_API_ROUTES.has(pathname) &&
    !pathname.startsWith(CRON_PREFIX)
  ) {
    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    const host = req.headers.get("host") || "";
    let ok = false;
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        ok = originHost === host;
      } catch { ok = false; }
    }
    if (!ok) {
      return NextResponse.json({ error: "CSRF: cross-origin request blocked" }, { status: 403 });
    }
  }

  // Auth gate
  if (!secret) {
    return NextResponse.json({ error: "Server not configured (SESSION_SECRET missing)" }, { status: 500 });
  }

  const isAuthed = await verifyCookie(req.cookies.get("gc_session")?.value, secret);

  // /api/login and /api/logout always allowed
  if (PUBLIC_API_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  // Cron routes auth themselves
  if (pathname.startsWith(CRON_PREFIX)) {
    return NextResponse.next();
  }

  const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/api/");

  if (!isAuthed && isProtected) {
    // For API calls return 401 JSON; for pages redirect to /login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Everyone now works in the V2 dashboard (user decision 2026-07-31: producers
  // get the full dashboard like admins, and each logs in as themselves). The old
  // parked member world at /me is retired — send any authed hit there into V2.
  if (isAuthed && (pathname === "/me" || pathname.startsWith("/me/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard/hope-preview";
    return NextResponse.redirect(url);
  }

  // The dashboard is open to any authenticated teammate. V1 is RETIRED / OFFLINE
  // (user order 2026-07-18): all live tabs are under /dashboard/hope-preview (V2),
  // so any other /dashboard path (old V1 pages) redirects to V2 and is never served.
  if (isAuthed && pathname.startsWith("/dashboard")) {
    if (!pathname.startsWith("/dashboard/hope-preview")) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard/hope-preview";
      return NextResponse.redirect(url);
    }
  }

  if (isAuthed && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard/hope-preview";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/me", "/me/:path*", "/login", "/api/:path*"],
};
