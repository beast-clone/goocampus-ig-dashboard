// id → first name, shared by every server-side "who is this" lookup (chat lines,
// notifications, My Day cards). Seeded with today's team so nothing reads blank
// before the roster loads; fetchRoster() in lib/team-db.ts adds everyone on the
// Team page each time it reads it, so a new teammate is named, not shown as an id.
export const TEAM_NAMES: Record<string, string> = {
  manya: "Manya", praveen: "Praveen", nikhil: "Nikhil", nandu: "Nandu", maheen: "Maheen",
};
