import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionIsAdmin, isLoggedIn } from "@/lib/auth";
import { saveGmailGrant } from "@/lib/gmail-api";

// GET /api/auth/gmail/callback?code=…&state=…
// Where Google sends the person back after they allow sending. Swaps the code for a
// refresh token, remembers which address granted it, and returns to Watchers with a
// flag the page turns into a sentence.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const here = new URL(req.url);
  const back = (flag: string, detail?: string) => {
    const u = new URL("/dashboard/preview/watchers", here.origin);
    u.searchParams.set("gmail", flag);
    if (detail) u.searchParams.set("why", detail.slice(0, 200));
    const res = NextResponse.redirect(u);
    res.cookies.delete("gmail_oauth_state");
    return res;
  };

  if (!isLoggedIn()) return NextResponse.redirect(new URL("/login", here.origin));
  if (!getSessionIsAdmin()) return back("notadmin");

  // "Deny" on the consent screen comes back as an error, not a code.
  const err = here.searchParams.get("error");
  if (err) return back("denied", err);

  const code = here.searchParams.get("code");
  const state = here.searchParams.get("state");
  const expected = cookies().get("gmail_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return back("failed", "The sign-in took too long or was started somewhere else. Try again.");

  // Must match the redirect_uri sent to Google exactly, so it is derived the same way.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(here.origin);
  const origin = (local ? here.origin : (process.env.APP_URL || here.origin)).replace(/\/$/, "");

  try {
    const email = await saveGmailGrant(code, `${origin}/api/auth/gmail/callback`);
    return back("connected", email);
  } catch (e) {
    return back("failed", (e as Error).message);
  }
}
