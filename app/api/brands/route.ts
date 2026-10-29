import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { ACCOUNTS } from "@/lib/accounts";
import { LI_PAGE, YT_CHANNEL } from "@/lib/brand-platforms";
import { getAccount } from "@/lib/instagram";
import { CHANNELS } from "@/lib/youtube-channels";
import { hasChannelGrant } from "@/lib/youtube";

// Brands page (docs/BRANDS_SPEC.md, stage 1): every brand, its logo, and whether each of its
// four accounts is really connected — read from the same places the data tabs read, so the page
// can't say "connected" while a tab shows nothing. POST saves an uploaded logo.
export const dynamic = "force-dynamic";

const LOGOS_KEY = "brands:logos";            // { brandId: data URI } — uploaded logos
const AVATARS_KEY = "account_avatars_v1";    // Instagram profile pictures (/api/account-avatars)
const LI_NAME: Record<string, string> = { goocampus: "GooCampus", gcworld: "GooCampus World" };
const MAX_LOGO = 300 * 1024;

type SB = NonNullable<ReturnType<typeof getSupabase>>;
async function readCache(sb: SB | null, key: string): Promise<Record<string, string>> {
  if (!sb) return {};
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", key).maybeSingle();
  return (data?.payload as Record<string, string>) || {};
}

export async function GET() {
  const denied = await requireSection("system");
  if (denied) return denied;
  try {
    const sb = getSupabase();
    const [uploaded, avatars] = await Promise.all([readCache(sb, LOGOS_KEY), readCache(sb, AVATARS_KEY)]);
    const brands = await Promise.all(ACCOUNTS.map(async (a) => {
      const meta = getAccount(a.id);                       // null = no Instagram/Facebook key configured
      const li = LI_PAGE[a.id] ?? null;
      const liOn = !!li && !!process.env[`LINKEDIN_ORG_URN_${li.toUpperCase()}`];
      const yt = YT_CHANNEL[a.id] ?? null;
      const ytOn = yt ? await hasChannelGrant(yt).catch(() => false) : false;
      return {
        id: a.id, name: a.label, handle: a.handle,
        logo: uploaded[a.id] || avatars[a.id] || null,
        logoUploaded: !!uploaded[a.id],
        accounts: {
          instagram: { connected: !!meta, name: meta ? meta.handle : null },
          facebook: { connected: !!meta?.pageId, name: meta?.pageId ? meta.label : null },
          linkedin: { connected: liOn, name: liOn ? LI_NAME[li!] || li : null, page: li },
          youtube: { connected: ytOn, name: yt ? CHANNELS[yt]?.name || yt : null, channel: yt },
        },
      };
    }));
    return NextResponse.json({ brands });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load brands"), { status: 502 });
  }
}

/** Body: { id, logo } — logo is a PNG/JPEG/WebP data URI (≤300 KB), or null to remove it. Admin only. */
export async function POST(req: Request) {
  const denied = await requireSection("system");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can change a brand's logo." }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
  try {
    const b = (await req.json()) as { id?: string; logo?: string | null };
    if (!ACCOUNTS.some((a) => a.id === b.id)) return NextResponse.json({ error: "No such brand." }, { status: 404 });
    if (b.logo != null && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo) || b.logo.length > MAX_LOGO))
      return NextResponse.json({ error: "Use a PNG, JPG or WebP image under 300 KB." }, { status: 400 });
    const logos = await readCache(sb, LOGOS_KEY);
    if (b.logo) logos[b.id!] = b.logo; else delete logos[b.id!];
    await sb.from("discover_cache").upsert(
      { cache_key: LOGOS_KEY, source: "brand_logos", last_fetched: new Date().toISOString(), payload: logos },
      { onConflict: "cache_key" },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save the logo"), { status: 400 });
  }
}
