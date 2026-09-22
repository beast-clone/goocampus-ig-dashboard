import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";

// Creates ONE task (mh_posts row) — shared by the New task form
// (app/api/marketing-hub/create) and the Claude connector (app/api/mcp), so both
// follow the same rules, stamp the creator and write the same activity trail.
// CREATE only. Required: title + SBU (a brand-less row can't be routed or reported).

export type TaskInput = {
  title: string; sbu?: string; type?: string; owner?: string;
  publishingDate?: string; dueDate?: string; priority?: string; platforms?: string[];
  content?: string; caption?: string; needsReview?: boolean;
};
export type CreatedTask = { id: string; particulars: string; status: string; owner_key: string | null; publishing_date: string | null; created_at: string };

// The form sends Airtable-style display names; map to team keys.
const OWNER_ALIASES: Record<string, string> = {
  "manya b m": "manya", "manya": "manya",
  "praveen l": "praveen", "praveen": "praveen",
  "nikhil shyamraj": "nikhil", "nikhi shyamraj": "nikhil", "nikhil": "nikhil",
  "nandu c": "nandu", "nandu": "nandu",
  "maheen ejaz": "maheen", "maheen": "maheen",
};
export function normalizeOwner(v: string | undefined): string | null {
  if (!v) return null;
  return OWNER_ALIASES[v.toLowerCase().trim()] || null;
}

export function missingForCreate(t: TaskInput): string[] {
  const missing: string[] = [];
  if (!t.title || !t.title.trim()) missing.push("Title");
  if (!t.sbu || !String(t.sbu).trim()) missing.push("SBU (which brand it's for)");
  return missing;
}

export async function createTask(t: TaskInput, actorId: string | null, source: string): Promise<CreatedTask> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.from("mh_posts").insert({
    particulars: t.title.trim(),
    status: "Content - Pending",
    type: t.type || null,
    sbu: t.sbu || null,
    owner_key: normalizeOwner(t.owner),
    publishing_date: t.publishingDate || null,
    due_date: t.dueDate || null,
    priority: t.priority || null,
    // Default a new task to the three channels the team publishes to.
    platforms: t.platforms && t.platforms.length > 0 ? t.platforms : ["Instagram", "Facebook", "LinkedIn"],
    content: t.content || null,
    caption: t.caption || null,
    needs_review: t.needsReview === true,
    // Who made it — fixed forever, whoever owns it later ("Tasks I created" in My Day).
    created_by: actorId,
    // NOTE: do NOT stamp start_at here — the update route sets it when work starts.
  }).select("id, particulars, status, owner_key, publishing_date, created_at").single();
  if (error) throw new Error(error.message);
  // Best-effort: the task is committed; a logging hiccup must not fail the create
  // (the caller would retry → duplicate task).
  try {
    await sb.from("mh_activity").insert({ post_id: data.id, actor_key: actorId || normalizeOwner(t.owner), action: "created", to_value: "Content - Pending", detail: { source } });
  } catch { /* courtesy trail */ }
  bustMarketingHubCache();
  return data as CreatedTask;
}
