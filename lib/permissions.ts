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
  | "manage_team"
  | "claude_connector";

// What the Team page offers, in plain words. view_analytics and manage_team stay in
// the type (old rows carry them) but aren't offered: nothing checks view_analytics —
// the Analytics *page* switch decides that — and managing the team is Admin.
export const CAPABILITIES: { key: Capability; label: string; short: string; desc: string }[] = [
  { key: "create_tasks", label: "Create tasks", short: "create", desc: "Add new posts and tasks" },
  { key: "edit_tasks", label: "Edit tasks", short: "edit", desc: "Change details on existing tasks" },
  { key: "delete_tasks", label: "Delete tasks", short: "delete", desc: "Move tasks to the recycle bin — leave off for most people" },
  { key: "assign_tasks", label: "Assign to others", short: "assign", desc: "Hand a task to a teammate" },
  { key: "approve_content", label: "Approve content", short: "approve", desc: "Mark work as approved" },
  { key: "reschedule", label: "Change dates", short: "change dates", desc: "Move publish and due dates" },
  { key: "claude_connector", label: "Connect Claude", short: "use Claude", desc: "Create tasks from Claude with a personal key (My Account)" },
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
  { key: "content", label: "Content", tabs: "Marketing Hub, My Day, Content Radar, Calendar, Review, Scheduler, Community Broadcast, Post Planner, Watchers" },
  { key: "analytics", label: "Analytics", tabs: "Instagram, LinkedIn, YouTube, Facebook, Website, All platforms" },
  { key: "ads", label: "Ads", tabs: "Ads, Competitor Ads, Benchmark" },
  { key: "sales", label: "Sales", tabs: "Marketing Campaigns, Social Leads, Sales Hub" },
  { key: "ai", label: "AI", tabs: "AI Insights, AI Reports" },
  { key: "system", label: "System", tabs: "Integrations, Diagnostics, Tools, Team, Comments", adminOnly: true },
];
// Sections a non-admin can be granted (system excluded).
export const GRANTABLE_SECTIONS = SECTIONS.filter((s) => !s.adminOnly);

// Each PreviewTab -> its section, so the sidebar can filter what a person sees.
export const TAB_SECTION: Record<string, Section> = {
  overview: "overview",
  "marketing-hub": "content", "my-day": "content", radar: "content", calendar: "content", "content-review": "content", scheduler: "content", broadcast: "content", "post-planner": "content", watchers: "content",
  instagram: "analytics", linkedin: "analytics", youtube: "analytics", facebook: "analytics", website: "analytics", audience: "analytics",
  ads: "ads", competitors: "ads", benchmark: "ads",
  leads: "sales", sales: "sales", campaigns: "sales",
  "ai-insights": "ai", "ai-reports": "ai",
  integrations: "system", diagnostics: "system", tools: "system", team: "system", comments: "system",
};

export type Sections = Partial<Record<Section, boolean>>;

// Can this user open `sec`? Admins bypass; system is always admin-only.
export function canAccessSection(user: { isAdmin?: boolean; sections?: Sections } | null | undefined, sec: Section): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (sec === "system") return false;
  return user.sections?.[sec] === true;
}

// Roles on the Team page: one click sets both the pages and the task actions. A
// role isn't stored — it's read back from the switches, so changing any switch by
// hand simply makes the person "Custom". Admin is the is_admin flag.
export const ROLE_PRESETS: { key: string; label: string; desc: string; sections: Section[]; caps: Capability[] }[] = [
  { key: "manager", label: "Manager", desc: "All pages · approve, assign, delete",
    sections: ["overview", "content", "analytics", "ads", "sales", "ai"],
    caps: ["create_tasks", "edit_tasks", "delete_tasks", "assign_tasks", "approve_content", "reschedule"] },
  { key: "designer", label: "Designer", desc: "Content, Analytics, Ads, Sales · create, edit",
    sections: ["overview", "content", "analytics", "ads", "sales"], caps: ["create_tasks", "edit_tasks", "reschedule"] },
  { key: "editor", label: "Video editor", desc: "Content, Analytics · create, edit",
    sections: ["overview", "content", "analytics"], caps: ["create_tasks", "edit_tasks", "reschedule"] },
  { key: "writer", label: "Content writer", desc: "Content, Analytics, AI · create, edit",
    sections: ["overview", "content", "analytics", "ai"], caps: ["create_tasks", "edit_tasks", "reschedule"] },
];

export function cleanSections(raw: unknown): Sections {
  const out: Sections = {};
  if (raw && typeof raw === "object") {
    for (const s of GRANTABLE_SECTIONS) if ((raw as Record<string, unknown>)[s.key] === true) out[s.key] = true;
  }
  return out;
}
