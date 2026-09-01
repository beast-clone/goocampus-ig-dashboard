// Per-person capability permissions (Airtable-style, but finer — individual
// function toggles instead of 5 fixed levels). Stored on ind_users.permissions
// (jsonb). Admins implicitly have every capability.

export type Capability =
  | "create_tasks"
  | "edit_tasks"
  | "delete_tasks"
  | "assign_tasks"
  | "approve_content"
  | "reschedule"
  | "view_analytics"
  | "manage_team";

export const CAPABILITIES: { key: Capability; label: string; desc: string }[] = [
  { key: "create_tasks", label: "Create tasks/posts", desc: "Add new items to the pipeline" },
  { key: "edit_tasks", label: "Edit tasks", desc: "Change details on existing items" },
  { key: "delete_tasks", label: "Delete tasks", desc: "Remove items (leave off for most)" },
  { key: "assign_tasks", label: "Assign to others", desc: "Hand a task to a teammate" },
  { key: "approve_content", label: "Approve content", desc: "Move items to Content-Approved" },
  { key: "reschedule", label: "Reschedule / calendar", desc: "Change publish dates" },
  { key: "view_analytics", label: "View analytics", desc: "Open the Analytics tabs" },
  { key: "manage_team", label: "Manage team + permissions", desc: "Admin — edit these toggles" },
];

// One-click starting points; the admin can then tick/untick individual boxes.
export const PRESETS: { key: string; label: string; caps: Capability[] }[] = [
  { key: "producer", label: "Producer", caps: ["create_tasks", "edit_tasks", "reschedule", "view_analytics"] },
  { key: "manager", label: "Manager", caps: ["create_tasks", "edit_tasks", "delete_tasks", "assign_tasks", "approve_content", "reschedule", "view_analytics"] },
  { key: "viewer", label: "Viewer", caps: ["view_analytics"] },
];

export type Permissions = Partial<Record<Capability, boolean>>;

// Does this user have `cap`? Admins bypass (they have everything).
export function hasCapability(user: { isAdmin?: boolean; permissions?: Permissions } | null | undefined, cap: Capability): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return user.permissions?.[cap] === true;
}

// Normalise arbitrary jsonb into a clean Permissions object (known keys only).
export function cleanPermissions(raw: unknown): Permissions {
  const out: Permissions = {};
  if (raw && typeof raw === "object") {
    for (const c of CAPABILITIES) if ((raw as Record<string, unknown>)[c.key] === true) out[c.key] = true;
  }
  return out;
}

// ---------- Tab / page access (which sections of the dashboard a person can open) ----------

export type Section = "overview" | "content" | "analytics" | "ads" | "sales" | "ai" | "system";

// The 7 sections + the tabs inside each (system is admin-only, never grantable via UI).
export const SECTIONS: { key: Section; label: string; tabs: string; adminOnly?: boolean }[] = [
  { key: "overview", label: "Overview", tabs: "Overview" },
  { key: "content", label: "Content", tabs: "Marketing Hub, My Day, Content Radar, Calendar, Review, Scheduler, Post Planner" },
  { key: "analytics", label: "Analytics", tabs: "Instagram, LinkedIn, YouTube, Facebook, Website, All platforms" },
  { key: "ads", label: "Ads", tabs: "Ads, Competitor Ads, Benchmark" },
  { key: "sales", label: "Sales", tabs: "Social Leads, Sales Hub" },
  { key: "ai", label: "AI", tabs: "AI Insights, AI Reports" },
  { key: "system", label: "System", tabs: "Integrations, Diagnostics, Tools, Team", adminOnly: true },
];
// Sections a non-admin can be granted (system excluded).
export const GRANTABLE_SECTIONS = SECTIONS.filter((s) => !s.adminOnly);

// Each PreviewTab -> its section, so the sidebar can filter what a person sees.
export const TAB_SECTION: Record<string, Section> = {
  overview: "overview",
  "marketing-hub": "content", "my-day": "content", radar: "content", calendar: "content", "content-review": "content", scheduler: "content", "post-planner": "content",
  instagram: "analytics", linkedin: "analytics", youtube: "analytics", facebook: "analytics", website: "analytics", audience: "analytics",
  ads: "ads", competitors: "ads", benchmark: "ads",
  leads: "sales", sales: "sales",
  "ai-insights": "ai", "ai-reports": "ai",
  integrations: "system", diagnostics: "system", tools: "system", team: "system",
};

export type Sections = Partial<Record<Section, boolean>>;

// Can this user open `sec`? Admins bypass; system is always admin-only.
export function canAccessSection(user: { isAdmin?: boolean; sections?: Sections } | null | undefined, sec: Section): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (sec === "system") return false;
  return user.sections?.[sec] === true;
}

// One-click role presets — set which sections a person can open.
export const ROLE_PRESETS: { key: string; label: string; sections: Section[] }[] = [
  { key: "designer", label: "Designer", sections: ["overview", "content", "analytics", "ads", "sales"] },
  { key: "editor", label: "Video editor", sections: ["overview", "content", "analytics"] },
  { key: "writer", label: "Content writer", sections: ["overview", "content", "analytics", "ai"] },
  { key: "manager", label: "Manager", sections: ["overview", "content", "analytics", "ads", "sales", "ai"] },
];

export function cleanSections(raw: unknown): Sections {
  const out: Sections = {};
  if (raw && typeof raw === "object") {
    for (const s of GRANTABLE_SECTIONS) if ((raw as Record<string, unknown>)[s.key] === true) out[s.key] = true;
  }
  return out;
}
