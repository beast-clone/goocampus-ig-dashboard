import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSessionUserId } from "@/lib/auth";
import {
  recordRadarAction, clearRadarAction, actionsByItem, loggedKeys,
  type RadarAction, type RadarItemKind,
} from "@/lib/radar-actions";

// POST /api/radar/action   { itemKey, itemKind, action, taskId? }
//   Records one person's answer about one radar item: written / useful / not_useful.
//   A null action means they un-tapped the thumb — the answer goes away entirely.
//
// GET  /api/radar/action
//   What the radar needs to draw itself correctly on load — the answers already given
//   (so a thumb stays pressed across a reload) and the keys already rolled into a past
//   day's report (so a thing shown yesterday is not shown again today).

export const dynamic = "force-dynamic";

const KINDS = new Set<RadarItemKind>(["news", "mention", "search"]);
const ACTIONS = new Set<RadarAction>(["written", "useful", "not_useful"]);

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const [actions, logged] = await Promise.all([actionsByItem(), loggedKeys()]);
    return NextResponse.json({ actions, logged: Array.from(logged) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load radar actions"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const b = (await req.json()) as { itemKey?: string; itemKind?: string; action?: string | null; taskId?: string };
    if (!b.itemKey) return NextResponse.json({ error: "itemKey is required" }, { status: 400 });
    if (!b.itemKind || !KINDS.has(b.itemKind as RadarItemKind)) {
      return NextResponse.json({ error: "itemKind must be news | mention | search" }, { status: 400 });
    }
    const actor = getSessionUserId() || null;
    if (b.action === null) {
      const cleared = await clearRadarAction(b.itemKey, actor);
      if (!cleared.ok) return NextResponse.json({ error: cleared.error }, { status: 502 });
      return NextResponse.json({ ok: true, cleared: true });
    }
    if (!b.action || !ACTIONS.has(b.action as RadarAction)) {
      return NextResponse.json({ error: "action must be written | useful | not_useful" }, { status: 400 });
    }
    const res = await recordRadarAction({
      itemKey: b.itemKey,
      itemKind: b.itemKind as RadarItemKind,
      action: b.action as RadarAction,
      // Whoever is signed in owns the answer — never a picker, so the report cannot be
      // filled in on someone else's behalf.
      actorKey: actor,
      taskId: b.taskId || null,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't record that"), { status: 502 });
  }
}
