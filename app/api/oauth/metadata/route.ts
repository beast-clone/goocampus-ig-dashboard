import { NextResponse } from "next/server";
import { issuer } from "@/lib/oauth";

// Discovery. Claude reads these two documents before it does anything else, which is
// why the first attempt failed with "couldn't register with Marketing OS's sign-in
// service": it asked for them, got 404, and had nowhere to go.
//
// Served at the domain root via rewrites in next.config.js, because the spec puts them
// at /.well-known/… and a client will not look anywhere else.
//
// Public and cached: they contain no secrets, just addresses.

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export async function GET(req: Request) {
  const iss = issuer(req.url);
  return NextResponse.json(
    {
      issuer: iss,
      authorization_endpoint: `${iss}/oauth/authorize`,
      token_endpoint: `${iss}/api/oauth/token`,
      registration_endpoint: `${iss}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // S256 only — "plain" defeats the point of PKCE and nothing here needs it.
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp"],
      service_documentation: `${iss}/dashboard/preview/connectors`,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
