import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { VIDEO_TYPES } from "@/lib/mh-content-types";

// GET /api/my-day
// Live per-person task data for the My Day cockpit, straight from mh_posts (Beast
// Clone). Returns every pipeline task the team is actively working — plus this week's
// published rows, for the "Done · 7d" stat — mapped to the My Day card shape, and the
// editors' claim pool (approved video work anyone can grab). The client filters by the
// selected person. Supabase-native, no Airtable.
export const dynamic = "force-dynamic";

const OWNER_NAME: Record<string, string> = {
  manya: "Manya", praveen: "Praveen", nikhil: "Nikhil", nandu: "Nandu", maheen: "Maheen",
};
// Mirror of the client PPL map so a collaborator key resolves to the same avatar/colour.
// `photo` (optional) rides along so the client avatar can show a profile picture
// when one exists; today it's unset and the client falls back to the initial.
const PPL_META: Record<string, { name: string; av: string; color: string; photo?: string }> = {
  manya: { name: "Manya", av: "M", color: "#E0791F" },
  praveen: { name: "Praveen", av: "P", color: "#C2410C" },
  nikhil: { name: "Nikhil", av: "N", color: "#3A57E8" },
  nandu: { name: "Nandu", av: "N", color: "#6E48F8" },
  maheen: { name: "Maheen", av: "M", color: "#2F9E6F" },
};
// Statuses still moving through the pipeline (the working view) + the queued
// Ready-to-Publish. Must match every status the client renders as in-view (the
// HopeMyDay STATUS `inView` set) or a task moved into a missing status would vanish
// from the board after the post-write reconcile. Recently-published rows are fetched
// separately for the Done stat.
// Only real mh_status enum values — "Content - Needs Approval" is NOT in the enum
// and 502s the whole query. "Output - In Progress" (the producer's timer-running
// state) WAS added to the enum on 2026-07-19 and must be included, or a task the
// producer starts working would vanish from the board.
const WORKING = [
  "Content - Pending", "Content - In Progress", "Content - Approved", "Output - In Progress",
  "Incorporating Feedback", "Output - Ready", "Ready to Publish",
];

function ownerName(key: string | null): string {
  if (!key) return "Unclaimed";
  return OWNER_NAME[key.toLowerCase().trim()] || key;
}
function normPriority(p: string | null): "Urgent" | "High" | "Medium" | "Low" {
  const s = (p || "").toLowerCase();
  if (s.includes("urgent")) return "Urgent";
  if (s.includes("high")) return "High";
  if (s.includes("low")) return "Low";
  return "Medium";
}
function basename(url: string): string {
  try { return decodeURIComponent(url.split("?")[0].split("/").pop() || "file"); } catch { return "file"; }
}
function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(url);
}
function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
function ymd(d: string | null): string {
  return d ? String(d).slice(0, 10) : "";
}

type Row = {
  id: string; particulars: string | null; type: string | null; status: string;
  sbu: string | null; owner_key: string | null; priority: string | null;
  content: string | null; caption: string | null; media_urls: string[] | null;
  publishing_date: string | null; due_date: string | null; updated_at: string | null;
  reference_links: string[] | null;
  created_at: string | null; start_at: string | null; end_at: string | null;
  duration_min: number | null;
  custom: Record<string, unknown> | null;
};
type RefItem = { kind: "link" | "image"; label: string; url: string; attId?: string };
type Creative = { name: string; type: "image" | "video" | "doc"; url: string; attId?: string };

function toTask(r: Row, refImages: RefItem[] = [], creativeAtts: Creative[] = [], collabKeys: string[] = []) {
  const owner = ownerName(r.owner_key);
  const type = r.type || "Post";
  const media = r.media_urls || [];
  const references: RefItem[] = [
    ...(r.reference_links || []).map((l) => ({ kind: "link" as const, label: l.replace(/^https?:\/\//i, ""), url: l })),
    ...refImages,
  ];
  // Creatives = the post's own media (media_urls) + any uploaded creative attachments.
  const creatives: Creative[] = [
    ...media.map((u) => ({ name: basename(u), type: (isVideo(u) ? "video" : "image") as "image" | "video", url: u })),
    ...creativeAtts,
  ];
  return {
    id: r.id,
    title: r.particulars || "Untitled",
    meta: owner === "Unclaimed" ? `${type} · unclaimed` : `${type} · owned by ${owner}`,
    status: r.status,
    due: ymd(r.due_date) || ymd(r.publishing_date) || "",
    detail: {
      typeLine: type,
      publishes: fmtDate(r.publishing_date),
      owner,
      priority: normPriority(r.priority),
      brand: r.sbu || "GooCampus",
      content: r.content || r.caption || "",
      creatives,
      // Collaborator (MY_DAY_SPEC §4). Primary source = the mh_post_collaborators
      // junction table (what the approve-handoff writes); custom.collaborator is a
      // harmless fallback for hand-seeded rows.
      collaborators: (() => {
        const keys = new Set<string>(collabKeys.map((k) => k.toLowerCase().trim()));
        const c = typeof r.custom?.collaborator === "string" ? (r.custom.collaborator as string).toLowerCase().trim() : "";
        if (c) keys.add(c);
        return [...keys].filter((k) => PPL_META[k]).map((k) => PPL_META[k]);
      })(),
      // Feedback notes shown highlighted on the producer's Incorporating-Feedback task.
      feedback: typeof r.custom?.incorporating_feedback === "string" ? (r.custom.incorporating_feedback as string) : "",
      activity: [] as unknown[],
      references,
      createdAt: r.created_at || "",
      startAt: r.start_at || "",
      endAt: r.end_at || "",
      duration: r.duration_min ?? undefined,
    },
  };
}

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const cols =
      "id, particulars, type, status, sbu, owner_key, priority, content, caption, media_urls, publishing_date, due_date, updated_at, reference_links, created_at, start_at, end_at, duration_min, custom";
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [working, doneRecent] = await Promise.all([
      sb.from("mh_posts").select(cols).in("status", WORKING).limit(800),
      sb.from("mh_posts").select(cols).eq("status", "Published/Scheduled").gte("updated_at", since).limit(400),
    ]);
    if (working.error) throw new Error(working.error.message);
    if (doneRecent.error) throw new Error(doneRecent.error.message);

    const rows = [...(working.data || []), ...(doneRecent.data || [])] as Row[];

    // Pull reference images (mh_attachments kind='reference') for these tasks so the
    // My Day References section shows/persists the same set as the Marketing Hub modal.
    // Reference images are rare, so fetch them all (avoids a huge .in() URL over
    // ~1200 task ids) and map by post; only the tasks in view read from it.
    const refByPost = new Map<string, RefItem[]>();
    const creativeByPost = new Map<string, Creative[]>();
    // Explicit bound: PostgREST silently caps unlimited selects (~1000 rows), which
    // would drop attachments arbitrarily as the table grows. Newest-first within the
    // cap so recent creatives always win. ponytail: 5000 flat cap — switch to a
    // per-post-id .in() filter if the table ever outgrows it.
    const { data: atts } = await sb
      .from("mh_attachments")
      .select("id, post_id, filename, storage_path, kind")
      .in("kind", ["reference", "creative"])
      .order("uploaded_at", { ascending: false })
      .limit(5000);
    (atts || []).forEach((a: { id: string; post_id: string; filename: string; storage_path: string; kind: string }) => {
      if (a.kind === "creative") {
        const arr = creativeByPost.get(a.post_id) || [];
        arr.push({ name: a.filename, type: isVideo(a.storage_path) ? "video" : "image", url: a.storage_path, attId: a.id });
        creativeByPost.set(a.post_id, arr);
      } else {
        const arr = refByPost.get(a.post_id) || [];
        arr.push({ kind: "image", label: a.filename, url: a.storage_path, attId: a.id });
        refByPost.set(a.post_id, arr);
      }
    });
    // Collaborators from the junction table (the approve-handoff writes here).
    const collabByPost = new Map<string, string[]>();
    if (rows.length) {
      const { data: collabs } = await sb
        .from("mh_post_collaborators")
        .select("post_id, member_key")
        .in("post_id", rows.map((r) => r.id));
      (collabs || []).forEach((c: { post_id: string; member_key: string }) => {
        const arr = collabByPost.get(c.post_id) || [];
        arr.push(c.member_key);
        collabByPost.set(c.post_id, arr);
      });
    }
    // Samvaya / other-platform work (spec §14) is split OUT here so it can never leak
    // into the GooCampus board or Manya's view — it only feeds Nandu's own section.
    const isSamvayaRow = (r: Row) => /samvaya|matrimony/i.test(r.sbu || "");
    const mk = (r: Row) => toTask(r, refByPost.get(r.id) || [], creativeByPost.get(r.id) || [], collabByPost.get(r.id) || []);
    const mainRows = rows.filter((r) => !isSamvayaRow(r));
    const tasks = mainRows.map(mk);
    // Claim pool = approved video work still up for grabs. Once an editor (Nikhil /
    // Nandu) owns it, it's been claimed — so it drops out of the pool.
    const EDITORS = new Set(["nikhil", "nandu"]);
    const pool = mainRows
      .filter(
        (r) =>
          r.status === "Content - Approved" &&
          VIDEO_TYPES.has(r.type || "") &&
          !EDITORS.has((r.owner_key || "").toLowerCase()),
      )
      .map(mk);
    // Nandu's Samvaya / other-platform tasks — separate, Nandu-only.
    const samvaya = rows.filter((r) => isSamvayaRow(r) && (r.owner_key || "").toLowerCase() === "nandu").map(mk);

    return NextResponse.json({ tasks, pool, samvaya, count: tasks.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load My Day"), { status: 502 });
  }
}
