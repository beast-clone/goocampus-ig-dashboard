import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { getSessionUserId, getSessionIsAdmin } from "@/lib/auth";

// GET  /api/my-day/chat?person=nandu  → the person's conversations (team + DMs)
// POST /api/my-day/chat {convo, sender, body} → send a message
//
// Backs the My Day team chat with mh_messages. convo = 'team' or a sorted DM
// pair 'a~b' (dmConvo). kind 'system' rows are auto-events (handoff/claim) the
// server posts into the team convo — the client renders them as notices.
export const dynamic = "force-dynamic";

const TEAM_KEYS = ["manya", "praveen", "nikhil", "nandu", "maheen"] as const;
const isTeamKey = (k: string): boolean => (TEAM_KEYS as readonly string[]).includes(k);
export type ChatMessage = { id: string; convo: string; sender: string; body: string; kind: "chat" | "system"; at: string };

// (not exported — route.ts may only export handlers)
function dmConvo(a: string, b: string): string {
  return [a, b].sort().join("~");
}

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    // Identity comes from the SESSION, not the client. Non-admins can only read
    // their own inbox; admins (the My Day switcher) may view any teammate's.
    const me = (getSessionUserId() || "").toLowerCase();
    const requested = (new URL(req.url).searchParams.get("person") || "").toLowerCase().trim();
    const person = getSessionIsAdmin() ? (requested || me) : me;
    if (!isTeamKey(person)) return NextResponse.json({ error: "unknown person" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const convos = ["team", ...TEAM_KEYS.filter((k) => k !== person).map((k) => dmConvo(person, k))];
    const { data, error } = await sb
      .from("mh_messages")
      .select("id, convo, sender_key, body, kind, created_at")
      .in("convo", convos)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const messages: ChatMessage[] = (data || [])
      .reverse() // oldest → newest for the thread view
      .map((m) => ({ id: m.id, convo: m.convo, sender: m.sender_key, body: m.body, kind: m.kind as "chat" | "system", at: m.created_at }));
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load chat"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as { convo?: string; sender?: string; body?: string };
    // Sender is the SESSION user — a non-admin can never send as someone else.
    // Admins (viewing another day via the switcher) may post as that teammate.
    const me = (getSessionUserId() || "").toLowerCase();
    const sender = getSessionIsAdmin() ? ((b.sender || "").toLowerCase().trim() || me) : me;
    const convo = (b.convo || "").trim();
    const body = (b.body || "").trim();
    if (!isTeamKey(sender)) return NextResponse.json({ error: "unknown sender" }, { status: 400 });
    if (!body || body.length > 2000) return NextResponse.json({ error: "body required (max 2000 chars)" }, { status: 400 });
    // convo must be 'team' or a DM pair that includes the sender
    const validDm = convo.includes("~") && convo.split("~").every(isTeamKey) && convo.split("~").includes(sender) && convo === dmConvo(convo.split("~")[0], convo.split("~")[1]);
    if (convo !== "team" && !validDm) return NextResponse.json({ error: "invalid convo" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb
      .from("mh_messages")
      .insert({ convo, sender_key: sender, body, kind: "chat" })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, at: data.created_at });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to send message"), { status: 502 });
  }
}
