import { NextResponse } from "next/server";
import { consumeCode, issueTokens, rotateRefresh, getClient } from "@/lib/oauth";

// The token endpoint: code → tokens, and refresh → fresh tokens.
//
// Form-encoded, not JSON: that is what the spec says and what clients send.
// No client secret — this is a public client, so PKCE is what proves that the caller
// redeeming the code is the same one that started the flow.

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};
const NO_STORE = { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" };

const bad = (error: string, description?: string, status = 400) =>
  NextResponse.json({ error, ...(description ? { error_description: description } : {}) }, { status, headers: NO_STORE });

async function readForm(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    for (const [k, v] of Object.entries(j || {})) if (typeof v === "string") out[k] = v;
    return out;
  }
  const body = await req.text();
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

export async function POST(req: Request) {
  const f = await readForm(req);
  const clientId = (f.client_id || "").trim();
  if (!clientId) return bad("invalid_request", "client_id is required");
  if (!(await getClient(clientId))) return bad("invalid_client", "Unknown client_id.", 401);

  if (f.grant_type === "authorization_code") {
    const res = await consumeCode({
      code: (f.code || "").trim(),
      clientId,
      redirectUri: (f.redirect_uri || "").trim(),
      verifier: (f.code_verifier || "").trim(),
    });
    if ("error" in res) return bad(res.error, "That code is expired, already used, or doesn't match this request.");
    const t = await issueTokens(res.userId, clientId);
    return NextResponse.json(
      { access_token: t.access, token_type: "Bearer", expires_in: t.expiresIn, refresh_token: t.refresh, scope: "mcp" },
      { headers: NO_STORE },
    );
  }

  if (f.grant_type === "refresh_token") {
    const t = await rotateRefresh((f.refresh_token || "").trim(), clientId);
    // Also the answer when access was taken away on the Team page — the client is told
    // to start again, which lands the person back on the consent screen.
    if (!t) return bad("invalid_grant", "That refresh token is no longer valid. Connect again.");
    return NextResponse.json(
      { access_token: t.access, token_type: "Bearer", expires_in: t.expiresIn, refresh_token: t.refresh, scope: "mcp" },
      { headers: NO_STORE },
    );
  }

  return bad("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
