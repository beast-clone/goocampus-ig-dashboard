import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { hasGoogleServiceAccount, SERVICE_ACCOUNT_EMAIL, googleAccessToken } from "@/lib/google-jwt";
import { safeError } from "@/lib/errors";

// Marketing Campaigns — offline-event lead lists imported from a sheet.
//
//   GET                  → { setup, campaigns }
//   GET ?id=<campaign>   → { setup, campaign, leads }
//
// `setup` reports what is still missing rather than failing: this feature needs a
// migration run by hand and a sheet shared with the service account, and a blank
// page that does not say which of those is outstanding wastes everyone's time.
export const dynamic = "force-dynamic";

// Ask Google whether the Sheets API is actually switched on, rather than assuming
// it from the presence of credentials. Those are two different things: the service
// account exists and mints Sheets-scoped tokens perfectly well while the API
// itself is disabled on the project, and every request is refused. Reporting
// "done" off the credential check told the exact lie this page exists to prevent.
//
// Probed against Google's own public sample sheet, so the answer is about the API
// and not about who we can see. Cached, because it changes roughly never.
let sheetsProbe: { at: number; ok: boolean } | null = null;
const PROBE_TTL = 10 * 60_000;
const GOOGLE_SAMPLE_SHEET = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

async function sheetsApiEnabled(): Promise<boolean> {
  if (!hasGoogleServiceAccount()) return false;
  if (sheetsProbe && Date.now() - sheetsProbe.at < PROBE_TTL) return sheetsProbe.ok;
  let ok = false;
  try {
    const token = await googleAccessToken("https://www.googleapis.com/auth/spreadsheets");
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SAMPLE_SHEET}?fields=spreadsheetId`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) ok = true;
    else {
      const b = await r.json().catch(() => ({}));
      // SERVICE_DISABLED means the API is off. Anything else (no access to that
      // sheet, not found) still proves the API is answering.
      const reason = b?.error?.details?.[0]?.reason || "";
      ok = reason !== "SERVICE_DISABLED";
    }
  } catch { ok = false; }
  sheetsProbe = { at: Date.now(), ok };
  return ok;
}

// The migration hasn't been run yet. PostgREST does not pass through Postgres's
// 42P01; it answers with its own code and a "schema cache" message, so both are
// checked — the code alone silently 502'd the whole page.
function isMissingTable(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return e.code === "42P01" || e.code === "PGRST205" || /could not find the table/i.test(e.message || "");
}

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const setup = {
      tablesReady: true,
      sheetsReady: await sheetsApiEnabled(),
      serviceAccount: SERVICE_ACCOUNT_EMAIL,
      migration: "sql/012_campaigns.sql",
    };

    const id = new URL(req.url).searchParams.get("id");

    if (id) {
      const { data: campaign, error: cErr } = await sb
        .from("mk_campaigns").select("*").eq("id", id).maybeSingle();
      if (isMissingTable(cErr)) return NextResponse.json({ setup: { ...setup, tablesReady: false }, campaign: null, leads: [] });
      if (cErr) throw new Error(cErr.message);

      const { data: leads, error: lErr } = await sb
        .from("mk_campaign_leads").select("*").eq("campaign_id", id).order("created_at", { ascending: true });
      if (lErr) throw new Error(lErr.message);
      return NextResponse.json({ setup, campaign, leads: leads || [] });
    }

    const { data, error } = await sb
      .from("mk_campaigns")
      .select("id, name, source_kind, source_tab, created_at, last_synced_at")
      .order("created_at", { ascending: false });

    if (isMissingTable(error)) {
      return NextResponse.json({ setup: { ...setup, tablesReady: false }, campaigns: [] });
    }
    if (error) throw new Error(error.message);
    return NextResponse.json({ setup, campaigns: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load campaigns"), { status: 502 });
  }
}
