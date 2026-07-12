import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

// GET /api/auth/google/start
// Kicks off "Sign in with your GooCampus Google account". If the Google OAuth
// login client isn't configured yet, it bounces back to /login with a friendly
// flag instead of erroring — so the button is safe to show in a demo.

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const clientId = process.env.GOOGLE_LOGIN_CLIENT_ID;

  if (!clientId) {
    const back = new URL("/login", origin);
    back.searchParams.set("google", "off");
    return NextResponse.redirect(back);
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${origin}/api/auth/google/callback`;

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("hd", "goocampus.in"); // hint: only the GooCampus workspace
  auth.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(auth);
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
