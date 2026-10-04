import { NextRequest, NextResponse } from "next/server";
import { readPayload } from "@/lib/session-payload";

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
  "/api/account/accept-invite", // public: a new member sets their password from an emailed code
  "/api/facebook/data-deletion", // public: Meta POSTs here; authenticates via HMAC signed_request, not a cookie
  "/api/mcp", // Claude connector: authenticates with a personal Bearer key (lib/claude-connector), not a cookie
  // WhatsApp broadcast: n8n on the VPS polls these with x-cron-secret (the routes
  // check it themselves) — it has no dashboard session to send.
  "/api/scheduler/whatsapp/due",
  "/api/scheduler/whatsapp/status",
]);

// CRON routes that auth themselves via x-cron-secret header — middleware should NOT gate them
const CRON_PREFIX = "/api/cron";

// The Claude connector authenticates with a personal key, either in the Authorization
// header (/api/mcp) or in the path (/api/mcp/<key>, for Claude Desktop and claude.ai,
// which give you nowhere to put a header). A prefix rather than an exact match, because
// the key form puts the credential IN the path — so "/api/mcp" alone never matches it.
//
// It is also exempt from the CSRF origin check below: these requests come from a
// desktop app or a server, so there is no same-origin header to compare, and the key
// is doing the job the cookie would have done.
const MCP_PREFIX = "/api/mcp";

// OAuth endpoints Claude's own servers call: no session cookie to send, and no
// same-origin header either, so they sit outside both gates. Safe to open because
// none of them grants anything on its own — /register hands out a client_id, which is
// not a credential, and /token only works with a code that a signed-in person approved
// on the consent screen, proved by PKCE.
//
// /api/oauth/approve is deliberately NOT here: that one is driven by a person in a
// browser and must keep both the session check and the CSRF check.
const OAUTH_PUBLIC = new Set<string>([
  "/api/oauth/metadata",
  "/api/oauth/resource",
  "/api/oauth/register",
  "/api/oauth/token",
]);

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

// Returns the session if the signature checks out AND it has not expired, else
// null. It returns the session rather than a boolean on purpose: when this was
// a boolean, the admin flag was read separately, which meant a caller could
// consult the flag without having checked anything. Now there is one answer.
async function readSession(
  value: string | undefined,
  secret: string,
): Promise<{ isAdmin: boolean } | null> {
  if (!value || !value.includes(".")) return null;
  const idx = value.lastIndexOf(".");
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!payload || !sig) return null;
  const expected = await hmacHex(secret, payload);
  if (!safeEqualHex(sig, expected)) return null;
  // Signature good; the payload decides whether it is still valid. Shares one
  // implementation with the Node side (lib/session-payload) so the two cannot
  // drift apart on what "expired" means.
  const read = readPayload(payload);
  return read ? { isAdmin: read.isAdmin } : null;
}

// Where an authed user lands after login / off the retired /me: the Overview,
// for everyone. Admins used to be dropped straight into Team Command, which
// meant signing in never showed you the numbers you signed in to see.
const homeFor = (_admin: boolean) => "/dashboard/preview";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const secret = process.env.SESSION_SECRET;

  // CSRF: same-origin check on every mutating request EXCEPT login/cron
  if (
    MUTATING_METHODS.has(method) &&
    !PUBLIC_API_ROUTES.has(pathname) &&
    !pathname.startsWith(CRON_PREFIX) &&
    !pathname.startsWith(MCP_PREFIX) &&
    !OAUTH_PUBLIC.has(pathname)
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

  const session = await readSession(req.cookies.get("gc_session")?.value, secret);
  const isAuthed = session !== null;
  const isAdmin = session?.isAdmin ?? false;

  // /api/login and /api/logout always allowed
  if (PUBLIC_API_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  // Cron routes auth themselves
  if (pathname.startsWith(CRON_PREFIX)) {
    return NextResponse.next();
  }

  // So does the Claude connector, by key.
  if (pathname.startsWith(MCP_PREFIX)) {
    return NextResponse.next();
  }

  // And so does the OAuth handshake.
  if (OAUTH_PUBLIC.has(pathname)) {
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
    url.pathname = homeFor(isAdmin);
    return NextResponse.redirect(url);
  }

  // The dashboard is open to any authenticated teammate. V1 is RETIRED / OFFLINE
  // (user order 2026-07-18): all live tabs are under /dashboard/preview (V2),
  // so any other /dashboard path (old V1 pages) redirects to V2 and is never served.
  if (isAuthed && pathname.startsWith("/dashboard")) {
    if (!pathname.startsWith("/dashboard/preview")) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard/preview";
      return NextResponse.redirect(url);
    }
  }

  if (isAuthed && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = homeFor(isAdmin);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/me", "/me/:path*", "/login", "/api/:path*"],
};
