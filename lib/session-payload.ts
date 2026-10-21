// What a session cookie's payload MEANS — pure functions, no crypto, no node
// builtins, so the Edge middleware and the Node server can share one definition.
//
// This is deliberately a separate file from lib/auth.ts. The middleware cannot
// import node:crypto, so it has always carried its own copy of the signature
// check; letting it also carry its own copy of "is this session still valid"
// is how the two could come to disagree, and a disagreement here is not a bug,
// it is an authentication bypass. Signing stays duplicated (it has to be);
// meaning does not.
//
// Payload format: `<userId|->:<a|u>:<expEpochSec>:<token>`
//
// Anything with a different shape is a pre-expiry session from before this
// change and is treated as expired — which logs everyone out once, on purpose.

// India is UTC+5:30 all year; there is no DST to track. The rest of the
// codebase reaches for Intl with Asia/Kolkata, but Intl gives no offset
// arithmetic and the middleware wants this cheap, so the fixed offset is both
// correct and simpler here.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Signing in at 23:58 must not hand out a two-minute session. Below this, the
// session runs past midnight instead — at most half an hour into the 00:00–06:00
// stop zone, when nobody is working anyway.
const MIN_SESSION_SEC = 30 * 60;

/**
 * Epoch seconds at the next 00:00 IST.
 *
 * Sessions end with the day so that the next morning's sign-in is a real
 * sign-in: lib/attendance.recordLogin stamps the first one of each IST day, and
 * with a week-long session that only ever fired once. Expiry is carried inside
 * the signed payload, not just in the cookie's maxAge, because maxAge is a
 * request to the browser and a copied cookie value ignores it.
 */
export function endOfISTDaySec(now: Date = new Date()): number {
  const ist = now.getTime() + IST_OFFSET_MS;
  const nextIstMidnight = (Math.floor(ist / 86_400_000) + 1) * 86_400_000;
  const endOfDay = Math.floor((nextIstMidnight - IST_OFFSET_MS) / 1000);
  const floor = Math.floor(now.getTime() / 1000) + MIN_SESSION_SEC;
  return Math.max(endOfDay, floor);
}

export type SessionPayload = { userId: string | null; isAdmin: boolean; exp: number };

/** Build the payload half of a cookie value. The caller signs it. */
export function buildPayload(
  userId: string | null | undefined,
  isAdmin: boolean | undefined,
  token: string,
  now: Date = new Date(),
): string {
  return [userId || "-", isAdmin ? "a" : "u", String(endOfISTDaySec(now)), token].join(":");
}

/**
 * Interpret a payload whose signature has ALREADY been verified.
 * Returns null for an expired session or any older payload shape.
 *
 * Never call this on an unverified payload: every field in it is attacker-chosen
 * until the HMAC says otherwise.
 */
export function readPayload(
  payload: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  const parts = payload.split(":");
  if (parts.length !== 4) return null; // legacy session, from before expiry existed
  const [rawUser, flag, rawExp] = parts;
  const exp = Number(rawExp);
  if (!Number.isFinite(exp) || exp <= nowSec) return null;
  return { userId: rawUser === "-" ? null : rawUser, isAdmin: flag === "a", exp };
}
