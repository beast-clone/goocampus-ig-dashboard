// Airtable Content Calendar bridge.
// We don't touch the Meta API directly — we just write a row to the same Airtable
// table that the existing n8n Sync V3 + Native Scheduler pipeline already watches.
//
// Flow: dashboard writes row -> n8n Sync V3 picks up within ~1 min -> Native Scheduler
// publishes within ~1 min -> Telegram notifier marks Published. Worst-case lag ~2 min.

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

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

export type ScheduledPost = {
  id: string;
  particulars: string;
  publishToPage: string;
  caption: string;
  scheduleTime: string | null;
  status: string;                 // raw Airtable status
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

  if (raw === "To Be Scheduled") {
    if (!schedMs) return { effective: "scheduled", failureReason: null };
    if (schedMs > now) return { effective: "scheduled", failureReason: null };
    if (now - schedMs > STUCK_SCHEDULED_MS) {
      return { effective: "failed", failureReason: `Scheduled ${Math.floor((now - schedMs) / 60000)} min ago but never picked up by n8n Native Scheduler. Check the workflow is active.` };
    }
    return { effective: "scheduled", failureReason: null }; // within grace window
  }

  return { effective: "unknown", failureReason: null };
}

// Read the queue from Post Scheduler. We pull recent + scheduled rows so the UI can show:
//   - upcoming (Status = "To Be Scheduled" with scheduleTime in future)
//   - in flight (Status = "Publishing")
//   - recently published (Status = "Published")
export async function fetchScheduledPosts(limit = 100): Promise<ScheduledPost[]> {
  const res = await airtableGet<{ records: AirtableRecord[] }>(POST_SCHEDULER_TABLE, {
    pageSize: String(Math.min(limit, 100)),
    "sort[0][field]": "Schedule Time",
    "sort[0][direction]": "desc",
  });
  return (res.records || []).map((r) => {
    const f = r.fields as Record<string, unknown>;
    const base = {
      id: r.id,
      particulars: String(f.Particulars || ""),
      publishToPage: String(f["Publish To Page"] || ""),
      caption: String(f.Caption || f["Instagram Caption"] || f["Facebook Caption"] || "").slice(0, 220),
      scheduleTime: f["Schedule Time"] ? String(f["Schedule Time"]) : null,
      status: String(f.Status || "Unknown"),
      instagramUrl: f["Instagram URL"] ? String(f["Instagram URL"]) : null,
      facebookUrl: f["Facebook URL"] ? String(f["Facebook URL"]) : null,
      publishedAt: f["Published At"] ? String(f["Published At"]) : null,
    };
    const { effective, failureReason } = deriveStatus(base);
    return { ...base, effectiveStatus: effective, failureReason };
  });
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
