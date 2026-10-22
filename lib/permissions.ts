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


export type Permissions = Partial<Record<Capability, boolean>> & {
  /** Their publish-date changes wait for an admin's approval (Team & access → Tasks).
   *  Not a capability — it limits rather than allows, and it applies to admins too.
   *  Unset = the rule as it always was: everyone except Maheen. (Praveen, 21 Oct) */
  date_needs_approval?: boolean;
  // Everything below is a switch on Team & access — nothing is fixed per person in
  // code (Praveen, 22 Oct). Unset always means "behave as before".
  /** "full" = every task action; "partial" = only the ticked capabilities. Applies to
   *  admins too: Admin opens every page and manages the team, task actions follow this. */
  task_access?: "full" | "partial";
  /** Per-tab page switches (TABS keys). Unset = the tab's default. */
  tabs?: Record<string, boolean>;
  /** Brand pages they may schedule to (PublishToPage values). Unset = all pages. */
  scheduler_pages?: string[];
  /** Drag tasks / change dates inside the Content and Mentorship calendars. */
  calendar_edit?: boolean;
  /** May change anyone's access on Team & access. Everyone else sees that page
   *  locked and can only send a request (Praveen, 22 Oct). */
  manage_access?: boolean;
};

/** Can they change access on Team & access? The switch only — admin alone isn't enough. */
export function canManageAccess(user: { permissions?: Permissions } | null | undefined): boolean {
  return user?.permissions?.manage_access === true;
}

/** The task actions "Full access" covers — the ones Partial lets you tick. */
export const TASK_ACTIONS: Capability[] = ["create_tasks", "edit_tasks", "delete_tasks", "assign_tasks", "approve_content", "reschedule"];

export const DATE_APPROVAL_RULE = {
  label: "Date changes need admin approval",
  desc: "Moving a publishing date waits until an admin approves it. Giving a task its first date never does.",
};

export function needsDateApproval(user: { id?: string; permissions?: Permissions } | null | undefined): boolean {
  if (!user) return true;
  const v = user.permissions?.date_needs_approval;
  return typeof v === "boolean" ? v : (user.id || "").toLowerCase() !== "maheen";
}

// Does this user have `cap`? Task actions follow the Full / Partial switch when it is
// set — for admins too. Unset falls back to the old rule: admins have everything.
export function hasCapability(user: { isAdmin?: boolean; permissions?: Permissions } | null | undefined, cap: Capability): boolean {
  if (!user) return false;
  const ta = user.permissions?.task_access;
  if (TASK_ACTIONS.includes(cap) && ta === "full") return true;
  if (TASK_ACTIONS.includes(cap) && ta === "partial") return user.permissions?.[cap] === true;
  if (user.isAdmin) return true;
  return user.permissions?.[cap] === true;
}

/** May they drag tasks / change dates in the calendars? Unset = whoever may change dates. */
export function canEditCalendar(user: { isAdmin?: boolean; permissions?: Permissions } | null | undefined): boolean {
  const v = user?.permissions?.calendar_edit;
  return typeof v === "boolean" ? v : hasCapability(user, "reschedule");
}

/** Brand pages they may schedule to; null = all of them. */
export function schedulerPages(user: { isAdmin?: boolean; permissions?: Permissions } | null | undefined): string[] | null {
  const v = user?.permissions?.scheduler_pages;
  return Array.isArray(v) ? v : null;
}
export function maySchedulePage(user: { isAdmin?: boolean; permissions?: Permissions } | null | undefined, page: string): boolean {
  const pages = schedulerPages(user);
  return !pages || pages.includes(page);
}

// Normalise arbitrary jsonb into a clean Permissions object (known keys only).
export function cleanPermissions(raw: unknown): Permissions {
  const out: Permissions = {};
  if (raw && typeof raw === "object") {
    for (const c of CAPABILITIES) if ((raw as Record<string, unknown>)[c.key] === true) out[c.key] = true;
    // Kept when false as well: false is a real answer here, unlike a capability.
    const r = raw as Record<string, unknown>;
    const d = r.date_needs_approval;
    if (typeof d === "boolean") out.date_needs_approval = d;
    if (r.task_access === "full" || r.task_access === "partial") out.task_access = r.task_access;
    if (typeof r.calendar_edit === "boolean") out.calendar_edit = r.calendar_edit;
    if (typeof r.manage_access === "boolean") out.manage_access = r.manage_access;
    if (Array.isArray(r.scheduler_pages)) out.scheduler_pages = r.scheduler_pages.filter((x): x is string => typeof x === "string");
    if (r.tabs && typeof r.tabs === "object") {
      const t: Record<string, boolean> = {};
      for (const tab of TABS) { const v = (r.tabs as Record<string, unknown>)[tab.key]; if (typeof v === "boolean") t[tab.key] = v; }
      out.tabs = t;
    }
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

// ---------- Per-tab access (Praveen, 22 Oct) ----------
// One switch per sidebar tab on Team & access. A tab needs its section AND its own
// switch. Unset = on, except tabs marked adminDefault (team-wide views), which are
// off for non-admins until switched on. `match` says which URLs belong to the tab, so
// a page can refuse a direct link to a tab that's switched off.
export type TabDef = { key: string; label: string; group: string; sec: Section; adminDefault?: boolean; paths: string[]; tab?: string[]; channel?: string };
const P = "/dashboard/preview";
export const TABS: TabDef[] = [
  { key: "briefing", label: "Briefing", group: "My Workspace", sec: "content", paths: [`${P}/briefing`] },
  { key: "my-day", label: "My Day", group: "My Workspace", sec: "content", paths: [`${P}/my-day`] },
  { key: "team-command", label: "Team Command", group: "My Workspace", sec: "content", adminDefault: true, paths: [`${P}/team-command`] },
  { key: "approvals", label: "Approvals", group: "My Workspace", sec: "content", adminDefault: true, paths: [`${P}/approvals`] },
  { key: "workload", label: "Workload", group: "My Workspace", sec: "content", paths: [`${P}/marketing-hub`], tab: ["team", ""] },
  { key: "attendance", label: "Attendance", group: "My Workspace", sec: "content", adminDefault: true, paths: [`${P}/attendance`] },
  { key: "master-sheet", label: "Master sheet", group: "My Workspace", sec: "content", paths: [`${P}/marketing-hub`], tab: ["master"] },
  { key: "pipeline", label: "Pipeline", group: "My Workspace", sec: "content", paths: [`${P}/marketing-hub`], tab: ["pipeline"] },
  { key: "content-calendar", label: "Content calendar", group: "Content", sec: "content", paths: [`${P}/marketing-hub`], tab: ["calendar"] },
  { key: "mentorship-calendar", label: "Mentorship calendar", group: "Content", sec: "content", paths: [`${P}/marketing-hub`], tab: ["calendar"], channel: "goocampusworld" },
  { key: "radar", label: "Content Radar", group: "Content", sec: "content", paths: [`${P}/radar`] },
  { key: "content-studio", label: "Content Studio", group: "Content", sec: "content", paths: [`${P}/content-studio`] },
  { key: "watchers", label: "Watchers", group: "Content", sec: "content", paths: [`${P}/watchers`] },
  { key: "publishing-calendar", label: "Publishing Calendar", group: "Social media", sec: "content", paths: [`${P}/calendar`] },
  { key: "content-review", label: "Content Review", group: "Social media", sec: "content", paths: [`${P}/content-review`] },
  { key: "scheduler", label: "Scheduler", group: "Social media", sec: "content", paths: [`${P}/scheduler`] },
  { key: "broadcast", label: "Community Broadcast", group: "Social media", sec: "content", paths: [`${P}/broadcast`] },
  { key: "instagram", label: "Instagram", group: "Analytics", sec: "analytics", paths: [`${P}/posts`, `${P}/reels`, `${P}/stories`, `${P}/instagram`] },
  { key: "linkedin", label: "LinkedIn", group: "Analytics", sec: "analytics", paths: [`${P}/linkedin`] },
  { key: "youtube", label: "YouTube", group: "Analytics", sec: "analytics", paths: [`${P}/youtube`] },
  { key: "facebook", label: "Facebook", group: "Analytics", sec: "analytics", paths: [`${P}/facebook`] },
  { key: "website", label: "Website", group: "Analytics", sec: "analytics", paths: [`${P}/website`] },
  { key: "seo", label: "SEO", group: "Analytics", sec: "analytics", paths: [`${P}/seo`] },
  { key: "audience", label: "All platforms", group: "Analytics", sec: "analytics", paths: [`${P}/audience`] },
  { key: "ads", label: "Ads", group: "Ads", sec: "ads", paths: [`${P}/ads`] },
  { key: "competitor-ads", label: "Competitor Ads", group: "Ads", sec: "ads", paths: [`${P}/competitors`] },
  { key: "competitors", label: "Competitors", group: "Ads", sec: "ads", paths: [`${P}/benchmark`] },
  { key: "campaigns", label: "Marketing Campaigns", group: "Sales", sec: "sales", paths: [`${P}/campaigns`] },
  { key: "inbox", label: "Inbox", group: "Sales", sec: "sales", paths: [`${P}/inbox`] },
  { key: "leads", label: "Social Leads", group: "Sales", sec: "sales", paths: [`${P}/leads`] },
  { key: "sales-hub", label: "Sales Hub", group: "Sales", sec: "sales", paths: [`${P}/sales-ops`] },
  { key: "organic-sales", label: "Organic Sales", group: "Sales", sec: "sales", paths: [`${P}/organic-sales`] },
  { key: "assistant", label: "Ask GooCampus", group: "AI", sec: "ai", paths: [`${P}/assistant`] },
  { key: "ai-insights", label: "AI Insights", group: "AI", sec: "ai", paths: [`${P}/ai-insights`] },
  { key: "reports", label: "Reports", group: "AI", sec: "ai", paths: [`${P}/ai-reports`, `${P}/reports`] },
];

/** Can they open this tab? Admins: unless switched off. Others: the section, then the tab's switch. */
export function canSeeTab(user: { isAdmin?: boolean; sections?: Sections; permissions?: Permissions } | null | undefined, key: string): boolean {
  if (!user) return false;
  // Admins see every tab unless it's switched off for them by name — so My Day can
  // be hidden for an admin who has no tasks of their own (Praveen, 22 Oct).
  if (user.isAdmin) return user.permissions?.tabs?.[key] !== false;
  const tab = TABS.find((t) => t.key === key);
  if (!tab) return true;
  if (!canAccessSection(user, tab.sec)) return false;
  const v = user.permissions?.tabs?.[key];
  return typeof v === "boolean" ? v : !tab.adminDefault;
}

/** Which tab a URL belongs to (pathname + its search string), or null if none. */
export function tabForUrl(pathname: string, search: string): TabDef | null {
  const q = new URLSearchParams(search);
  const tabParam = q.get("tab") || "";
  const channel = q.get("channel") || "";
  const hits = TABS.filter((t) => t.paths.some((p) => pathname === p || pathname.startsWith(p + "/")));
  for (const t of hits) {
    if (t.tab && !t.tab.includes(tabParam)) continue;
    if (t.channel && t.channel !== channel) continue;
    if (!t.channel && t.tab?.includes("calendar") && channel) continue;
    return t;
  }
  return null;
}

export function cleanSections(raw: unknown): Sections {
  const out: Sections = {};
  if (raw && typeof raw === "object") {
    for (const s of GRANTABLE_SECTIONS) if ((raw as Record<string, unknown>)[s.key] === true) out[s.key] = true;
  }
  return out;
}
