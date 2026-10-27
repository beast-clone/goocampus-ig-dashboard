// Each person's role in the workflow and their shift start — one source for every
// "who is the editor / designer / writer / approver" and "when does their day start"
// decision (27 Oct). Before this, those were people's names typed into ~30 places
// ("nikhil", "nandu" = editors; "praveen" = designer; "manya" = writer; "maheen" =
// approver; Nandu starts at 10). Now they come from the Team page
// (mh_team_members.role / shift_start, sql/038).
//
// No imports: used by the server AND the browser. The server fills it in
// fetchRoster() (lib/team-db.ts), the browser from /api/team (lib/use-team.ts).
// Seeded with today's team so nothing behaves differently before the first load.

export type WorkRole = "writer" | "designer" | "editor" | "manager";
export type RoleEntry = { role: WorkRole; shiftStart: string; active: boolean };

export const TEAM_ROLES: Record<string, RoleEntry> = {
  manya:   { role: "writer",   shiftStart: "09:00", active: true },
  praveen: { role: "designer", shiftStart: "09:00", active: true },
  nikhil:  { role: "editor",   shiftStart: "09:00", active: true },
  nandu:   { role: "editor",   shiftStart: "10:00", active: true },
  maheen:  { role: "manager",  shiftStart: "09:00", active: true },
};

const ROLES = new Set<WorkRole>(["writer", "designer", "editor", "manager"]);

/** Replace the map with fresh rows (keeps the object so every importer sees it). */
export function setTeamRoles(rows: { key: string; role: string | null; shift_start?: string | null; shiftStart?: string | null; active?: boolean | null }[]) {
  if (!rows.length) return;
  for (const k of Object.keys(TEAM_ROLES)) delete TEAM_ROLES[k];
  for (const r of rows) {
    const role = ROLES.has(r.role as WorkRole) ? (r.role as WorkRole) : "writer";
    const shift = r.shift_start || r.shiftStart || "09:00";
    TEAM_ROLES[r.key.toLowerCase()] = { role, shiftStart: /^\d{2}:\d{2}$/.test(shift) ? shift : "09:00", active: r.active !== false };
  }
}

const k = (key: string | null | undefined) => (key || "").toLowerCase().trim();

export const roleOf = (key: string | null | undefined): WorkRole | null => TEAM_ROLES[k(key)]?.role ?? null;
/** Active people with this role, e.g. every editor. */
export const keysWithRole = (role: WorkRole): string[] =>
  Object.entries(TEAM_ROLES).filter(([, v]) => v.active && v.role === role).map(([key]) => key);
export const isEditor = (key: string | null | undefined) => roleOf(key) === "editor";
export const isDesigner = (key: string | null | undefined) => roleOf(key) === "designer";
export const isWriter = (key: string | null | undefined) => roleOf(key) === "writer";
/** The first active person with a role — "the designer", "the writer". */
export const firstWithRole = (role: WorkRole): string | null => keysWithRole(role)[0] ?? null;

/** With exactly two editors, the other one (on camera ↔ editing pairs); otherwise null. */
export function siblingOf(key: string | null | undefined): string | null {
  if (!isEditor(key)) return null;
  const others = keysWithRole("editor").filter((x) => x !== k(key));
  return others.length === 1 ? others[0] : null;
}

/** Minutes after midnight that this person's shift starts (default 9:00). */
export function shiftStartMin(key: string | null | undefined): number {
  const s = TEAM_ROLES[k(key)]?.shiftStart || "09:00";
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
