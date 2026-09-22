import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { invalidateRosterCache } from "@/lib/team-db";

// PATCH /api/account/profile { name?, role?, theme? } — anyone edits their OWN full
// name, job title and theme (light | dark | system). Email, username and access stay admin-only (Team page): email and
// username are what people sign in with. The short first name (`first`), which the
// dashboard uses to match people to their tasks, is deliberately left alone.
export async function PATCH(req: Request) {
  const uid = getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; role?: unknown; theme?: unknown };

  const updates: Record<string, string> = {};
  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
    if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Name must be 2–80 characters." }, { status: 400 });
    updates.name = name;
  }
  if (b.role !== undefined) {
    const role = typeof b.role === "string" ? b.role.trim().replace(/\s+/g, " ") : "";
    if (role.length > 60) return NextResponse.json({ error: "Job title must be 60 characters or fewer." }, { status: 400 });
    updates.role = role;
  }
  if (b.theme !== undefined) {
    if (b.theme !== "light" && b.theme !== "dark" && b.theme !== "system") return NextResponse.json({ error: "Theme must be light, dark or system." }, { status: 400 });
    updates.theme = b.theme;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await sb.from("ind_users").update(updates).eq("id", uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateRosterCache();
  return NextResponse.json({ ok: true, ...updates });
}
