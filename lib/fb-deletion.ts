// Meta "Data Deletion Request" handling.
//
// When someone removes the GooCampus Analytics app from their Facebook/Instagram
// account, Meta POSTs a signed_request to our callback. Platform Terms 3(d)(i)
// requires us to delete that person's data and hand back a URL + code they can
// use to check on it. Without this endpoint Meta emails the admin by hand for
// every request, and unresolved requests can get the app restricted — which
// would cut off the whole dashboard's Instagram + Ads access.
//
// The only personal data this app holds is Instagram DM history, stored in
// `discover_cache` under three key shapes (see lib/dm.ts):
//   dm_thread:{account}:{senderId}
//   dm_msg:{messageId}          → payload.sender_id identifies the person
//   dm_queue:{account}:{senderId}
// Everything else in that table is aggregate analytics with no person attached.

import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabase";

export type DeletionRecord = {
  confirmation_code: string;
  user_id: string;
  requested_at: string;
  completed_at?: string;
  deleted: { threads: number; messages: number; queued: number };
  status: "completed" | "no_data_found";
};

function b64urlToBuffer(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Verify and decode Meta's signed_request.
 * Format is `{base64url signature}.{base64url payload}`; the signature is an
 * HMAC-SHA256 of the *raw* payload segment keyed with the app secret.
 * Returns null on any tampering or malformed input.
 */
export function parseSignedRequest(signed: string, appSecret: string): { user_id: string } | null {
  const parts = signed.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;
  if (!encodedSig || !encodedPayload) return null;

  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  const actual = b64urlToBuffer(encodedSig);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(b64urlToBuffer(encodedPayload).toString("utf8"));
    if (String(payload?.algorithm || "").toUpperCase() !== "HMAC-SHA256") return null;
    const userId = payload?.user_id;
    if (!userId) return null;
    return { user_id: String(userId) };
  } catch {
    return null;
  }
}

/**
 * Delete every stored trace of one Meta user id, then record what happened so
 * the status page can answer for it later. Safe to call twice — a repeat run
 * simply finds nothing and reports no_data_found.
 */
export async function deleteUserData(userId: string): Promise<DeletionRecord> {
  const code = randomUUID().replace(/-/g, "").slice(0, 20);
  const record: DeletionRecord = {
    confirmation_code: code,
    user_id: userId,
    requested_at: new Date().toISOString(),
    deleted: { threads: 0, messages: 0, queued: 0 },
    status: "no_data_found",
  };

  const db = getSupabase();
  if (!db) return record;

  // Threads and queued replies embed the sender id in the key, but the account
  // segment varies, so match on the key suffix rather than guessing accounts.
  for (const [prefix, field] of [
    ["dm_thread:", "threads"],
    ["dm_queue:", "queued"],
  ] as const) {
    const { data } = await db.from("discover_cache").select("cache_key").like("cache_key", `${prefix}%`);
    const keys = (data || [])
      .map((r) => r.cache_key as string)
      .filter((k) => k.endsWith(`:${userId}`));
    if (keys.length) {
      await db.from("discover_cache").delete().in("cache_key", keys);
      record.deleted[field] = keys.length;
    }
  }

  // Messages are keyed by message id, so the sender only appears in the payload.
  const { data: msgs } = await db
    .from("discover_cache")
    .select("cache_key,payload")
    .eq("source", "dm_msg")
    .limit(5000);
  const msgKeys = (msgs || [])
    .filter((r) => (r.payload as { sender_id?: string })?.sender_id === userId)
    .map((r) => r.cache_key as string);
  if (msgKeys.length) {
    await db.from("discover_cache").delete().in("cache_key", msgKeys);
    record.deleted.messages = msgKeys.length;
  }

  const total = record.deleted.threads + record.deleted.messages + record.deleted.queued;
  record.status = total > 0 ? "completed" : "no_data_found";
  record.completed_at = new Date().toISOString();

  // Keep an audit row. This holds only the Meta user id and counts — no message
  // text, no username — so it is not itself personal data worth deleting.
  await db.from("discover_cache").upsert(
    {
      cache_key: `fb_deletion:${code}`,
      source: "fb_deletion",
      last_fetched: record.completed_at,
      payload: record,
    },
    { onConflict: "cache_key" },
  );

  return record;
}

export async function getDeletionRecord(code: string): Promise<DeletionRecord | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .eq("cache_key", `fb_deletion:${code}`)
    .maybeSingle();
  return (data?.payload as DeletionRecord) || null;
}
