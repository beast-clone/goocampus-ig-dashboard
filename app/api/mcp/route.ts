import { NextResponse } from "next/server";
import { serve, CORS } from "@/lib/mcp-server";

// Claude connector — key in the Authorization header.
//
// The form Claude Code (terminal) uses, because it can set one:
//   claude mcp add --transport http goocampus <site>/api/mcp --header "Authorization: Bearer gck_…"
//
// Claude Desktop and claude.ai cannot set a header, so they use /api/mcp/<key>.
// Both call the same serve() in lib/mcp-server, so the two cannot drift.
//
// Public in middleware.ts (no session cookie); the key is the auth.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return serve(req, key);
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
