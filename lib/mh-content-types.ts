// The Content Calendar "Type" values that count as VIDEO work. Video is never
// auto-assigned to the designer — it goes into the editors' claim pool. This set is
// the single source of truth shared by:
//   • app/api/marketing-hub/update/route.ts  (decides the approval handoff)
//   • app/api/my-day/route.ts                (builds the editors' claim pool)
//   • app/api/my-day/notifications/route.ts  (routes handoff notifications)
// ALSO mirrored in the database trigger sql/013_design_work_owner.sql (non-video work at
// Content Approved+ is forced to Praveen) — change both together.
// Keeping it in one place prevents the three from drifting out of sync (which would
// mis-route a task/notification, e.g. "Meta Ads - Video").
export const VIDEO_TYPES = new Set<string>([
  "Reel - Original",
  "Reel - Cut",
  "YouTube Long-Form",
  "YouTube Shorts",
  "Story (Video)",
  "Meta Ads - Video",
]);

// Every Content Calendar "Type" a task can have — the New task form and the Claude
// connector (/api/mcp) both offer exactly this list.
export const CONTENT_TYPES = [
  "Post", "Carousel", "Reel - Original", "Reel - Cut", "Reel Thumbnail",
  "YouTube Long-Form", "YouTube Shorts", "YouTube Thumbnail",
  "Meta Ads", "Meta Ads - Video", "Story (Image)", "Story (Video)", "Atomic Essay",
] as const;

// ── Live list (sql/028) ──────────────────────────────────────────────────────────
// Types added in the dashboard live in mh_content_types. The two lists above are
// today's built-ins and the fallback; registerTypes() adds the live ones to BOTH
// ALL_TYPES and VIDEO_TYPES, in place, so every existing VIDEO_TYPES.has(...)
// check — server routes and browser screens alike — learns a new video type
// without being rewritten. Callers load first: fetchContentTypes() on the server
// (lib/content-types-db.ts), useContentTypes() in the browser (lib/use-content-types.ts).

export type TypeKind = "video" | "design";
export type TypeRow = { name: string; kind: TypeKind };

/** Every type a task can have, built-ins first then any added in the dashboard. */
export const ALL_TYPES: string[] = [...CONTENT_TYPES];

export function registerTypes(rows: TypeRow[]): boolean {
  let changed = false;
  for (const r of rows) {
    if (!ALL_TYPES.includes(r.name)) { ALL_TYPES.push(r.name); changed = true; }
    if (r.kind === "video" && !VIDEO_TYPES.has(r.name)) { VIDEO_TYPES.add(r.name); changed = true; }
  }
  return changed;
}

export const isVideoType = (t: string | null | undefined) => !!t && VIDEO_TYPES.has(t);
