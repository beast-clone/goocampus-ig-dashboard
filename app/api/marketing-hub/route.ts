import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// GET /api/marketing-hub?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Reads Content Calendar rows from Supabase (mh_posts + mh_team_members).
// Response shape is identical to the previous Airtable-backed version so the
// Marketing Hub + My Day tabs render unchanged.
//
// Cached 12h per {from|to} — mirrors the previous behavior.

type Row = {
  id: string;
  particulars: string;
  type: string;
  status: string;
  sbu: string;
  owner: string;
  collaborators: string[];
  platforms: string[];
  publishTo: string;
  publishToPage: string;
  priority: string;
  publishingDate: string;
  dueDate: string;
  completionTime: string;
  createdDate: string;
  lastModified: string;
  needsReview: boolean;
  syncedToScheduler: boolean;
  caption: string;
  content: string;
  additionalInfo: string;
  outputLink: string;
  instagramUrl: string;
  facebookUrl: string;
  link: string;
  slackLink: string;
  attachments: { url: string; filename: string; type?: string }[];
};

type Facets = {
  sbu: string[]; type: string[]; status: string[]; owner: string[];
  priority: string[]; platforms: string[]; publishTo: string[];
};

type Payload = {
  range: { from: string; to: string; days: number };
  totalInRange: number;
  rows: Row[];
  facets: Facets;
  generatedAt: string;
  latencyMs: number;
  cached?: boolean;
  cachedAt?: string;
};

const CACHE = new Map<string, { at: number; payload: Payload }>();
const TTL_MS = 12 * 60 * 60 * 1000;

function uniqSorted(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

type PostRow = {
  id: string;
  airtable_record_id: string | null;
  particulars: string;
  type: string | null;
  status: string;
  sbu: string | null;
  owner_key: string | null;
  collaborators?: { member_key: string }[]; // populated via join if we add it later
  platforms: string[] | null;
  publish_to: string | null;
  publish_to_page: string | null;
  priority: string | null;
  publishing_date: string | null;
  due_date: string | null;
  completion_time: string | null;
  created_at: string;
  updated_at: string;
  needs_review: boolean;
  synced_to_scheduler: boolean;
  caption: string | null;
  content: string | null;
  additional_info: string | null;
  output_link: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  external_link: string | null;
  slack_link: string | null;
};

type TeamRow = { key: string; full_name: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const force = url.searchParams.get("force") === "1";
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const cacheKey = `${from}|${to}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (!force && cached && now - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.payload, cached: true, cachedAt: new Date(cached.at).toISOString() });
  }

  const t0 = Date.now();
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    // Fetch posts in date range + full team roster in parallel.
    // Filter: publishing_date within range OR publishing_date is null (draft items with no date yet).
    const [postsRes, teamRes] = await Promise.all([
      sb
        .from("mh_posts")
        .select("*")
        .or(`and(publishing_date.gte.${from},publishing_date.lte.${to}),publishing_date.is.null`)
        .order("publishing_date", { ascending: false, nullsFirst: false }),
      sb.from("mh_team_members").select("key, full_name"),
    ]);

    if (postsRes.error) throw new Error(`posts: ${postsRes.error.message}`);
    if (teamRes.error) throw new Error(`team: ${teamRes.error.message}`);

    const teamByKey = new Map((teamRes.data || []).map((t: TeamRow) => [t.key, t.full_name]));
    const posts = (postsRes.data || []) as PostRow[];

    const rows: Row[] = posts.map((p) => ({
      id: p.id,
      particulars: p.particulars || "",
      type: p.type || "",
      status: p.status || "",
      sbu: p.sbu || "",
      owner: p.owner_key ? teamByKey.get(p.owner_key) || p.owner_key : "",
      collaborators: [], // filled in Phase B.2 when we join mh_post_collaborators
      platforms: p.platforms || [],
      publishTo: p.publish_to || "",
      publishToPage: p.publish_to_page || "",
      priority: p.priority || "",
      publishingDate: p.publishing_date || "",
      dueDate: p.due_date || "",
      completionTime: p.completion_time || "",
      createdDate: p.created_at,
      lastModified: p.updated_at,
      needsReview: p.needs_review,
      syncedToScheduler: p.synced_to_scheduler,
      caption: p.caption || "",
      content: p.content || "",
      additionalInfo: p.additional_info || "",
      outputLink: p.output_link || "",
      instagramUrl: p.instagram_url || "",
      facebookUrl: p.facebook_url || "",
      link: p.external_link || "",
      slackLink: p.slack_link || "",
      attachments: [], // filled in Phase B.2 when we join mh_attachments
    }));

    const facets: Facets = {
      sbu: uniqSorted(rows.map((r) => r.sbu)),
      type: uniqSorted(rows.map((r) => r.type)),
      status: uniqSorted(rows.map((r) => r.status)),
      owner: uniqSorted(rows.map((r) => r.owner)),
      priority: uniqSorted(rows.map((r) => r.priority)),
      platforms: uniqSorted(rows.flatMap((r) => r.platforms)),
      publishTo: uniqSorted(rows.map((r) => r.publishTo)),
    };

    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);

    const payload: Payload = {
      range: { from, to, days },
      totalInRange: rows.length,
      rows,
      facets,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
    };

    CACHE.set(cacheKey, { at: now, payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Marketing Hub fetch failed"), { status: 502 });
  }
}
