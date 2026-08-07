// Single source of truth for how long a task takes, by its content type (minutes).
// Used by BOTH My Day's "Today's plan" and the Marketing-Hub Workload/Week timelines,
// so a task reads the same length everywhere (they used to disagree — e.g. a generic
// task was 60m in Workload but 30m in My Day). Type-string based (regex), so it works
// off the raw `type` without needing a VIDEO_TYPES list.
export function estimateTaskMinutes(type: string): number {
  const t = (type || "").toLowerCase();
  if (/thumbnail/.test(t)) return 30;          // "Reel Thumbnail" is design work, not a 90m video
  if (/long-form/.test(t)) return 120;
  if (/reel - cut|cut/.test(t)) return 60;
  if (/reel|short|story|video/.test(t)) return 90;
  if (/carousel/.test(t)) return 60;
  if (/meta ads/.test(t)) return 45;
  return 30;
}
