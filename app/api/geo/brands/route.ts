import { NextResponse } from "next/server";
import { geoGuard, geoDb, bad } from "../_shared";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// POST /api/geo/brands { name, domain?, aliases? } → add a brand to track.
export async function POST(req: Request) {
  const denied = await geoGuard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 60);
  if (name.length < 2) return bad("Give the brand a name.");
  const domain = String(b.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").slice(0, 80) || null;
  const aliases = (Array.isArray(b.aliases) ? b.aliases : String(b.aliases || "").split(",")).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 8);
  try {
    const db = geoDb();
    const { count } = await db.from("geo_brands").select("id", { count: "exact", head: true });
    const { data, error } = await db.from("geo_brands").insert({ name, domain, aliases, position: (count || 0) + 1, created_by: getSessionUserId() }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't add the brand"), { status: 500 });
  }
}
