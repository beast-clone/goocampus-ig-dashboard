// The Marketing Hub's role for a person (enum mh_role), guessed from their job
// title on the Team page. Shared by the server (copying someone into
// mh_team_members) and the browser (placing a newcomer on the Hub's Team tab), so
// both guess the same way. No imports: safe in either bundle.
export type HubRole = "writer" | "designer" | "editor" | "manager";

export function hubRoleFor(title: string | null | undefined): HubRole {
  const t = (title || "").toLowerCase();
  if (/design/.test(t)) return "designer";
  if (/video|edit|production|presenter/.test(t)) return "editor";
  if (/founder|manager|head|lead|cmo|ceo|director/.test(t)) return "manager";
  return "writer";
}
