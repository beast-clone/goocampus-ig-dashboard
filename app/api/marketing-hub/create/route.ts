import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// POST /api/marketing-hub/create
// Creates ONE row in mh_posts (Supabase).
//
// Safety: CREATE only. No PATCH/DELETE.

type CreateBody = {
  title: string;
  sbu?: string;
  type?: string;
  owner?: string;             // team member key (praveen, manya, nikhil, nandu, maheen)
  publishingDate?: string;
  dueDate?: string;
  priority?: string;
  platforms?: string[];
  content?: string;
  caption?: string;
  needsReview?: boolean;
};

// Front-end passes owner as an Airtable display-name (e.g. "Manya B M") from
// the old form. Map those to Supabase team_member keys.
const OWNER_ALIASES: Record<string, string> = {
  "manya b m": "manya", "manya": "manya",
  "praveen l": "praveen", "praveen": "praveen",
  "nikhil shyamraj": "nikhil", "nikhi shyamraj": "nikhil", "nikhil": "nikhil",
  "nandu c": "nandu", "nandu": "nandu",
  "maheen ejaz": "maheen", "maheen": "maheen",
};

function normalizeOwner(v: string | undefined): string | null {
  if (!v) return null;
  const key = OWNER_ALIASES[v.toLowerCase().trim()];
  return key || null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody;
    if (!body.title || body.title.trim().length === 0) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const insertRow = {
      particulars: body.title.trim(),
      status: "Content - Pending",
      type: body.type || null,
      sbu: body.sbu || null,
      owner_key: normalizeOwner(body.owner),
      publishing_date: body.publishingDate || null,
      due_date: body.dueDate || null,
      priority: body.priority || null,
      platforms: body.platforms && body.platforms.length > 0 ? body.platforms : null,
      content: body.content || null,
      caption: body.caption || null,
      needs_review: body.needsReview === true,
    };

    const { data, error } = await sb
      .from("mh_posts")
      .insert(insertRow)
      .select("id, particulars, status, owner_key, publishing_date, created_at")
      .single();

    if (error) throw new Error(error.message);

    // Log activity — powers the My Day "Activity" rail once we swap the read
    // path over to activity-based updates.
    await sb.from("mh_activity").insert({
      post_id: data.id,
      actor_key: normalizeOwner(body.owner),
      action: "created",
      to_value: "Content - Pending",
      detail: { source: "dashboard-form" },
    });

    return NextResponse.json({
      id: data.id,
      fields: {
        Particulars: data.particulars,
        Status: data.status,
        Owner: data.owner_key,
        "Publishing Date": data.publishing_date,
      },
      createdAt: data.created_at,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Task creation failed"), { status: 502 });
  }
}
