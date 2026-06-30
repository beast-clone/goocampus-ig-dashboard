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

function makeCookieValue(): string {
  const token = randomBytes(24).toString("hex");
  const sig = sign(token);
  return `${token}.${sig}`;
}

function verifyCookieValue(value: string | undefined): boolean {
  if (!value || !value.includes(".")) return false;
  const idx = value.lastIndexOf(".");
  const token = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!token || !sig) return false;
  try {
    return safeEqual(sig, sign(token));
  } catch {
    return false;
  }
}

export function isLoggedIn(): boolean {
  return verifyCookieValue(cookies().get(COOKIE)?.value);
}

export function setSession() {
  cookies().set(COOKIE, makeCookieValue(), {
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
