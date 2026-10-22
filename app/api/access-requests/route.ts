import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { fetchRoster, rosterById } from "@/lib/team-db";
import { getSupabase } from "@/lib/supabase";
import { canManageAccess } from "@/lib/permissions";

// Access-change requests (Praveen, 22 Oct). Only people with "Can change access"
// may edit Team & access; everyone else asks here. A request is one action-needed
// notification per access manager, all sharing source_id `accessreq:<id>` — so the
// notifications ARE the store, and marking one done closes it for every manager.
//
// GET   → managers: the open requests · everyone else: their own open requests
// POST  → { text } send a request
// PATCH → { id } mark a request handled (managers only)

const KIND = "access_request";

async function managers() {
  const roster = await fetchRoster(true);
  const m = roster.filter((u) => u.active && canManageAccess(u));
  // Same safety net as the Team API: nobody has the switch → the admins.
  return m.length ? m : roster.filter((u) => u.active && u.isAdmin);
}

export async function GET() {
  const sb = getSupabase();
  const me = await rosterById(getSessionUserId());
  if (!sb || !me) return NextResponse.json({ requests: [] });
  const isManager = (await managers()).some((u) => u.id === me.id);
  let q = sb.from("mh_notifications").select("source_id, sub, payload, created_at")
    .eq("kind", KIND).is("done_at", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  q = isManager ? q.eq("recipient_key", me.id) : q.eq("payload->>from", me.id);
  const { data } = await q;
  const seen = new Set<string>();
  const requests = (data || []).filter((r) => !seen.has(r.source_id) && seen.add(r.source_id)).map((r) => {
    const p = (r.payload || {}) as { from?: string; fromName?: string; text?: string };
    return { id: String(r.source_id).replace(/^accessreq:/, ""), from: p.from || "", fromName: p.fromName || p.from || "", text: p.text || r.sub || "", at: r.created_at };
  });
  return NextResponse.json({ isManager, requests });
}

export async function POST(req: Request) {
  const sb = getSupabase();
  const me = await rosterById(getSessionUserId());
  if (!sb || !me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let body: { text?: string } = {};
  try { body = await req.json(); } catch {}
  const text = String(body.text || "").trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "Write what you need" }, { status: 400 });
  const to = await managers();
  if (!to.length) return NextResponse.json({ error: "Nobody manages access yet" }, { status: 409 });
  const id = randomUUID();
  const rows = to.map((u) => ({
    recipient_key: u.id,
    source_id: `accessreq:${id}`,
    kind: KIND,
    category: "action",
    action_needed: true,
    title: "Access change requested",
    sub: `${me.name}: ${text}`,
    payload: { href: `/dashboard/preview/team?person=${encodeURIComponent(me.id)}`, from: me.id, fromName: me.name, text },
  }));
  const { error } = await sb.from("mh_notifications").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, sentTo: to.map((u) => u.first || u.name) });
}

export async function PATCH(req: Request) {
  const sb = getSupabase();
  const me = await rosterById(getSessionUserId());
  if (!sb || !me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await managers()).some((u) => u.id === me.id)) return NextResponse.json({ error: "Only the people who manage access can do that" }, { status: 403 });
  let body: { id?: string } = {};
  try { body = await req.json(); } catch {}
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await sb.from("mh_notifications").update({ done_at: new Date().toISOString() })
    .eq("kind", KIND).eq("source_id", `accessreq:${body.id}`).is("done_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
