// The team roster, read from Supabase `ind_users` so the admin Team page can
// manage people live (roles, admin flag, active, personal passwords).
// Falls back to the hard-coded lib/users.ts list if Supabase is unreachable,
// so login never breaks because the DB is down.

import { getSupabase } from "@/lib/supabase";
import { TEAM_NAMES } from "@/lib/team-names";
import { TEAM_USERS, type TeamUser } from "@/lib/users";
import { cleanPermissions, cleanSections, type Permissions, type Sections } from "@/lib/permissions";

export type RosterUser = TeamUser & {
  active: boolean;
  // Whether a personal password is set (the hash itself never leaves the server routes).
  hasPassword: boolean;
  passwordHash: string | null;
  permissions: Permissions;
  sections: Sections;
  photoUrl: string | null;              // profile picture (null = initials)
  theme: "light" | "dark" | "system";   // saved per account (sql/015)
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
  sections?: unknown;
  photo_url?: string | null;
  theme?: string | null;
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
    sections: cleanSections(r.sections),
    photoUrl: r.photo_url || null,
    theme: r.theme === "light" || r.theme === "dark" ? r.theme : "system",
  };
}

function fromCode(u: TeamUser): RosterUser {
  return { ...u, active: true, hasPassword: false, passwordHash: null, permissions: {}, sections: {}, photoUrl: null, theme: "system" };
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
      for (const u of rows) TEAM_NAMES[u.id] = u.first || u.name || u.id;
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

// ── Shared lookups, so no route keeps its own copy of "who is on the team" ──────
// Before 28 Sep a dozen routes each typed the same five ids; someone added on the
// Team page could log in but was rejected as an owner, collaborator, chat partner…

/** Ids of everyone switched on in the Team page. */
export async function activeTeamIds(): Promise<Set<string>> {
  return new Set((await fetchRoster()).filter((u) => u.active).map((u) => u.id));
}

/** id → first name, for everyone ever on the roster (old tasks still name leavers). */
export async function teamFirstNames(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const u of await fetchRoster()) out[u.id] = u.first || u.name || u.id;
  return out;
}

/** The Marketing Hub's own role (enum mh_role), guessed from a job title. */
export function hubRoleFor(title: string | null | undefined): "writer" | "designer" | "editor" | "manager" {
  const t = (title || "").toLowerCase();
  if (/design/.test(t)) return "designer";
  if (/video|edit|production|presenter/.test(t)) return "editor";
  if (/founder|manager|head|lead|cmo|ceo|director/.test(t)) return "manager";
  return "writer";
}

// The Marketing Hub keeps its own people table, mh_team_members, and task owners,
// collaborators and comment authors point at it — so a person must be there before
// work can be given to them. Called whenever the Team page adds or edits someone.
// An existing row keeps its role: that may have been set by hand and is not ours
// to overwrite; only a new row gets a guessed one.
export async function syncHubMember(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data: u } = await sb.from("ind_users").select("id, name, email, role, active").eq("id", id).maybeSingle();
  if (!u) return;
  const row = u as { id: string; name: string; email: string | null; role: string | null; active: boolean | null };
  const { data: existing } = await sb.from("mh_team_members").select("key").eq("key", id).maybeSingle();
  const common = { full_name: row.name, email: row.email || null, active: row.active !== false };
  const { error } = existing
    ? await sb.from("mh_team_members").update(common).eq("key", id)
    : await sb.from("mh_team_members").insert({ key: id, role: hubRoleFor(row.role), ...common });
  if (error) throw new Error(error.message);
}
