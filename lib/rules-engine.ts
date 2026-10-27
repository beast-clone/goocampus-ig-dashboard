import { getSupabase } from "@/lib/supabase";

// Is the rules engine (sql/037) deciding owners and collaborators?
//
// When it is ON, the database applies the Rules page's rules on every save, so the
// app's own hand-off code must stand down — otherwise it would undo a rule the team
// set (e.g. force design work back to one person). When it is OFF the old fixed
// behaviour runs exactly as before. One switch, mh_flags 'rules_engine', so going
// back is a single click on the Rules page.
//
// Read on each request (one tiny row); a failed read means OFF — the safe side,
// because then the old behaviour still runs.
export async function rulesEngineOn(): Promise<boolean> {
  try {
    const sb = getSupabase();
    if (!sb) return false;
    const { data } = await sb.from("mh_flags").select("enabled").eq("key", "rules_engine").maybeSingle();
    return !!(data as { enabled?: boolean } | null)?.enabled;
  } catch {
    return false;
  }
}
