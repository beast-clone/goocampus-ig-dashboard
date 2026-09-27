import { NextResponse } from "next/server";
import { serve, CORS } from "@/lib/mcp-server";

// Claude connector — key in a request header.
//
// Claude Code (terminal) sends it as Authorization:
//   claude mcp add --transport http goocampus <site>/api/mcp --header "Authorization: Bearer gck_…"
//
// Claude Desktop sends it as one of the api-key headers. Its "Add custom connector"
// dialog does let you attach headers, but it will NOT let you pick Authorization —
// that name is reserved for its own OAuth flow and is greyed out in the picker. It
// offers x-api-key, api-key, x-auth-token and friends instead. Found this with
// Praveen on 27 Sep 2026, setting it up on his machine; the connector originally
// assumed the desktop app could not send headers at all.
//
// So: accept any of the names that dialog offers, with or without a "Bearer " prefix,
// and keep /api/mcp/<key> for clients that really can only give a URL.
// All paths land in the same serve() in lib/mcp-server, so they cannot drift.
//
// Public in middleware.ts (no session cookie); the key is the auth.

export const dynamic = "force-dynamic";

// Exactly the names Claude Desktop's header picker offers, plus Authorization for
// Claude Code. Ordered so Authorization wins if somehow both are present.
const KEY_HEADERS = [
  "authorization",
  "x-api-key", "api-key", "apikey", "x-apikey",
  "x-api-token", "api-token", "x-auth-token",
];

function keyFrom(req: Request): string {
  for (const h of KEY_HEADERS) {
    const raw = req.headers.get(h);
    if (raw) {
      const v = raw.replace(/^Bearer\s+/i, "").trim();
      if (v) return v;
    }
  }
  return "";
}

export async function POST(req: Request) {
  return serve(req, keyFrom(req));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  return NextResponse.json(
    { error: "This MCP endpoint only accepts POST (no server-sent events)." },
    { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } },
  );
}
