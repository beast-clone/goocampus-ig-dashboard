import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";

// Shared by the /api/geo routes: the Analytics section + the GEO SEO tab switch
// (lib/permissions API_TABS), and the database.
export async function geoGuard(): Promise<NextResponse | null> {
  return requireSection("analytics");
}
export function geoDb() {
  const sb = getSupabase();
  if (!sb) throw new Error("Database not configured");
  return sb;
}
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
