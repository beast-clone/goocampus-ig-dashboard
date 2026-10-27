import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId, getSessionIsAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { fetchRoster } from "@/lib/team-db";
import { TASK_STATUSES } from "@/lib/statuses";

// The Rules page's rule builder (sql/037): each rule is
//   When <a task is created | its status changes to … | it is saved>
//   and <conditions, built like the Master sheet filter>
//   → <hand it to someone / the editors' pool, add a collaborator, keep the previous owner>.
// The database applies them; this route only reads and writes the rows, plus the one
// switch (mh_flags 'rules_engine') that decides whether the engine or the old fixed
// behaviour is in charge. Only an admin may change anything — a rule decides who
// work lands on.

export const dynamic = "force-dynamic";

const FIELDS = new Set(["status", "previous_status", "sbu", "type", "kind", "priority", "owner", "owner_role", "owner_is_creator", "owner_changed"]);
const OPS = new Set(["is", "isNot", "isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty", "contains", "doesNotContain"]);
const ON = new Set(["created", "status", "save", "type"]);
const POOL = "__pool__";
const REMEMBERED = "__remembered__";   // back to the editor it was taken from, else the pool (sql/041)

type Cond = { field: string; op: string; value?: string | string[] };
type Group = { conjunction: "and" | "or"; conditions: (Cond | Group)[] };
type Action = { type: "owner" | "collaborator" | "keep_previous_owner"; to?: string };

const isGroup = (x: unknown): x is Group => !!x && Array.isArray((x as Group).conditions);

// Keep only what the engine understands, so a bad save can't break every task save.
function cleanConditions(g: unknown, depth = 0): Group {
  const src = (g && typeof g === "object" ? g : {}) as Partial<Group>;
  const out: Group = { conjunction: src.conjunction === "or" ? "or" : "and", conditions: [] };
  for (const c of Array.isArray(src.conditions) ? src.conditions : []) {
    if (isGroup(c)) { if (depth === 0) out.conditions.push(cleanConditions(c, 1)); continue; }
    const cc = c as Cond;
    if (!FIELDS.has(cc.field) || !OPS.has(cc.op)) continue;
    const v = Array.isArray(cc.value) ? cc.value.map(String).slice(0, 50) : cc.value === undefined || cc.value === null ? undefined : String(cc.value);
    out.conditions.push({ field: cc.field, op: cc.op, ...(v !== undefined ? { value: v } : {}) });
  }
  return out;
}

async function cleanRule(b: Record<string, unknown>) {
  const people = new Set((await fetchRoster()).filter((u) => u.active).map((u) => u.id));
  const spec = (b.trigger_spec || {}) as { on?: string; statuses?: unknown; types?: unknown };
  const on = ON.has(String(spec.on)) ? String(spec.on) : "save";
  const statuses = Array.isArray(spec.statuses) ? spec.statuses.map(String).filter((s) => (TASK_STATUSES as readonly string[]).includes(s)) : [];
  const actions: Action[] = [];
  for (const a of Array.isArray(b.actions) ? (b.actions as Action[]) : []) {
    if (a?.type === "keep_previous_owner") { actions.push({ type: a.type }); continue; }
    if (a?.type !== "owner" && a?.type !== "collaborator") continue;
    const to = String(a.to || "").toLowerCase();
    if (a.type === "owner" && (to === POOL || to === REMEMBERED)) { actions.push({ type: "owner", to }); continue; }
    if (!people.has(to)) throw new Error(`“${a.to}” is not someone on the team.`);
    actions.push({ type: a.type, to });
  }
  if (actions.filter((a) => a.type === "owner").length > 1) throw new Error("A rule can hand the task to only one person.");
  return {
    name: String(b.name || "").trim().slice(0, 120) || "Untitled rule",
    trigger_spec: on === "status" ? { on, statuses }
      : on === "type" ? { on, ...(Array.isArray(spec.types) && spec.types.length ? { types: spec.types.map(String).slice(0, 50) } : {}) }
      : { on },
    conditions: cleanConditions(b.conditions),
    actions,
    note: typeof b.note === "string" ? b.note.slice(0, 300) || null : undefined,
  };
}

const adminOnly = () => (getSessionIsAdmin() ? null : NextResponse.json({ error: "Only an admin can change the rules." }, { status: 403 }));

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ rules: [], engineOn: false });
    const [rules, flag, roster] = await Promise.all([
      sb.from("mh_rules").select("id, name, active, position, trigger_spec, conditions, actions, note, updated_at, updated_by").eq("engine", true).order("position").order("updated_at"),
      sb.from("mh_flags").select("enabled, updated_at, updated_by").eq("key", "rules_engine").maybeSingle(),
      fetchRoster(),
    ]);
    if (rules.error) throw new Error(rules.error.message);
    return NextResponse.json({
      rules: rules.data || [],
      engineOn: !!(flag.data as { enabled?: boolean } | null)?.enabled,
      engineChangedAt: (flag.data as { updated_at?: string } | null)?.updated_at || null,
      people: roster.map((u) => ({ value: u.id, label: u.first || u.name, active: u.active })),
      canEdit: getSessionIsAdmin(),
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read the rules"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  const no = adminOnly(); if (no) return no;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const rule = await cleanRule(b);
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    // New rules go to the end of the list, so they never jump ahead of existing ones by surprise.
    const { data: last } = await sb.from("mh_rules").select("position").eq("engine", true).order("position", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await sb.from("mh_rules").insert({
      kind: "engine", engine: true, active: true, ...rule,
      position: ((last as { position?: number } | null)?.position ?? 0) + 10,
      updated_by: getSessionUserId() || null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    bustMarketingHubCache();
    return NextResponse.json({ rule: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not add the rule"), { status: 400 });
  }
}

/** Change a rule, switch it on/off, reorder (positions), or flip the engine switch. */
export async function PATCH(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  const no = adminOnly(); if (no) return no;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const by = getSessionUserId() || null;

    if (typeof b.engineOn === "boolean") {
      const { error } = await sb.from("mh_flags").update({ enabled: b.engineOn, updated_at: new Date().toISOString(), updated_by: by }).eq("key", "rules_engine");
      if (error) throw new Error(error.message);
      bustMarketingHubCache();
      return NextResponse.json({ ok: true, engineOn: b.engineOn });
    }
    if (Array.isArray(b.order)) {
      let pos = 10;
      for (const id of b.order.map(String)) {
        await sb.from("mh_rules").update({ position: pos, updated_by: by }).eq("id", id).eq("engine", true);
        pos += 10;
      }
      bustMarketingHubCache();
      return NextResponse.json({ ok: true });
    }
    if (!b.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: by };
    if (typeof b.active === "boolean") patch.active = b.active;
    if ("trigger_spec" in b || "conditions" in b || "actions" in b || "name" in b) {
      const { data: cur } = await sb.from("mh_rules").select("name, trigger_spec, conditions, actions").eq("id", b.id).eq("engine", true).maybeSingle();
      if (!cur) return NextResponse.json({ error: "No such rule." }, { status: 404 });
      Object.assign(patch, await cleanRule({ ...(cur as Record<string, unknown>), ...b }));
    }
    const { data, error } = await sb.from("mh_rules").update(patch).eq("id", String(b.id)).eq("engine", true).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "No such rule." }, { status: 404 });
    bustMarketingHubCache();
    return NextResponse.json({ rule: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save the rule"), { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  const no = adminOnly(); if (no) return no;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const { error } = await sb.from("mh_rules").delete().eq("id", id).eq("engine", true);
    if (error) throw new Error(error.message);
    bustMarketingHubCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not remove the rule"), { status: 502 });
  }
}
