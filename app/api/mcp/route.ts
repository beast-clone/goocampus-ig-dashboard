import { NextResponse } from "next/server";
import { userForKey } from "@/lib/claude-connector";
import { rosterById } from "@/lib/team-db";
import { SBU_OPTIONS } from "@/lib/sbus";
import { CONTENT_TYPES } from "@/lib/mh-content-types";
import { createTask } from "@/lib/task-create";

// Claude connector — a tiny MCP server (Streamable HTTP, JSON responses) so Claude Code
// can create tasks in the dashboard. Nandu researches and finalises content in Claude,
// then says "create a task…"; Claude calls create_task with his personal key.
//
// Connect (My Account → Connect Claude shows the exact command):
//   claude mcp add --transport http goocampus <site>/api/mcp --header "Authorization: Bearer gck_…"
//
// Auth: the personal key (lib/claude-connector) → that person, who must have the
// "Connect Claude" permission and "Create tasks" (or be admin). CREATE only — no
// edits or deletes. Public in middleware.ts (no session cookie); the key is the auth.
export const dynamic = "force-dynamic";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

const TOOLS = [{
  name: "create_task",
  title: "Create a task in GooCampus Marketing OS",
  description:
    "Create ONE content task in the GooCampus Marketing OS dashboard (lands in the Master sheet as \"Content - Pending\", created by the connected person). " +
    "primary_interest and content_type are REQUIRED: if the user hasn't clearly said them, ASK the user — never guess or pick a default. " +
    "Put the post body / script / slide text in `content` and the social caption in `caption` — they are different fields; don't merge them. " +
    "Confirm the title, primary interest, content type and publishing date with the user before calling if anything is ambiguous.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short task name, e.g. \"AMC batch - carousel\"." },
      primary_interest: { type: "string", enum: [...SBU_OPTIONS], description: "Which brand / SBU the task is for (the dashboard's Primary Interest). Ask the user if not given." },
      content_type: { type: "string", enum: [...CONTENT_TYPES], description: "Format of the content. Ask the user (carousel, reel, YouTube…) if not given." },
      content: { type: "string", description: "The finalised content: post copy, carousel slide text or video script." },
      caption: { type: "string", description: "The caption to publish with the post (separate from the content)." },
      publishing_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Planned publishing date, YYYY-MM-DD." },
      priority: { type: "string", enum: ["Low", "Medium", "High"], description: "Defaults to Medium." },
      owner: { type: "string", enum: ["manya", "praveen", "nikhil", "nandu", "maheen"], description: "Who works on it next. Defaults to the connected person (whose Claude this is)." },
      platforms: { type: "array", items: { type: "string", enum: ["Instagram", "Facebook", "YouTube", "LinkedIn"] }, description: "Where it will be published. Defaults to Instagram, Facebook, LinkedIn." },
    },
    required: ["title", "primary_interest", "content_type"],
    additionalProperties: false,
  },
}];

async function callTool(id: Rpc["id"], userId: string, name: string, args: Record<string, unknown>, origin: string) {
  const text = (t: string, isError = false) => ok(id, { content: [{ type: "text", text: t }], isError });
  if (name !== "create_task") return fail(id, -32602, `Unknown tool: ${name}`);
  const me = await rosterById(userId);
  if (!me?.isAdmin && me?.permissions.create_tasks !== true) return text("You don't have permission to create tasks in the dashboard. Ask an admin (Team page → Create tasks).", true);

  const s = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : "");
  const title = s("title"), sbu = s("primary_interest"), type = s("content_type"), date = s("publishing_date");
  const missing = [!title && "title", !sbu && "primary_interest", !type && "content_type"].filter(Boolean);
  if (missing.length) return text(`Missing required field(s): ${missing.join(", ")}. Ask the user for them, then call create_task again.`, true);
  if (!(SBU_OPTIONS as readonly string[]).includes(sbu)) return text(`"${sbu}" isn't a primary interest in the dashboard. Valid options: ${SBU_OPTIONS.join(", ")}. Ask the user which one.`, true);
  if (!(CONTENT_TYPES as readonly string[]).includes(type)) return text(`"${type}" isn't a content type. Valid: ${CONTENT_TYPES.join(", ")}. Ask the user which one.`, true);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return text("publishing_date must be YYYY-MM-DD.", true);

  const task = await createTask({
    title, sbu, type,
    content: s("content") || undefined, caption: s("caption") || undefined,
    publishingDate: date || undefined, priority: s("priority") || "Medium",
    // No owner → it'd sit in nobody's My Day; default to whoever's Claude created it.
    owner: s("owner") || userId,
    platforms: Array.isArray(args.platforms) ? (args.platforms as unknown[]).filter((p): p is string => typeof p === "string") : undefined,
  }, userId, "claude-connector");
  return text(
    `Created “${task.particulars}” (${type} · ${sbu}) — owner ${task.owner_key || "none"}, status ${task.status}${task.publishing_date ? `, publishing ${task.publishing_date}` : ""}.\n` +
    `Open it: ${origin}/dashboard/preview/marketing-hub?tab=master&open=${task.id}`,
  );
}

async function handle(msg: Rpc, userId: string, origin: string) {
  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "goocampus-marketing-os", version: "1.0.0" },
        instructions: "Create content tasks in GooCampus Marketing OS. Always ask the user for the primary interest (SBU) and content type if they haven't said them.",
      });
    case "ping": return ok(msg.id, {});
    case "tools/list": return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      const p = msg.params || {};
      try { return await callTool(msg.id, userId, String(p.name || ""), (p.arguments as Record<string, unknown>) || {}, origin); }
      catch (e) { return ok(msg.id, { content: [{ type: "text", text: `Couldn't create the task: ${(e as Error).message}` }], isError: true }); }
    }
    default: return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request) {
  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const userId = await userForKey(key);
  if (!userId) {
    return NextResponse.json(fail(null, -32001, "Invalid or revoked key — create a new one on My Account → Connect Claude (needs the “Connect Claude” permission)."), { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 });
  const origin = new URL(req.url).origin;
  const msgs: Rpc[] = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const m of msgs) if (m && m.id !== undefined && m.id !== null) replies.push(await handle(m, userId, origin)); // notifications get no reply
  if (!replies.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0]);
}

export async function GET() {
  return NextResponse.json({ error: "This MCP endpoint only accepts POST (no server-sent events)." }, { status: 405, headers: { Allow: "POST" } });
}
