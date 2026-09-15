import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { hasGoogleServiceAccount, SERVICE_ACCOUNT_EMAIL, googleAccessToken } from "@/lib/google-jwt";
import { listCampaigns, saveCampaign, deleteCampaign, type CampaignConfig } from "@/lib/campaigns";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// Marketing Campaigns — event lead lists that live in a Google Sheet.
//
//   GET → { setup, campaigns }
//
// No leads here: they are read from the sheet itself. Only each campaign's
// settings are stored. See lib/campaigns.ts for why.
export const dynamic = "force-dynamic";

// Ask Google whether the Sheets API is actually switched on, rather than
// assuming it from the presence of credentials. Those are two different things:
// this service account mints Sheets-scoped tokens perfectly well while the API
// is disabled on the project and every request is refused. Reporting "ready"
// off the credential check told the exact lie this page exists to prevent.
//
// Probed against Google's own public sample sheet, so the answer is about the
// API and not about which files we can see. Cached; it changes roughly never.
let probe: { at: number; ok: boolean } | null = null;
const PROBE_TTL = 10 * 60_000;
const GOOGLE_SAMPLE_SHEET = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

async function sheetsApiEnabled(): Promise<boolean> {
  if (!hasGoogleServiceAccount()) return false;
  if (probe && Date.now() - probe.at < PROBE_TTL) return probe.ok;
  let ok = false;
  try {
    const token = await googleAccessToken("https://www.googleapis.com/auth/spreadsheets");
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SAMPLE_SHEET}?fields=spreadsheetId`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) ok = true;
    else {
      const b = await r.json().catch(() => ({}));
      // SERVICE_DISABLED means the API is off. Anything else — no access to that
      // file, not found — still proves the API is answering.
      ok = (b?.error?.details?.[0]?.reason || "") !== "SERVICE_DISABLED";
    }
  } catch { ok = false; }
  probe = { at: Date.now(), ok };
  return ok;
}

export async function GET() {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const [sheetsReady, campaigns] = await Promise.all([sheetsApiEnabled(), listCampaigns()]);
    return NextResponse.json({
      setup: { sheetsReady, serviceAccount: SERVICE_ACCOUNT_EMAIL },
      campaigns,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load campaigns"), { status: 502 });
  }
}

// POST { name, spreadsheetId, tab, keyColumn, columnMap } → saves a campaign's
// settings. The leads are not touched: they stay in the sheet.
export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const b = (await req.json().catch(() => ({}))) as Partial<CampaignConfig> & { id?: string };
    // createdAt is preserved when editing an existing campaign rather than reset.
    const missing = (["name", "spreadsheetId", "tab", "keyColumn"] as const).filter((k) => !String(b[k] || "").trim());
    if (missing.length) {
      return NextResponse.json({ error: `Still needed: ${missing.join(", ")}` }, { status: 400 });
    }
    const config: CampaignConfig = {
      id: b.id || crypto.randomUUID(),
      name: String(b.name).trim(),
      spreadsheetId: String(b.spreadsheetId),
      tab: String(b.tab),
      keyColumn: String(b.keyColumn),
      columnMap: b.columnMap && typeof b.columnMap === "object" ? b.columnMap : {},
      statusColumn: b.statusColumn ?? null,
      notesColumn: b.notesColumn ?? null,
      // Named links offered when composing a WhatsApp message. http(s) only —
      // these end up in a message a person sends to a real lead.
      links: Array.isArray(b.links)
        ? b.links
            .map((l) => ({ name: String(l?.name || "").trim().slice(0, 60) || "Link", url: String(l?.url || "").trim() }))
            .filter((l) => /^https?:\/\//i.test(l.url))
            .slice(0, 10)
        : [],
      createdAt: new Date().toISOString(),
      createdBy: getSessionUserId(),
    };
    const ok = await saveCampaign(config);
    if (!ok) return NextResponse.json({ error: "Couldn't save the campaign" }, { status: 502 });
    return NextResponse.json({ ok: true, campaign: config });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't save the campaign"), { status: 502 });
  }
}

// DELETE ?id= — removes the campaign's settings only. The sheet is untouched.
export async function DELETE(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteCampaign(id);
  return NextResponse.json({ ok });
}
