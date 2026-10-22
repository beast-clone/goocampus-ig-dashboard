// Starting access settings agreed with Praveen on 22 Oct 2026 (Team & access).
// Run ONCE at the deploy that ships per-tab access:  node scripts/access-2026-10-22.mjs
// Prints what it would change; add --apply to write. Everything stays editable on
// the Team & access page afterwards — these are only starting values.
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const h = { apikey: env.SUPABASE_SECRET_KEY, Authorization: "Bearer " + env.SUPABASE_SECRET_KEY, "Content-Type": "application/json" };
const ALL_TABS = ["my-day","briefing","workload","attendance","master-sheet","pipeline","team-command","approvals","content-calendar","mentorship-calendar","radar","content-studio","watchers","publishing-calendar","content-review","scheduler","broadcast","instagram","linkedin","youtube","facebook","website","seo","audience","ads","competitor-ads","competitors","campaigns","inbox","leads","sales-hub","organic-sales","assistant","ai-insights","reports"];
const on = (keys) => Object.fromEntries(ALL_TABS.map((k) => [k, keys.includes(k)]));
const BASE = ["my-day","briefing","workload","master-sheet","pipeline","content-calendar","mentorship-calendar","instagram","linkedin","youtube","facebook","website","seo","audience"];
const CONTENT_PLUS = [...BASE, "content-review","radar","content-studio","watchers","publishing-calendar","scheduler","broadcast","ads","competitor-ads","competitors","campaigns","inbox","leads","sales-hub","organic-sales"];
const PLAN = {
  maheen:  { is_admin: true,  perms: { task_access: "full", calendar_edit: true,  date_needs_approval: false } },
  praveen: { is_admin: true,  perms: { task_access: "full", calendar_edit: false } },
  manya:   { is_admin: false, sections: { overview: true, content: true, analytics: true, ads: true, sales: true }, perms: { task_access: "full", calendar_edit: true, tabs: on(CONTENT_PLUS) } },
  nandu:   { is_admin: false, sections: { overview: true, content: true, analytics: true, ads: true, sales: true }, perms: { task_access: "full", calendar_edit: false, tabs: on(CONTENT_PLUS), scheduler_pages: ["12Plus / GC India"] } },
  nikhil:  { is_admin: false, sections: { overview: true, content: true, analytics: true }, perms: { task_access: "partial", create_tasks: true, edit_tasks: true, delete_tasks: false, calendar_edit: false, tabs: on(BASE) } },
};
const apply = process.argv.includes("--apply");
const users = await fetch(`${env.SUPABASE_URL}/rest/v1/ind_users?select=id,is_admin,sections,permissions`, { headers: h }).then((r) => r.json());
for (const u of users) {
  const p = PLAN[u.id]; if (!p) continue;
  const permissions = { ...(u.permissions || {}), ...p.perms };
  const update = { is_admin: p.is_admin, permissions, ...(p.sections ? { sections: p.sections } : {}) };
  console.log(u.id, JSON.stringify({ is_admin: [u.is_admin, p.is_admin], perms: p.perms.task_access, sections: p.sections ? Object.keys(p.sections) : "unchanged" }));
  if (apply) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/ind_users?id=eq.${u.id}`, { method: "PATCH", headers: h, body: JSON.stringify(update) });
    console.log("  ->", r.status);
  }
}
