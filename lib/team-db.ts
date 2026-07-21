// The team roster, read from Supabase `ind_users` so the admin Team page can
// manage people live (roles, admin flag, active, personal passwords).
// Falls back to the hard-coded lib/users.ts list if Supabase is unreachable,
// so login never breaks because the DB is down.

import { getSupabase } from "@/lib/supabase";
import { TEAM_USERS, type TeamUser } from "@/lib/users";
import { cleanPermissions, type Permissions } from "@/lib/permissions";

export type RosterUser = TeamUser & {
  active: boolean;
  // Whether a personal password is set (the hash itself never leaves the server routes).
  hasPassword: boolean;
  passwordHash: string | null;
  permissions: Permissions;
};

type IndUserRow = {
  id: string;
  email: string;
  name: string;
  first: string;
  initials: string;
  role: string;
  is_admin: boolean;
  active: boolean;
  password_hash?: string | null;
  permissions?: unknown;
};

function fromRow(r: IndUserRow): RosterUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    first: r.first,
    initials: r.initials,
    role: r.role,
    isAdmin: !!r.is_admin,
    active: r.active !== false,
    hasPassword: !!r.password_hash,
    passwordHash: r.password_hash ?? null,
    permissions: cleanPermissions(r.permissions),
  };
}

function fromCode(u: TeamUser): RosterUser {
  return { ...u, active: true, hasPassword: false, passwordHash: null, permissions: {} };
}

// Small cache so /api/me etc. don't hit Supabase on every request.
let cache: { at: number; rows: RosterUser[] } | null = null;
const CACHE_MS = 30_000;

export async function fetchRoster(fresh = false): Promise<RosterUser[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("ind_users")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data && data.length > 0) {
      const rows = (data as IndUserRow[]).map(fromRow);
      cache = { at: Date.now(), rows };
      return rows;
    }
  }
  return TEAM_USERS.map(fromCode);
}

export function invalidateRosterCache() {
  cache = null;
}

export async function rosterById(id: string | null | undefined): Promise<RosterUser | null> {
  if (!id) return null;
  const rows = await fetchRoster();
  return rows.find((u) => u.id === id) ?? null;
}

export async function rosterByEmail(email: string | null | undefined): Promise<RosterUser | null> {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  const rows = await fetchRoster();
  return rows.find((u) => u.email.toLowerCase() === e) ?? null;
}
