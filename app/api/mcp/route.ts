import { NextResponse } from "next/server";
import { userForKey } from "@/lib/claude-connector";
import { handleRpc, fail, CORS, type Rpc } from "@/lib/mcp-server";

// Claude connector — key in the Authorization header.
//
// This is the form Claude Code (terminal) uses, because it lets you set a header:
//   claude mcp add --transport http goocampus <site>/api/mcp --header "Authorization: Bearer gck_…"
//
// Claude Desktop and claude.ai cannot set a header, so they use /api/mcp/<key> instead.
// Both run the identical server from lib/mcp-server.
//
// Public in middleware.ts (no session cookie); the key is the auth.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return serve(req, key);
}

/** Shared by both routes so the header and URL forms can never behave differently. */
export async function serve(req: Request, key: string) {
  const userId = await userForKey(key);
  if (!userId) {
    return NextResponse.json(
      fail(null, -32001, "Invalid or revoked key — create a new one on My Account → Connect Claude (needs the “Connect Claude” permission)."),
      { status: 401, headers: CORS },
    );
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400, headers: CORS });

  const origin = new URL(req.url).origin;
  const msgs: Rpc[] = Array.isArray(body) ? body : [body];
  const replies = [];
  // Notifications carry no id and expect no reply.
  for (const m of msgs) if (m && m.id !== undefined && m.id !== null) replies.push(await handleRpc(m, userId, origin));
  if (!replies.length) return new NextResponse(null, { status: 202, headers: CORS });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: CORS });
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
