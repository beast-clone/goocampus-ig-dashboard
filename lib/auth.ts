// HMAC-signed session cookie + simple CSRF helpers.
// The cookie value is `<random-token>.<hmac-sig>` — only the server (which knows
// SESSION_SECRET) can produce a valid signature, so a leaked SESSION_SECRET
// is still safer than the previous "cookie value equals SESSION_SECRET" pattern.

import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const COOKIE = "gc_session";
const SESSION_LIFETIME_SEC = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET not set or too short (need 32+ chars)");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Cookie value is `<payload>.<sig>` where payload is either just `<token>` (legacy,
// no identity), `<userId>:<token>` (carries who logged in), or `<userId>:a:<token>`
// (logged in as an admin — the middleware reads this flag to open /dashboard/* without
// a DB lookup; it's inside the signed payload so it can't be forged). The signature
// always covers the whole payload, so the middleware's verify (which signs everything
// before the last dot) keeps working unchanged whichever form is present.
function makeCookieValue(userId?: string | null, isAdmin?: boolean): string {
  const token = randomBytes(24).toString("hex");
  const payload = userId ? (isAdmin ? `${userId}:a:${token}` : `${userId}:${token}`) : token;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function parseVerified(value: string | undefined): { valid: boolean; userId: string | null } {
  if (!value || !value.includes(".")) return { valid: false, userId: null };
  const idx = value.lastIndexOf(".");
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!payload || !sig) return { valid: false, userId: null };
  try {
    if (!safeEqual(sig, sign(payload))) return { valid: false, userId: null };
  } catch {
    return { valid: false, userId: null };
  }
  const ci = payload.indexOf(":");
  const userId = ci > 0 ? payload.slice(0, ci) : null;
  return { valid: true, userId };
}

function verifyCookieValue(value: string | undefined): boolean {
  return parseVerified(value).valid;
}

export function isLoggedIn(): boolean {
  return parseVerified(cookies().get(COOKIE)?.value).valid;
}

// Who is logged in? Returns the userId embedded in the session, or null (legacy session).
export function getSessionUserId(): string | null {
  return parseVerified(cookies().get(COOKIE)?.value).userId;
}

// Is the current session an admin? Reads the signed `:a:` flag in the cookie
// payload (`<userId>:a:<token>`) — the same flag the Edge middleware trusts to
// open /dashboard/*. Lets server components branch on admin without a DB lookup.
export function getSessionIsAdmin(): boolean {
  const value = cookies().get(COOKIE)?.value;
  if (!value || !parseVerified(value).valid) return false;
  const payload = value.slice(0, value.lastIndexOf("."));
  const parts = payload.split(":");
  return parts.length === 3 && parts[1] === "a";
}

export function setSession(userId?: string | null, isAdmin?: boolean) {
  cookies().set(COOKIE, makeCookieValue(userId, isAdmin), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_LIFETIME_SEC,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

// Exposed for the middleware (which runs in the Edge runtime and can't use node:crypto directly,
// but Next.js middleware actually CAN use the Web Crypto API; we re-export to keep one source of truth).
export { verifyCookieValue };
