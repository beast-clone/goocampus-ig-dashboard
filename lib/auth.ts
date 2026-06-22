import { cookies } from "next/headers";

const COOKIE = "gc_session";

export function isLoggedIn(): boolean {
  const c = cookies().get(COOKIE)?.value;
  return c === process.env.SESSION_SECRET;
}

export function setSession() {
  cookies().set(COOKIE, process.env.SESSION_SECRET ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}
