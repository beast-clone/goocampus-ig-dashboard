import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionIsAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// Team Attendance (admin-only). Login/logout are written by each person's My Day
// and stored PERMANENTLY in the mh_attendance table (one row per person per day),
// so nothing is lost when the day ends. The board reads day / week / month views
// and derives "done" from mh_activity and "pending" from mh_posts.
export const dynamic = "force-dynamic";

const PEOPLE = [
  { key: "manya", name: "Manya", role: "Content writer" },
  { key: "praveen", name: "Praveen", role: "Designer" },
  { key: "nikhil", name: "Nikhil", role: "Video editor" },
  { key: "nandu", name: "Nandu", role: "Video editor · late shift" },
  { key: "maheen", name: "Maheen", role: "Admin" },
];
const WORKING_NON_DONE = ["Content - Pending", "Content - In Progress", "Content - Approved", "Output - In Progress", "Incorporating Feedback", "Output - Ready"];
const LUNCH_START = 240, LUNCH_END = 300, DAY_MINS = 600;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
function nowMinIST(): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === "hour")?.value || 0), m = Number(p.find((x) => x.type === "minute")?.value || 0);
  return Math.max(0, Math.min(h * 60 + m - 540, DAY_MINS));
}
function workedNet(loginMin: number | null, endMin: number | null): number {
  if (loginMin == null || endMin == null || endMin <= loginMin) return 0;
  const overlap = Math.max(0, Math.min(endMin, LUNCH_END) - Math.max(loginMin, LUNCH_START));
  return Math.max(0, endMin - loginMin - overlap);
}
function rangeFor(view: string, anchor: string): [string, string] {
  const d = new Date(anchor + "T00:00:00Z");
  if (view === "week") {
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0
    const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - dow);
    const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
    return [iso(mon), iso(sun)];
  }
  if (view === "month") {
    return [iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))];
  }
  return [anchor, anchor];
}

type Att = { person_key: string; date: string; login_min: number | null; login_at: string | null; logout_min: number | null; logout_at: string | null; rolled: { title: string; reason: string }[] };

// POST — a person's My Day reports login / logout. { person, action, min, at, rolled? }
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as { person?: string; action?: string; min?: number; at?: string; rolled?: { title: string; reason: string }[] };
    const person = (b.person || "").toLowerCase().trim();
    if (!person || (b.action !== "login" && b.action !== "logout")) return NextResponse.json({ error: "person + action required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const date = todayIST();

    const { data: existing } = await sb.from("mh_attendance").select("*").eq("person_key", person).eq("date", date).maybeSingle();
    const row: Att = (existing as Att) || { person_key: person, date, login_min: null, login_at: null, logout_min: null, logout_at: null, rolled: [] };
    if (b.action === "login") {
      if (row.login_min == null) { row.login_min = Number(b.min) || 0; row.login_at = b.at || ""; } // first login of the day wins
    } else {
      row.logout_min = Number(b.min) || 0; row.logout_at = b.at || "";
      row.rolled = Array.isArray(b.rolled) ? b.rolled.slice(0, 40) : [];
    }
    await sb.from("mh_attendance").upsert(
      { person_key: person, date, login_min: row.login_min, login_at: row.login_at, logout_min: row.logout_min, logout_at: row.logout_at, rolled: row.rolled, updated_at: new Date().toISOString() },
      { onConflict: "person_key,date" },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "attendance write failed"), { status: 502 });
  }
}

// GET — admin board. ?view=day|week|month & date=<anchor YYYY-MM-DD>
export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    if (!getSessionIsAdmin()) return NextResponse.json({ error: "admin only" }, { status: 403 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const u = new URL(req.url);
    const view = (u.searchParams.get("view") || "day").toLowerCase();
    const anchor = u.searchParams.get("date") || todayIST();
    const [from, to] = rangeFor(view, anchor);
    const today = todayIST();

    // Attendance rows in range (permanent table).
    const { data: attData } = await sb.from("mh_attendance").select("*").gte("date", from).lte("date", to);
    const atts = (attData || []) as Att[];

    // "Done" = status-move activity by actor across the range (IST day bounds).
    const startUtc = new Date(`${from}T00:00:00+05:30`).toISOString();
    const endUtc = new Date(`${to}T23:59:59+05:30`).toISOString();
    const { data: acts } = await sb.from("mh_activity").select("actor_key,action,created_at").eq("action", "status_changed").gte("created_at", startUtc).lte("created_at", endUtc).limit(5000);
    const doneBy = new Map<string, number>();
    for (const a of acts || []) { const k = (a.actor_key || "").toLowerCase(); if (k) doneBy.set(k, (doneBy.get(k) || 0) + 1); }

    if (view === "day") {
      const byPerson = new Map<string, Att>();
      for (const r of atts) if (r.date === anchor) byPerson.set(r.person_key, r);
      // Each person's live task list — the actual work they're on / still pending — so the
      // board can show the real tasks per person on expand, not just a count.
      const { data: pend } = await sb.from("mh_posts").select("owner_key,status,particulars,type,additional_info,publishing_date").in("status", WORKING_NON_DONE).limit(2000);
      const tasksBy = new Map<string, { title: string; status: string; type: string; note: string; publishingDate: string }[]>();
      for (const r of pend || []) {
        const k = (r.owner_key || "").toLowerCase(); if (!k) continue;
        const list = tasksBy.get(k) || [];
        list.push({ title: r.particulars || "(untitled)", status: r.status || "", type: r.type || "", note: r.additional_info || "", publishingDate: r.publishing_date || "" });
        tasksBy.set(k, list);
      }
      const rows = PEOPLE.map((p) => {
        const r = byPerson.get(p.key);
        const tasks = tasksBy.get(p.key) || [];
        return { key: p.key, name: p.name, role: p.role, loginMin: r?.login_min ?? null, loginAt: r?.login_at ?? null, logoutMin: r?.logout_min ?? null, logoutAt: r?.logout_at ?? null, rolled: r?.rolled ?? [], doneToday: doneBy.get(p.key) || 0, pending: tasks.length, tasks };
      });
      return NextResponse.json({ view, date: anchor, from, to, rows });
    }

    // week / month aggregate — days present, total worked (net lunch), tasks done.
    const rows = PEOPLE.map((p) => {
      const mine = atts.filter((r) => r.person_key === p.key && r.login_min != null).sort((a, b) => (a.date < b.date ? 1 : -1));
      const workedMin = mine.reduce((s, r) => {
        const end = r.logout_min != null ? r.logout_min : (r.date === today ? nowMinIST() : null);
        return s + workedNet(r.login_min, end);
      }, 0);
      return { key: p.key, name: p.name, role: p.role, daysPresent: mine.length, workedMin, doneCount: doneBy.get(p.key) || 0, lastLoginAt: mine[0]?.login_at ?? null };
    });
    return NextResponse.json({ view, date: anchor, from, to, rows });
  } catch (err) {
    return NextResponse.json(safeError(err, "attendance read failed"), { status: 502 });
  }
}
