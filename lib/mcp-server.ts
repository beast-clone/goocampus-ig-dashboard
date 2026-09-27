import { NextResponse } from "next/server";
import { userForKey } from "@/lib/claude-connector";
import { rosterById } from "@/lib/team-db";
import { SBU_OPTIONS } from "@/lib/sbus";
import { CONTENT_TYPES } from "@/lib/mh-content-types";
import { createTask } from "@/lib/task-create";
import { listTasks, getTask, searchTasks, updateTask, whatsDue, listRadar } from "@/lib/mcp-tools";

// The Claude connector, protocol and all.
//
// Lives here rather than in the route because it is served from two URLs that must
// behave identically:
//   /api/mcp            — key in the Authorization header. Claude Code (terminal).
//   /api/mcp/<key>      — key in the URL. Claude Desktop and claude.ai, whose
//                         "add a custom connector" box takes a URL and nothing else.
// One implementation, so the two can never drift into different tool sets.

export type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
export const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
export const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

// Every reply Claude gets is a content block. Errors are isError blocks rather than
// protocol errors on purpose: a protocol error makes Claude give up, where an isError
// block is something it can read and act on — usually by asking the user a question.
const say = (id: Rpc["id"], t: string, isError = false) => ok(id, { content: [{ type: "text", text: t }], isError });
const json = (id: Rpc["id"], v: unknown) => say(id, JSON.stringify(v, null, 1));

const TOOLS = [
  {
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
        primary_interest: { type: "string", enum: [...SBU_OPTIONS], description: "Which brand / SBU the task is for. Ask the user if not given." },
        content_type: { type: "string", enum: [...CONTENT_TYPES], description: "Format of the content. Ask the user (carousel, reel, YouTube…) if not given." },
        content: { type: "string", description: "The finalised content: post copy, carousel slide text or video script." },
        caption: { type: "string", description: "The caption to publish with the post (separate from the content)." },
        publishing_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Planned publishing date, YYYY-MM-DD." },
        priority: { type: "string", enum: ["Low", "Medium", "High"], description: "Defaults to Medium." },
        owner: { type: "string", enum: ["manya", "praveen", "nikhil", "nandu", "maheen"], description: "Who works on it next. Defaults to the connected person." },
        platforms: { type: "array", items: { type: "string", enum: ["Instagram", "Facebook", "YouTube", "LinkedIn"] }, description: "Defaults to Instagram, Facebook, LinkedIn." },
      },
      required: ["title", "primary_interest", "content_type"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    title: "List tasks on the board",
    description: "List content tasks, newest publishing date first. Filter by owner, status, brand, type or a publishing-date range. Use this to answer questions like \"what is Manya working on\" before assuming anything.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", enum: ["manya", "praveen", "nikhil", "nandu", "maheen"] },
        status: { type: "string", description: "e.g. \"Content - Pending\", \"Content - Approved\", \"Ready to Publish\"." },
        brand: { type: "string", enum: [...SBU_OPTIONS] },
        type: { type: "string", enum: [...CONTENT_TYPES] },
        from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Publishing date from (inclusive)." },
        to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Publishing date to (inclusive)." },
        limit: { type: "number", description: "1-50, default 20." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_task",
    title: "Read one task in full",
    description: "Read a single task by id, with the full caption and content rather than the trimmed preview list_tasks returns.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "The task id." } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "search_tasks",
    title: "Search tasks by words",
    description: "Find tasks whose title, caption or content contain the given words. Use this when the user refers to a task by what it is about rather than by id.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number", description: "1-50, default 20." } },
      required: ["query"], additionalProperties: false,
    },
  },
  {
    name: "update_task",
    title: "Change a task",
    description:
      "Change an existing task. You may set status, publishing_date, due_date, priority, owner, caption, content or type. " +
      "You may NOT change which brand it belongs to, and there is no way to delete a task — both are deliberate. " +
      "Read the task first if you are not certain which one the user means, and say what you changed afterwards.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" },
        publishing_date: { type: "string", description: "YYYY-MM-DD, or empty string to clear." },
        due_date: { type: "string", description: "YYYY-MM-DD, or empty string to clear." },
        priority: { type: "string", enum: ["Low", "Medium", "High"] },
        owner: { type: "string", enum: ["manya", "praveen", "nikhil", "nandu", "maheen"] },
        caption: { type: "string" },
        content: { type: "string" },
        type: { type: "string", enum: [...CONTENT_TYPES] },
      },
      required: ["id"], additionalProperties: false,
    },
  },
  {
    name: "whats_due",
    title: "What is due, and what is overdue",
    description: "Tasks with a publishing date on or before N days from today (IST), split into overdue and due. Anything already published or ready to publish is left out.",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "0 = today only, 1 = through tomorrow. Default 1, max 30." } }, additionalProperties: false },
  },
  {
    name: "list_radar",
    title: "What Content Radar is showing",
    description: "The news Content Radar has picked up in the last 30 days — headline, source, topic and link. Read-only: to act on one, write the copy and then call create_task, so the dashboard's own rules and activity trail still apply.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "1-50, default 15." } }, additionalProperties: false },
  },
];

async function createOne(id: Rpc["id"], userId: string, args: Record<string, unknown>, origin: string) {
  const me = await rosterById(userId);
  if (!me?.isAdmin && me?.permissions.create_tasks !== true) {
    return say(id, "You don't have permission to create tasks in the dashboard. Ask an admin (Team page → Create tasks).", true);
  }
  const s = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : "");
  const title = s("title"), sbu = s("primary_interest"), type = s("content_type"), date = s("publishing_date");

  // These come back as questions for Claude to put to the user, not as failures —
  // "which brand is this for?" is the single most common thing people forget to say.
  const missing = [!title && "title", !sbu && "primary_interest", !type && "content_type"].filter(Boolean);
  if (missing.length) return say(id, `Missing required field(s): ${missing.join(", ")}. Ask the user for them, then call create_task again.`, true);
  if (!(SBU_OPTIONS as readonly string[]).includes(sbu)) return say(id, `"${sbu}" isn't a primary interest in the dashboard. Valid options: ${SBU_OPTIONS.join(", ")}. Ask the user which one.`, true);
  if (!(CONTENT_TYPES as readonly string[]).includes(type)) return say(id, `"${type}" isn't a content type. Valid: ${CONTENT_TYPES.join(", ")}. Ask the user which one.`, true);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return say(id, "publishing_date must be YYYY-MM-DD.", true);

  const task = await createTask({
    title, sbu, type,
    content: s("content") || undefined, caption: s("caption") || undefined,
    publishingDate: date || undefined, priority: s("priority") || "Medium",
    owner: s("owner") || userId,
    platforms: Array.isArray(args.platforms) ? (args.platforms as unknown[]).filter((p): p is string => typeof p === "string") : undefined,
  }, userId, "claude-connector");

  return say(id,
    `Created “${task.particulars}” (${type} · ${sbu}) — owner ${task.owner_key || "none"}, status ${task.status}${task.publishing_date ? `, publishing ${task.publishing_date}` : ""}.\n` +
    `Open it: ${origin}/dashboard/preview/marketing-hub?tab=master&open=${task.id}`);
}

async function callTool(id: Rpc["id"], userId: string, name: string, args: Record<string, unknown>, origin: string) {
  switch (name) {
    case "create_task":  return createOne(id, userId, args, origin);
    case "list_tasks":   return json(id, await listTasks(args, origin));
    case "get_task":     return json(id, await getTask(args, origin));
    case "search_tasks": return json(id, await searchTasks(args, origin));
    case "whats_due":    return json(id, await whatsDue(args, origin));
    case "list_radar":   return json(id, await listRadar(args));
    case "update_task": {
      const me = await rosterById(userId);
      if (!me?.isAdmin && me?.permissions.create_tasks !== true) {
        return say(id, "You don't have permission to change tasks in the dashboard. Ask an admin (Team page → Create tasks).", true);
      }
      const res = await updateTask(args, userId, origin);
      return say(id, `Changed ${res.updated.join(", ")} on “${res.task.title}”.\n${res.task.link}\n\n${JSON.stringify(res.task, null, 1)}`);
    }
    default: return fail(id, -32602, `Unknown tool: ${name}`);
  }
}

export async function handleRpc(msg: Rpc, userId: string, origin: string) {
  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "goocampus-marketing-os", version: "2.0.0" },
        instructions:
          "Read and write the GooCampus Marketing OS content board. " +
          "Before creating a task you MUST know the primary interest (brand) and the content type — if the user has not said them, ask; never guess. " +
          "Prefer looking before acting: use search_tasks or list_tasks to find the task the user means rather than assuming an id. " +
          "You cannot delete anything, and you cannot move a task to a different brand.",
      });
    case "ping": return ok(msg.id, {});
    case "tools/list": return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      const p = msg.params || {};
      try { return await callTool(msg.id, userId, String(p.name || ""), (p.arguments as Record<string, unknown>) || {}, origin); }
      catch (e) { return say(msg.id, `That didn't work: ${(e as Error).message}`, true); }
    }
    default: return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** Claude Desktop and claude.ai call from a browser context, so the preflight has to
 *  pass or the connector never gets as far as sending a key. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

/**
 * One request, whichever URL it arrived on.
 *
 * Lives here rather than in a route file because a Next route module may only export
 * route handlers — exporting a helper from one breaks the production type check, which
 * is exactly how this got caught.
 */
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
