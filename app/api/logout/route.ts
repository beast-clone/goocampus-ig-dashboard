import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

// The logout buttons (header menu + sidebar) submit a plain HTML <form method="post">,
// which NAVIGATES the browser to this response. So instead of returning JSON (which
// left the user staring at {"ok":true}), redirect them to /login after clearing the
// session. 303 → the browser follows with a GET. APP_URL keeps the URL on the real
// prod origin (on Netlify req.url is the deploy-permalink host).
export async function POST(req: Request) {
  clearSession();
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return NextResponse.redirect(`${origin}/login`, 303);
}
