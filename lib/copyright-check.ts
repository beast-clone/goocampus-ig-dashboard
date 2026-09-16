// Meta's pre-publish copyright check, run before anything is scheduled.
//
// Instagram runs a rights match over every video it processes. Meta's own composer
// shows the result as a banner — "checking…", then either a green tick or an amber
// warning. Until now we published blind and only found out afterwards, when a reel
// came back muted or region-limited.
//
// The signal comes from an unpublished media container. Creating one costs nothing:
// `content_publishing_limit` counts published posts, not containers (verified — four
// probe containers left quota_usage at 0), and an unpublished container disappears on
// its own after 24 hours. So this is a throwaway container made purely to ask the
// question; the real one is created later, by the n8n worker, at publish time.
//
// Instagram-only. The equivalent Facebook fields exist on the video node but stay
// empty unless you are inside a reel upload session, which needs a token this app
// does not hold.

import type { IGAccountConfig } from "@/lib/instagram";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { recordApiCall } from "@/lib/api-usage";

const GRAPH = "https://graph.facebook.com/v25.0";

export type CopyrightState =
  | "processing"   // Instagram is still ingesting the video
  | "checking"     // ingested; the rights match is running
  | "clear"        // matched nothing
  | "flagged"      // matched something
  | "rejected"     // Instagram could not process the video at all
  | "unavailable"; // no answer — never blocks anything

export type CopyrightResult = {
  state: CopyrightState;
  /** Only ever set for "rejected" — Instagram's own wording. */
  message?: string;
};

type ContainerStatus = { status_code?: string; status?: string };
type CheckStatus = { copyright_check_status?: { status?: string; matches_found?: boolean } };

async function graph<T>(path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${GRAPH}/${path}?${qs}`, { cache: "no-store", ...init });
  recordApiCall("Instagram Graph", res.ok, res.status);
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Hand a video to Instagram and get back the container to ask about. */
export async function startCopyrightCheck(acc: IGAccountConfig, videoUrl: string): Promise<string> {
  const r = await graph<{ id?: string }>(
    `${acc.igUserId}/media`,
    { media_type: "REELS", video_url: videoUrl, access_token: acc.pageAccessToken },
    { method: "POST" },
  );
  if (!r.id) throw new Error("Instagram did not return a container");
  return r.id;
}

export async function readCopyrightCheck(acc: IGAccountConfig, containerId: string): Promise<CopyrightResult> {
  // Two reads, in this order on purpose. Asking for copyright_check_status while the
  // video is still uploading fails the whole request with a bare "An unknown error has
  // occurred", which would read as a broken check rather than an unfinished one.
  const c = await graph<ContainerStatus>(containerId, {
    fields: "status_code,status",
    access_token: acc.pageAccessToken,
  });

  if (c.status_code === "ERROR") {
    return { state: "rejected", message: c.status || "Instagram could not process this video." };
  }
  if (c.status_code !== "FINISHED") return { state: "processing" };

  let check: CheckStatus;
  try {
    check = await graph<CheckStatus>(containerId, {
      fields: "copyright_check_status",
      access_token: acc.pageAccessToken,
    });
  } catch {
    // The field is there but Meta does not always answer for it. A check we cannot
    // read is not a reason to stop anyone posting.
    return { state: "unavailable" };
  }

  const s = check.copyright_check_status;
  if (!s?.status) return { state: "unavailable" };
  if (s.status === "not_started" || s.status === "in_progress") return { state: "checking" };
  if (s.status === "complete") return { state: s.matches_found ? "flagged" : "clear" };
  return { state: "unavailable" };
}
