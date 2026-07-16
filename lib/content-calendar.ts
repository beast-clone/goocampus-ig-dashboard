// Airtable Content Calendar bridge.
// We don't touch the Meta API directly — we just write a row to the same Airtable
// table that the existing n8n Sync V3 + Native Scheduler pipeline already watches.
//
// Flow: dashboard writes row -> n8n Sync V3 picks up within ~1 min -> Native Scheduler
// publishes within ~1 min -> Telegram notifier marks Published. Worst-case lag ~2 min.

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getSupabase } from "@/lib/supabase";

const BASE_ID = "appLdJFTrothBLDc0";
const CONTENT_CALENDAR_TABLE = "tblRlOFss2lDKE9EG";   // Content Calendar (where new posts go)
const POST_SCHEDULER_TABLE = "tblMuZHH5c2lP6oTD";     // Post Scheduler (status queue, read-only from dashboard)

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

// n8n doesn't write a "Failed" status — posts just stay stuck. We derive failure by time.
//   - "To Be Scheduled" past its schedule_time by >5 min = stuck (n8n cron should have caught it)
//   - "Publishing" with no Instagram/Facebook URL for >10 min = stuck mid-publish
const STUCK_SCHEDULED_MS = 5 * 60 * 1000;
const STUCK_PUBLISHING_MS = 10 * 60 * 1000;

function deriveStatus(p: { status: string; scheduleTime: string | null; instagramUrl: string | null; facebookUrl: string | null }): { effective: EffectiveStatus; failureReason: string | null } {
  const raw = (p.status || "").trim();
  const now = Date.now();
  const schedMs = p.scheduleTime ? new Date(p.scheduleTime).getTime() : null;
  const hasUrl = !!(p.instagramUrl || p.facebookUrl);

  if (raw === "Published") return { effective: "published", failureReason: null };
  if (raw === "Draft") return { effective: "draft", failureReason: null };

  if (raw === "Publishing") {
    if (hasUrl) return { effective: "published", failureReason: null }; // Telegram notifier hasn't bumped status yet
    if (schedMs && now - schedMs > STUCK_PUBLISHING_MS) {
      return { effective: "failed", failureReason: `Stuck in "Publishing" for ${Math.floor((now - schedMs) / 60000)} min — Meta API likely failed (reel processing? big video?). Check n8n execution log.` };
    }
    return { effective: "publishing", failureReason: null };
  }

  const rawNorm = raw.trim().toLowerCase();
  if (rawNorm === "to be scheduled" || rawNorm === "ready to schedule" || rawNorm === "scheduled" || rawNorm === "draft") {
    if (!schedMs) return { effective: "scheduled", failureReason: null };
    if (schedMs > now) return { effective: "scheduled", failureReason: null };
    if (now - schedMs > STUCK_SCHEDULED_MS) {
      return { effective: "failed", failureReason: `Scheduled ${Math.floor((now - schedMs) / 60000)} min ago but never picked up by n8n Native Scheduler. Check the workflow is active.` };
    }
    return { effective: "scheduled", failureReason: null }; // within grace window
  }

  return { effective: "unknown", failureReason: null };
}

// Read the queue from Post Scheduler. Sorted newest first (most recent Schedule Time).
// Populates all fields the new Scheduler UI cards need (thumbnail, Primary Interest,
// per-platform captions, etc.).
export async function fetchScheduledPosts(limit = 100): Promise<ScheduledPost[]> {
  const res = await airtableGet<{ records: AirtableRecord[] }>(POST_SCHEDULER_TABLE, {
    pageSize: String(Math.min(limit, 100)),
    "sort[0][field]": "Schedule Time",
    "sort[0][direction]": "desc",
  });
  return (res.records || [])
    // Hide seeded demo rows (titled "[DEMO — delete] …") from the dashboard —
    // they're sample data, not real posts. Delete them in Airtable to remove for good.
    .filter((r) => !/^\s*\[demo/i.test(String((r.fields as Record<string, unknown>).Particulars || "")))
    .map((r) => {
    const f = r.fields as Record<string, unknown>;
    // Media / Post is a multipleAttachments field; grab the first attachment's
    // thumbnail for the card preview.
    const attachments = Array.isArray(f["Media/ Post"]) ? f["Media/ Post"] as Array<{ url?: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } }> : [];
    const firstAttach = attachments[0];
    const thumbnailUrl = firstAttach?.thumbnails?.large?.url
      || firstAttach?.thumbnails?.small?.url
      || firstAttach?.url
      || null;

    const igCaption = String(f["Instagram Caption"] || "");
    const fbCaption = String(f["Facebook Caption"] || "");
    const mainCaption = String(f.Caption || "");
    const fullCaption = mainCaption || igCaption || fbCaption;

    // Primary Interest and Publish To Page are singleSelect fields that come back as
    // { id, name, color } objects, not plain strings.
    function selectName(v: unknown): string {
      if (!v) return "";
      if (typeof v === "string") return v;
      if (typeof v === "object" && v && "name" in v) return String((v as { name?: string }).name || "");
      return "";
    }

    const base = {
      id: r.id,
      particulars: String(f.Particulars || ""),
      publishToPage: selectName(f["Publish To Page"]),
      primaryInterest: selectName(f["Primary Interest"]),
      platform: selectName(f.Platform),
      type: String(f.Type || ""),
      caption: fullCaption.slice(0, 220),
      fullCaption,
      igCaption,
      fbCaption,
      thumbnailUrl,
      mediaUrls: attachments.map((a) => a.thumbnails?.large?.url || a.url || "").filter(Boolean),
      scheduleTime: f["Schedule Time"] ? String(f["Schedule Time"]) : null,
      status: selectName(f.Status) || String(f.Status || "Unknown"),
      instagramUrl: f["Instagram URL"] ? String(f["Instagram URL"]) : null,
      facebookUrl: f["Facebook URL"] ? String(f["Facebook URL"]) : null,
      publishedAt: f["Published At"] ? String(f["Published At"]) : null,
    };
    const { effective, failureReason } = deriveStatus(base);
    return { ...base, effectiveStatus: effective, failureReason };
  });
}

// Supabase-native queue. Reads mh_posts rows that have entered the publish pipeline
// (publish_status is set), so the Calendar/Scheduled counters reflect exactly what
// the enqueue action wrote. The legacy Airtable Post Scheduler queue (fetchScheduledPosts
// above) is kept only for the old V1 page — the V2/Supabase scheduler uses this.
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

  return (data as MhQueueRow[] | null || []).map((r) => {
    const pages = r.publish_to_pages || [];
    const fullCaption = r.caption || "";
    const hasUrl = !!(r.instagram_url || r.facebook_url);
    const { effective, failureReason } = deriveSupabaseStatus(r.publish_status, r.schedule_time, hasUrl);
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
      thumbnailUrl: (r.media_urls && r.media_urls[0]) || null,
      mediaUrls: r.media_urls || [],
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

// PATCH a Post Scheduler row's Schedule Time (used by the inline picker on each card).
export async function updateScheduleTime(recordId: string, newISO: string): Promise<void> {
  await airtablePatch(POST_SCHEDULER_TABLE, recordId, { "Schedule Time": newISO });
}

// "Publish now" — set Schedule Time to right now + a small buffer so n8n picks it up on
// its next cron tick. Also normalizes Status back to "To Be Scheduled" in case it was
// stuck in "Publishing" or "Failed" beforehand.
export async function publishNow(recordId: string): Promise<void> {
  const soon = new Date(Date.now() + 30_000).toISOString();
  await airtablePatch(POST_SCHEDULER_TABLE, recordId, {
    "Schedule Time": soon,
    Status: "To Be Scheduled",
  });
}

// Edit a post's caption in-place. Writes the same value into all three caption fields
// so whichever the n8n workflow reads (Caption / Instagram Caption / Facebook Caption)
// picks up the update. Callers can pass per-platform overrides via the optional fields.
export async function updatePostCaption(
  recordId: string,
  caption: string,
  igCaption?: string,
  fbCaption?: string,
): Promise<void> {
  const fields: Record<string, unknown> = {
    Caption: caption,
    "Instagram Caption": igCaption ?? caption,
    "Facebook Caption": fbCaption ?? caption,
  };
  await airtablePatch(POST_SCHEDULER_TABLE, recordId, fields);
}

async function airtablePatch(table: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
  const r = await fetchWithTimeout(`https://api.airtable.com/v0/${BASE_ID}/${table}/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
    timeoutMs: 15_000,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Airtable PATCH ${r.status}: ${text.slice(0, 200)}`);
  }
}

// Retry a stuck post by bumping its Schedule Time to "now + 1 minute" so the Native
// Scheduler picks it up on its next cron tick. Also sets Status back to "To Be Scheduled"
// in case it was stuck in "Publishing".
export async function retryStuckPost(recordId: string): Promise<void> {
  const newTime = new Date(Date.now() + 60_000).toISOString();
  const r = await fetchWithTimeout(`https://api.airtable.com/v0/${BASE_ID}/${POST_SCHEDULER_TABLE}/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        "Schedule Time": newTime,
        Status: "To Be Scheduled",
      },
      typecast: true,
    }),
    timeoutMs: 15_000,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Airtable PATCH ${r.status}: ${text.slice(0, 200)}`);
  }
}
