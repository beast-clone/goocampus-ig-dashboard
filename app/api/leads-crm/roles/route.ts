import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getRoles, DEFAULT_ROLES, type Role } from "@/lib/lead-assignment";

// GET  /api/leads-crm/roles          → every holder's role
// PUT  /api/leads-crm/roles          → { holder, role }
//
// The role decides whether someone counts as a seller, gets "not contacted"
// alerts, and can receive transfers. This is the switch that answers "what happens
// when Arun starts calling" — flip him to counsellor here, nothing else changes.

const VALID: Role[] = ["counsellor", "pool", "partner", "inactive"];

export async function GET() {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const roles = await getRoles();
    const db = getSupabase();
    // Who last changed each role and when — so the table can show its own audit
    // trail rather than just the current value.
    const meta: Record<string, { updatedBy: string | null; updatedAt: string | null }> = {};
    let persisted = false;
    if (db) {
      const { data, error } = await db.from("lead_roles").select("holder, updated_by, updated_at");
      persisted = !error;
      for (const r of (data || []) as { holder: string; updated_by: string | null; updated_at: string | null }[]) {
        meta[r.holder] = { updatedBy: r.updated_by, updatedAt: r.updated_at };
      }
    }
    return NextResponse.json({ roles, meta, persisted, defaults: DEFAULT_ROLES });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load roles"), { status: 502 });
  }
}

export async function PUT(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const body = (await req.json()) as { holder?: string; role?: string };
    const missing: string[] = [];
    if (!body.holder || !body.holder.trim()) missing.push("Which person the role is for");
    if (!body.role) missing.push("A role");
    if (missing.length) {
      return NextResponse.json({ error: "Can't save the role — something's missing.", missing, gate: "create" }, { status: 422 });
    }
    if (!VALID.includes(body.role as Role)) {
      return NextResponse.json({ error: `"${body.role}" is not a valid role` }, { status: 400 });
    }

    const db = getSupabase();
    if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { error } = await db.from("lead_roles").upsert(
      { holder: body.holder!.trim(), role: body.role, updated_by: getSessionUserId() || null, updated_at: new Date().toISOString() },
      { onConflict: "holder" },
    );
    if (error) {
      // PostgREST says "Could not find the table … in the schema cache"; Postgres
      // says 42P01 / "does not exist". Match both, or a missing table looks like
      // a generic server error and the caller can't explain it.
      if (/does not exist|schema cache|42P01/i.test(error.message)) {
        return NextResponse.json(
          { error: "Roles table is missing — run supabase/lead-roles-and-tracking.sql in the Supabase SQL editor first." },
          { status: 503 },
        );
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, holder: body.holder, role: body.role });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save the role"), { status: 502 });
  }
}
