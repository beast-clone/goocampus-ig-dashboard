import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { canUseConnector } from "@/lib/claude-connector";
import { getClient, issueCode } from "@/lib/oauth";

// Where the Approve / Cancel buttons land.
//
// Session-authenticated (it is NOT in the middleware's public list) and same-origin
// checked by the middleware's CSRF rule, so this cannot be driven from another site —
// which matters, because this is the step that actually hands out access.

export const dynamic = "force-dynamic";

const back = (uri: string, params: Record<string, string>) => {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return NextResponse.redirect(u.toString(), 303);
};

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const s = (k: string) => String(form.get(k) ?? "").trim();
  const clientId = s("client_id"), redirectUri = s("redirect_uri");
  const challenge = s("code_challenge"), state = s("state");

  // Re-validate everything rather than trusting the hidden fields — they came back
  // through a browser and could have been edited on the way.
  const client = clientId ? await getClient(clientId) : null;
  if (!client || !redirectUri || !client.redirectUris.includes(redirectUri) || !challenge) {
    return NextResponse.json({ error: "invalid_request", error_description: "This approval no longer matches a valid request. Start again from Claude." }, { status: 400 });
  }

  if (s("decision") !== "allow") return back(redirectUri, { error: "access_denied", state });

  const userId = getSessionUserId();
  if (!userId || !(await canUseConnector(userId))) {
    return back(redirectUri, { error: "access_denied", error_description: "Not permitted", state });
  }

  const code = await issueCode({ userId, clientId, redirectUri, challenge });
  return back(redirectUri, { code, state });
}
