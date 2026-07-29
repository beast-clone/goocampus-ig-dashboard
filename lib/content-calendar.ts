// Airtable Content Calendar bridge.
// We don't touch the Meta API directly — we just write a row to the same Airtable
// table that the existing n8n Sync V3 + Native Scheduler pipeline already watches.
//
// Flow: dashboard writes row -> n8n Sync V3 picks up within ~1 min -> Native Scheduler
// publishes within ~1 min -> Telegram notifier marks Published. Worst-case lag ~2 min.

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getSupabase } from "@/lib/supabase";

const BASE_ID = "appLdJFTrothBLDc0";
const CONTENT_CALENDAR_TABLE = "tblRlOFss2lDKE9EG";   // Content Calendar (caption source + legacy create-post)

function token(): string {
  const t = process.env.AIRTABLE_API_KEY;
  if (!t) throw new Error("AIRTABLE_API_KEY not configured");
  return t;
}

type AttachmentInput = { url: string; filename?: string };

export type CreatePostInput = {
  particulars: string;            // short title for the row, e.g. "AMC Aug intake reel"
  publishTo: "Facebook" | "Instagram" | "Instagram/Facebook";
  publishToPage: "GooCampus Main" | "GooCampus World" | "12Plus / GC India";
  caption: string;                // the body the post will use (Sync V3 will split IG vs FB)
  mediaUrls: string[];            // 1+ urls (image/video/reel). For carousels send multiple.
  scheduleTimeISO?: string;       // when to publish; omit to use Sync V3's default (now + 2h)
  sbu?: string;                   // e.g. "GooCampus Edu", optional
  type?: string;                  // e.g. "Reel", "Image", "Carousel"
};

type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

async function airtablePost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetchWithTimeout(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 15_000,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Airtable POST ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

async function airtableGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetchWithTimeout(`https://api.airtable.com/v0/${BASE_ID}/${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
    timeoutMs: 15_000,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Airtable GET ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

export async function createContentCalendarRow(input: CreatePostInput): Promise<{ id: string; createdTime: string }> {
  // Build the field map. Only include fields with values — Airtable rejects unknown nulls.
  const fields: Record<string, unknown> = {
    Particulars: input.particulars,
    "Publish To": input.publishTo,
    "Publish To Page": input.publishToPage,
    Caption: input.caption,
    Content: input.caption,                  // Sync V3 reads either; safe to mirror
    Status: "Ready to Publish",
  };
  if (input.sbu) fields.SBU = input.sbu;
  if (input.type) fields.Type = input.type;

  // Media: prefer Attachments (Airtable will fetch from URL)
  if (input.mediaUrls.length > 0) {
    const attachments: AttachmentInput[] = input.mediaUrls.map((u) => ({ url: u }));
    fields.Attachments = attachments;
  }

  // Schedule: if explicit time given, we set it on the CC row so Sync V3 can pass it through.
  // Sync V3 will copy this into Post Scheduler.Schedule Time.
  if (input.scheduleTimeISO) {
    fields["Schedule Time"] = input.scheduleTimeISO;
  }

  const res = await airtablePost<{ records: AirtableRecord[] }>(CONTENT_CALENDAR_TABLE, {
    records: [{ fields }],
    typecast: true,
  });
  const row = res.records[0];
  return { id: row.id, createdTime: row.createdTime };
}

// Pull the writer's long-form body straight from the Content Calendar row.
// The Supabase mirror (mh_posts) doesn't carry the "Content" rich-text field,
// so the task-detail panel fetches it live by Airtable record id when opened.
export async function fetchContentCalendarBody(
  recordId: string,
): Promise<{ content: string; notes: string }> {
  try {
    const rec = await airtableGet<AirtableRecord>(`${CONTENT_CALENDAR_TABLE}/${recordId}`);
    const f = rec.fields || {};
    const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return { content: asText(f["Content"]), notes: asText(f["Content Notes"]) };
  } catch {
    return { content: "", notes: "" };
  }
}

// The team writes the ready-to-post caption inside the Content rich-text field,
// under a "Caption:" heading (e.g. "### Caption:"), followed by the caption text
// and a trailing bracketed keyword/hashtag block. Pull just that section so the
// scheduler can auto-fill the Caption field. Light markdown strip for cleanliness.
export function extractCaptionFromContent(content: string): string {
  if (!content) return "";
  let body: string;
  // Prefer a line that is only "Caption:" (with optional #/*/> markdown around it).
  const heading = content.match(/^[#>*_\s]*caption\s*:?\s*$/im);
  if (heading && heading.index != null) {
    body = content.slice(heading.index + heading[0].length);
  } else {
    // Fall back to an inline "Caption:" marker anywhere in the content.
    const idx = content.search(/caption\s*:/i);
    if (idx < 0) return "";
    body = content.slice(idx).replace(/^\s*caption\s*:/i, "");
  }
  return body
    .replace(/\*\*/g, "")        // bold markers
    .replace(/^#{1,6}\s*/gm, "") // stray headings
    .trim();
}

export type ScheduledPost = {
  id: string;
  particulars: string;
  publishToPage: string;
  primaryInterest: string;         // e.g. "Study Abroad", "University Programs"
  platform: string;                // "Facebook" | "Instagram/Facebook"
  type: string;                    // "Image" | "Reel" | "Carousel" (freeform)
  caption: string;
  fullCaption: string;             // untrimmed — used by the edit modal
  igCaption: string;               // Instagram-specific override, if any
  fbCaption: string;               // Facebook-specific override, if any
  thumbnailUrl: string | null;     // first attachment thumbnail for the card
  mediaUrls: string[];             // all media (carousel slides / video), in order
  scheduleTime: string | null;
  status: string;                  // raw Airtable status
  effectiveStatus: EffectiveStatus; // what the UI should show
  failureReason: string | null;    // populated when effectiveStatus === "failed"
  instagramUrl: string | null;
  facebookUrl: string | null;
  publishedAt: string | null;
};

export type EffectiveStatus = "scheduled" | "publishing" | "published" | "failed" | "draft" | "unknown";

// A scheduled post is treated as stuck/failed if the worker misses its window:
//   - 'scheduled' past its schedule_time by >5 min = the publish worker never picked it up
//   - 'publishing' with no IG/FB URL for >10 min = stuck mid-publish (likely a Meta error)
const STUCK_SCHEDULED_MS = 5 * 60 * 1000;
const STUCK_PUBLISHING_MS = 10 * 60 * 1000;

// Supabase-native queue. Reads mh_posts rows that have entered the publish pipeline
// (publish_status is set), so the Calendar/Scheduled counters reflect exactly what
// the enqueue action wrote. This is the single source of truth for the scheduler queue.
type MhQueueRow = {
  id: string;
  particulars: string | null;
  sbu: string | null;
  type: string | null;
  caption: string | null;
  media_urls: string[] | null;
  publish_to: string | null;
  publish_to_page: string | null;
  publish_to_pages: string[] | null;
  schedule_time: string | null;
  publish_status: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  published_at: string | null;
};

function deriveSupabaseStatus(
  ps: string | null,
  scheduleTime: string | null,
  hasUrl: boolean,
): { effective: EffectiveStatus; failureReason: string | null } {
  const now = Date.now();
  const schedMs = scheduleTime ? new Date(scheduleTime).getTime() : null;
  switch ((ps || "").toLowerCase()) {
    case "published":
      return { effective: "published", failureReason: null };
    case "failed":
      return { effective: "failed", failureReason: "Publish failed — check the worker log." };
    case "publishing":
      if (hasUrl) return { effective: "published", failureReason: null };
      if (schedMs && now - schedMs > STUCK_PUBLISHING_MS) {
        return { effective: "failed", failureReason: `Stuck in "Publishing" for ${Math.floor((now - schedMs) / 60000)} min — Meta API likely failed. Check the worker log.` };
      }
      return { effective: "publishing", failureReason: null };
    case "scheduled":
      if (schedMs && schedMs <= now && now - schedMs > STUCK_SCHEDULED_MS) {
        return { effective: "failed", failureReason: `Scheduled ${Math.floor((now - schedMs) / 60000)} min ago but never picked up by the publish worker. Check the n8n worker is active.` };
      }
      return { effective: "scheduled", failureReason: null };
    default:
      return { effective: "unknown", failureReason: null };
  }
}

export async function fetchScheduledQueueFromSupabase(limit = 100): Promise<ScheduledPost[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("mh_posts")
    .select("id, particulars, sbu, type, caption, media_urls, publish_to, publish_to_page, publish_to_pages, schedule_time, publish_status, instagram_url, facebook_url, published_at")
    .not("publish_status", "is", null)
    .order("schedule_time", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data as MhQueueRow[] | null) || [];

  // Creatives may live in mh_attachments (uploaded via the detail modal), not only the
  // media_urls column — join them so calendar cards show the REAL creative instead of
  // falling back to a blank/placeholder. kind != 'reference' (those are input briefs).
  const ids = rows.map((r) => r.id);
  const attByPost = new Map<string, string[]>();
  if (ids.length) {
    const { data: atts } = await sb
      .from("mh_attachments")
      .select("post_id, storage_path, kind")
      .in("post_id", ids)
      .neq("kind", "reference");
    for (const a of (atts as { post_id: string; storage_path: string | null }[] | null) || []) {
      if (!a.storage_path) continue;
      const arr = attByPost.get(a.post_id) || [];
      arr.push(a.storage_path);
      attByPost.set(a.post_id, arr);
    }
  }

  return rows.map((r) => {
    const pages = r.publish_to_pages || [];
    const fullCaption = r.caption || "";
    const hasUrl = !!(r.instagram_url || r.facebook_url);
    const { effective, failureReason } = deriveSupabaseStatus(r.publish_status, r.schedule_time, hasUrl);
    // Prefer the real media_urls; fall back to attachment creatives when that's empty.
    const media = (r.media_urls && r.media_urls.length) ? r.media_urls : (attByPost.get(r.id) || []);
    return {
      id: r.id,
      particulars: r.particulars || "",
      publishToPage: r.publish_to_page || pages[0] || "",
      primaryInterest: r.sbu || "",
      platform: r.publish_to || "",
      type: r.type || "",
      caption: fullCaption.slice(0, 220),
      fullCaption,
      igCaption: "",
      fbCaption: "",
      thumbnailUrl: media[0] || null,
      mediaUrls: media,
      scheduleTime: r.schedule_time,
      status: r.publish_status || "",
      effectiveStatus: effective,
      failureReason,
      instagramUrl: r.instagram_url,
      facebookUrl: r.facebook_url,
      publishedAt: r.published_at,
    } as ScheduledPost;
  });
}
