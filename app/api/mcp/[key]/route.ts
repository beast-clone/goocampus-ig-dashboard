import { NextResponse } from "next/server";
import { serve, CORS } from "@/lib/mcp-server";

// Claude connector — key in the URL.
//
//   https://<site>/api/mcp/gck_xxxxxxxx
//
// Claude Desktop and claude.ai add a custom connector by URL and give you nowhere to
// put a header, so the key has to travel in the path. Claude Code keeps using
// /api/mcp with an Authorization header; both call the same serve().
//
// A key in a URL is weaker than a key in a header — it can land in browser history and
// in logs, and anyone holding the URL is holding the credential. Three things bound the
// damage, and they were the condition for doing it this way at all:
//   · one key per person, revocable in a click from My Account → Connect Claude
//   · the tools cannot delete anything
//   · the tools cannot move a task to another brand
// Treat the URL like a password.

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  return serve(req, (params.key || "").trim());
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
