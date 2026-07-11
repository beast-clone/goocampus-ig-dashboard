// The GooCampus marketing team — the people who each get an individual dashboard.
// Kept in one place so login, /api/me, the admin gate and per-person data all agree.
// (Seeded into Supabase `ind_users`; this list is the app-side source of truth for now.)

export type TeamUser = {
  id: string;        // stable slug used in the session cookie + DB rows
  email: string;     // login identity
  name: string;      // full display name
  first: string;     // greeting name
  initials: string;  // avatar initials
  role: string;      // shown under the name
  isAdmin: boolean;  // admins can open the main /dashboard; members only see /me
};

export const TEAM_USERS: TeamUser[] = [
  { id: "maheen", email: "maheenejaz@goocampus.in", name: "Maheen Ejaz", first: "Maheen", initials: "MH", role: "Co-founder & CMO", isAdmin: true },
  { id: "manya", email: "manya.bm@goocampus.in", name: "Manya BM", first: "Manya", initials: "MB", role: "Content Writer", isAdmin: false },
  { id: "nikhil", email: "nikhil.s@goocampus.in", name: "Nikhil Shyamraj", first: "Nikhil", initials: "NK", role: "Video Editor / Presenter", isAdmin: false },
  { id: "nandu", email: "nandu@goocampus.in", name: "Nandu C", first: "Nandu", initials: "ND", role: "Senior Video Editor", isAdmin: false },
  { id: "praveen", email: "praveen@goocampus.in", name: "Praveen L", first: "Praveen", initials: "PR", role: "Senior Graphic Designer", isAdmin: false },
];

export function getUserById(id: string | null | undefined): TeamUser | null {
  if (!id) return null;
  return TEAM_USERS.find((u) => u.id === id) ?? null;
}

export function getUserByEmail(email: string | null | undefined): TeamUser | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return TEAM_USERS.find((u) => u.email.toLowerCase() === e) ?? null;
}

export function isValidUserId(id: string | null | undefined): boolean {
  return !!getUserById(id);
}

export function isAdminId(id: string | null | undefined): boolean {
  return !!getUserById(id)?.isAdmin;
}
