// The Content Calendar "Type" values that count as VIDEO work. Video is never
// auto-assigned to the designer — it goes into the editors' claim pool. This set is
// the single source of truth shared by:
//   • app/api/marketing-hub/update/route.ts  (decides the approval handoff)
//   • app/api/my-day/route.ts                (builds the editors' claim pool)
//   • app/api/my-day/notifications/route.ts  (routes handoff notifications)
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
