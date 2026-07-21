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
