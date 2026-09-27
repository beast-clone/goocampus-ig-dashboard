import { NextResponse } from "next/server";
import { issuer } from "@/lib/oauth";

// Protected-resource metadata (RFC 9728): "this MCP endpoint is guarded, and here is
// the sign-in service that guards it". The 401 from /api/mcp points here in its
// WWW-Authenticate header, which is the trail a client follows to find the rest.
//
// Served at /.well-known/oauth-protected-resource via next.config.js rewrites.

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
      resource: `${iss}/api/mcp`,
      authorization_servers: [iss],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
      resource_documentation: `${iss}/dashboard/preview/connectors`,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
