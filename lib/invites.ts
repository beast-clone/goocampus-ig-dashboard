// Shared shape for dashboard invite codes.
//
// An invite is a 6-digit code, stored scrypt-hashed in discover_cache — the plain
// code only ever exists inside the email. It has its own key prefix so it can never
// collide with a self-service password-reset code (`pwd_otp:`) that the same person
// might have in flight, and a 24-hour life rather than 10 minutes because a new
// joiner may not open their email straight away.

export const INVITE_TTL_MS = 24 * 60 * 60_000;

export const inviteKey = (uid: string) => `invite_otp:${uid}`;

export type InvitePayload = { codeHash?: string; expiresAt?: number };
