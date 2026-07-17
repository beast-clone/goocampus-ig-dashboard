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
// Statuses still moving through the pipeline (the working view) + the queued
// Ready-to-Publish. Must match every status the client renders as in-view (the
// HopeMyDay STATUS `inView` set) or a task moved into a missing status would vanish
// from the board after the post-write reconcile. Recently-published rows are fetched
// separately for the Done stat.
const WORKING = [
  "Content - Pending", "Content - In Progress", "Content - Needs Approval",
  "Content - Approved", "Output - In Progress", "Output - Ready",
  "Incorporating Feedback", "Ready to Publish",
];

function ownerName(key: string | null): string {
  if (!key) return "Unclaimed";
  return OWNER_NAME[key.toLowerCase().trim()] || key;
}
function normPriority(p: string | null): "High" | "Medium" | "Low" {
  const s = (p || "").toLowerCase();
  if (s.includes("high") || s.includes("urgent")) return "High";
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
};

function toTask(r: Row) {
  const owner = ownerName(r.owner_key);
  const type = r.type || "Post";
  const media = r.media_urls || [];
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
      creatives: media.map((u) => ({ name: basename(u), type: isVideo(u) ? "video" : "image" })),
      collaborators: [] as unknown[],
      activity: [] as unknown[],
    },
  };
}

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const cols =
      "id, particulars, type, status, sbu, owner_key, priority, content, caption, media_urls, publishing_date, due_date, updated_at";
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [working, doneRecent] = await Promise.all([
      sb.from("mh_posts").select(cols).in("status", WORKING).limit(800),
      sb.from("mh_posts").select(cols).eq("status", "Published/Scheduled").gte("updated_at", since).limit(400),
    ]);
    if (working.error) throw new Error(working.error.message);
    if (doneRecent.error) throw new Error(doneRecent.error.message);

    const rows = [...(working.data || []), ...(doneRecent.data || [])] as Row[];
    const tasks = rows.map(toTask);
    // Claim pool = approved video work still up for grabs. Once an editor (Nikhil /
    // Nandu) owns it, it's been claimed — so it drops out of the pool.
    const EDITORS = new Set(["nikhil", "nandu"]);
    const pool = rows
      .filter(
        (r) =>
          r.status === "Content - Approved" &&
          VIDEO_TYPES.has(r.type || "") &&
          !EDITORS.has((r.owner_key || "").toLowerCase()),
      )
      .map(toTask);

    return NextResponse.json({ tasks, pool, count: tasks.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load My Day"), { status: 502 });
  }
}
