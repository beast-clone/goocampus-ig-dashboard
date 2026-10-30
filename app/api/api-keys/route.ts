import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { API_KEYS } from "@/lib/api-keys-registry";

// System → API keys: which outside services have a key set, and what each is for.
// Names and set / not set only — a key's value never leaves the server.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSection("system");
  if (denied) return denied;
  try {
    const sb = getSupabase();
    const providers = ((sb ? (await sb.from("mh_integration_tokens").select("provider")).data : null) || []).map((r) => String(r.provider));
    const inDb = (p: string) => providers.some((x) => (p.endsWith(":") ? x.startsWith(p) : x === p));
    const keys = API_KEYS.map((k) => {
      const env = k.env.map((name) => ({ name, set: !!process.env[name] }));
      const db = (k.db || []).filter(inDb).map((p) => (p.endsWith(":") ? providers.filter((x) => x.startsWith(p)) : [p])).flat();
      return { ...k, envStatus: env, dbSet: db, set: env.some((e) => e.set) || db.length > 0 };
    });
    return NextResponse.json({ keys });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load the key list"), { status: 502 });
  }
}
