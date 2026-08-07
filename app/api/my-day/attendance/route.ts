import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSessionIsAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// Team Attendance (admin-only view). Each person's My Day records their daily
// login (when they open it) and logout (End day) into discover_cache, keyed
// attendance:<date>:<person>. The Attendance tab reads them and derives what
// each person has DONE today (mh_activity) and what's still PENDING (mh_posts).
export const dynamic = "force-dynamic";

const PEOPLE: { key: string; name: string; role: string; shiftStartMin: number }[] = [
  { key: "manya", name: "Manya", role: "Content writer", shiftStartMin: 0 },
  { key: "praveen", name: "Praveen", role: "Designer", shiftStartMin: 0 },
  { key: "nikhil", name: "Nikhil", role: "Video editor", shiftStartMin: 0 },
  { key: "nandu", name: "Nandu", role: "Video editor · late shift", shiftStartMin: 60 },
  { key: "maheen", name: "Maheen", role: "Admin", shiftStartMin: 0 },
];
const WORKING_NON_DONE = ["Content - Pending", "Content - In Progress", "Content - Approved", "Output - In Progress", "Incorporating Feedback", "Output - Ready"];
const ck = (date: string, person: string) => `attendance:${date}:${person}`;
const todayIn = (tz = "Asia/Kolkata") => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); // YYYY-MM-DD

type Rec = { person: string; date: string; loginMin?: number; loginAt?: string; logoutMin?: number; logoutAt?: string; rolled?: { title: string; reason: string }[] };

// POST — a person's My Day reports login / logout.
//   { person, action: "login" | "logout", min, at, rolled? }
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { person?: string; action?: string; min?: number; at?: string; rolled?: { title: string; reason: string }[] };
    const person = (b.person || "").toLowerCase().trim();
    if (!person || (b.action !== "login" && b.action !== "logout")) return NextResponse.json({ error: "person + action required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const date = todayIn();
    const key = ck(date, person);

    const { data: existing } = await sb.from("discover_cache").select("payload").eq("cache_key", key).maybeSingle();
    const rec: Rec = (existing?.payload as Rec) || { person, date };
    if (b.action === "login") {
      // First login of the day wins — don't overwrite an earlier start on a reload.
      if (rec.loginMin == null) { rec.loginMin = Number(b.min) || 0; rec.loginAt = b.at || ""; }
    } else {
      rec.logoutMin = Number(b.min) || 0; rec.logoutAt = b.at || "";
      rec.rolled = Array.isArray(b.rolled) ? b.rolled.slice(0, 40) : [];
    }
    await sb.from("discover_cache").upsert(
      { cache_key: key, source: "attendance", last_fetched: new Date().toISOString(), payload: rec },
      { onConflict: "cache_key" },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "attendance write failed"), { status: 502 });
  }
}

// GET — the admin Attendance board for a date (defaults to today).
//   ?date=YYYY-MM-DD  ->  { date, rows: [...] }
export async function GET(req: Request) {
  try {
    if (!getSessionIsAdmin()) return NextResponse.json({ error: "admin only" }, { status: 403 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const date = new URL(req.url).searchParams.get("date") || todayIn();

    // 1) Login/logout records for the day.
    const { data: recs } = await sb.from("discover_cache").select("cache_key,payload").eq("source", "attendance").like("cache_key", `attendance:${date}:%`);
    const byPerson = new Map<string, Rec>();
    for (const r of recs || []) { const p = (r.payload as Rec); if (p?.person) byPerson.set(p.person, p); }

    // 2) Pending per owner (in-view, not done).
    const { data: pend } = await sb.from("mh_posts").select("owner_key,status").in("status", WORKING_NON_DONE).limit(1000);
    const pendingBy = new Map<string, number>();
    for (const r of pend || []) { const k = (r.owner_key || "").toLowerCase(); if (k) pendingBy.set(k, (pendingBy.get(k) || 0) + 1); }

    // 3) Done today = status-move activity by that actor on `date` (IST day bounds).
    const startUtc = new Date(`${date}T00:00:00+05:30`).toISOString();
    const endUtc = new Date(`${date}T23:59:59+05:30`).toISOString();
    const { data: acts } = await sb.from("mh_activity").select("actor_key,action,created_at").eq("action", "status_changed").gte("created_at", startUtc).lte("created_at", endUtc).limit(2000);
    const doneBy = new Map<string, number>();
    for (const a of acts || []) { const k = (a.actor_key || "").toLowerCase(); if (k) doneBy.set(k, (doneBy.get(k) || 0) + 1); }

    const rows = PEOPLE.map((p) => {
      const r = byPerson.get(p.key);
      return {
        key: p.key, name: p.name, role: p.role,
        loginMin: r?.loginMin ?? null, loginAt: r?.loginAt ?? null,
        logoutMin: r?.logoutMin ?? null, logoutAt: r?.logoutAt ?? null,
        rolled: r?.rolled ?? [],
        doneToday: doneBy.get(p.key) || 0,
        pending: pendingBy.get(p.key) || 0,
      };
    });
    return NextResponse.json({ date, rows });
  } catch (err) {
    return NextResponse.json(safeError(err, "attendance read failed"), { status: 502 });
  }
}
