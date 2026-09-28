import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId, getSessionIsAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { CONTENT_TYPES } from "@/lib/mh-content-types";

// Owner and collaborator rules — the ones that name a person.
//
// They used to be typed into a database trigger and two source files, so "Nandu
// has left, it is X now" meant a developer and a deploy. They are rows now, and
// the trigger reads them: see sql/019.
//
// Only an admin may change them. A rule here decides who work lands on, which is
// not something a producer should be able to point at themselves.

export const dynamic = "force-dynamic";

const PEOPLE = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);
const KINDS = new Set(["owner", "collaborator"]);
// design/video, or one exact type of work (sql/026).
const CONTENT_KINDS = new Set<string>(["video", "design", ...CONTENT_TYPES]);

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ rules: [] });
    const { data, error } = await sb.from("mh_rules").select("*").order("kind").order("priority", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ rules: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read the rules"), { status: 502 });
  }
}

/** Change who a rule names, or switch it off. */
export async function PATCH(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can change a rule." }, { status: 403 });
  try {
    const b = (await req.json()) as { id?: string; assign_to?: string | null; active?: boolean; note?: string };
    if (!b.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: getSessionUserId() || null };
    if ("assign_to" in b) {
      // null is meaningful on an owner rule: "leave it where it is", which is how
      // video reaches the claim pool. Anything else has to be somebody real.
      if (b.assign_to !== null && !PEOPLE.has(String(b.assign_to).toLowerCase())) {
        return NextResponse.json({ error: "That is not someone on the team." }, { status: 400 });
      }
      patch.assign_to = b.assign_to === null ? null : String(b.assign_to).toLowerCase();
    }
    if (typeof b.active === "boolean") patch.active = b.active;
    if (typeof b.note === "string") patch.note = b.note.slice(0, 300);

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const { data, error } = await sb.from("mh_rules").update(patch).eq("id", b.id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "No such rule." }, { status: 404 });
    bustMarketingHubCache();
    return NextResponse.json({ rule: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save the rule"), { status: 502 });
  }
}

/** Add a rule — usually "this SBU goes to this person". */
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can add a rule." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      kind?: string; sbu?: string | null; content_kind?: string | null; assign_to?: string | null; note?: string;
    };
    const kind = String(b.kind || "").toLowerCase();
    if (!KINDS.has(kind)) return NextResponse.json({ error: "kind must be owner or collaborator" }, { status: 400 });
    if (b.assign_to !== null && b.assign_to !== undefined && !PEOPLE.has(String(b.assign_to).toLowerCase())) {
      return NextResponse.json({ error: "That is not someone on the team." }, { status: 400 });
    }
    // Exact types keep their spelling ("Reel - Cut"); only design/video are folded.
    const raw = b.content_kind ? String(b.content_kind).trim() : "";
    const contentKind = !raw ? null : ["video", "design"].includes(raw.toLowerCase()) ? raw.toLowerCase() : raw;
    if (contentKind && !CONTENT_KINDS.has(contentKind)) {
      return NextResponse.json({ error: "That is not a type of work the Hub knows." }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const { data, error } = await sb.from("mh_rules").insert({
      kind,
      sbu: b.sbu || null,
      content_kind: contentKind,
      from_status: kind === "owner" ? "Content - Approved" : null,
      assign_to: b.assign_to ? String(b.assign_to).toLowerCase() : null,
      // A rule that names a brand has to beat the catch-all, or it would never win.
      priority: b.sbu ? 20 : 10,
      note: (b.note || "").slice(0, 300) || null,
      updated_by: getSessionUserId() || null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    bustMarketingHubCache();
    return NextResponse.json({ rule: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not add the rule"), { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can remove a rule." }, { status: 403 });
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const { error } = await sb.from("mh_rules").delete().eq("id", id);
    if (error) throw new Error(error.message);
    bustMarketingHubCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not remove the rule"), { status: 502 });
  }
}
