import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionIsAdmin, isLoggedIn } from "@/lib/auth";
import { GMAIL_SCOPES, hasGoogleClient } from "@/lib/gmail-api";

// GET /api/auth/gmail/start
// Asks a GooCampus Google account for permission to send mail as itself, using the
// same OAuth client as "Sign in with Google" — one Google app, one more scope.
//
// Admin only: whoever clicks this decides the address every notice in the dashboard
// goes out as, for everyone.
//
// Dynamic for the same reason the login route is: a prerendered copy would freeze
// one `state` and its cookie into the CDN, and every later consent would fail.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const here = new URL(req.url);
  const back = (flag: string) => {
    const u = new URL("/dashboard/preview/watchers", here.origin);
    u.searchParams.set("gmail", flag);
    return NextResponse.redirect(u);
  };

  if (!isLoggedIn()) return NextResponse.redirect(new URL("/login", here.origin));
  if (!getSessionIsAdmin()) return back("notadmin");
  if (!hasGoogleClient()) return back("noclient");

  // On localhost the request origin IS the registered redirect; in production the
  // function sees the deploy-permalink host, so the stable APP_URL has to win or
  // Google answers redirect_uri_mismatch.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(here.origin);
  const origin = (local ? here.origin : (process.env.APP_URL || here.origin)).replace(/\/$/, "");
  const redirectUri = `${origin}/api/auth/gmail/callback`;

  const state = randomBytes(16).toString("hex");
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_LOGIN_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", GMAIL_SCOPES);
  auth.searchParams.set("state", state);
  auth.searchParams.set("hd", "goocampus.in");
  // offline + consent together are what produce a refresh token. Without consent
  // Google silently returns none on every grant after the first, and the connection
  // then dies an hour later with no clue why.
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(auth);
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600,
  });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
