import { NextResponse } from "next/server";
import { registerClient } from "@/lib/oauth";

// Dynamic client registration (RFC 7591). Claude introduces itself here and gets a
// client_id back — this is the call that 404'd and produced "couldn't register with
// Marketing OS's sign-in service".
//
// Open, by design: registration is how the spec works and a client_id is not a
// credential. Registering buys nobody anything on its own — a client still can't act
// until a person with the "Connect Claude" permission approves it on the consent
// screen, which names the app and where it would send them.

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, { status: 400, headers: CORS });
  }

  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u: unknown) => typeof u === "string") : [];
  const name = typeof body.client_name === "string" ? body.client_name : "Claude";

  try {
    const client = await registerClient(name, uris);
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        // Public client: no secret to leak, PKCE does the proving instead.
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(new Date(client.createdAt).getTime() / 1000),
      },
      { status: 201, headers: CORS },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: e instanceof Error ? e.message : "Registration failed." },
      { status: 400, headers: CORS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
