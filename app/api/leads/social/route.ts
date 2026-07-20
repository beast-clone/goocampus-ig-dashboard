import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { airtableList, dateRangeFormula, pickName, CRM_TABLE, REVENUE_TABLE, SALES_HUB_BASE } from "@/lib/sales-hub";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { classifyThread } from "@/lib/lead-detection";
import { getAdAccount, fetchCampaigns } from "@/lib/meta-ads";

// GET /api/leads/social?from=YYYY-MM-DD&to=YYYY-MM-DD&force=1
//
// The Social Leads snapshot — DM Leads, Meta Ads Leads, and Samvaya. HEAVY (inbox
// threads + Airtable CRM + Revenue Tracker + Samvaya base + Meta ads), and leads
// convert over MONTHS, so it's COMPUTED ONCE A DAY and cached in discover_cache; the
// page reads the cache. A separate (new) daily n8n job warms it. ?force=1 recomputes.
export const dynamic = "force-dynamic";

const PAGES = ["goocampus", "goocampusworld", "12thplusdotcom"] as const;
const PAGE_LABEL: Record<string, string> = { goocampus: "GooCampus Edu", goocampusworld: "GooCampus World", "12thplusdotcom": "12thplus" };
// STRICT rule: a DM is a lead ONLY when the person actually shared a contact.
const CONTACT_KINDS = new Set(["phone", "email", "whatsapp", "telegram"]);
const KEYWORDS = ["ALS", "AMC", "Blueprint", "Global Handbook", "PLAB", "Approbation", "NEET", "USMLE", "OET"];
const CLOSED_WON = "closed won";
const TTL_MS = 24 * 60 * 60 * 1000;
const isSamvaya = (n: string) => /samvaya/i.test(n || "");

// Instagram Graph API (READ-ONLY). Our own handles — their comments are CTA
// auto-replies ("Link in bio"), NOT prospect leads, so they're excluded.
const GRAPH = "https://graph.facebook.com/v21.0";
const OWN_HANDLES = new Set(
  ["goocampus", "goocampusworld", "12thplusdotcom", (process.env.IG_USERNAME || "").toLowerCase()].filter(Boolean),
);

// Revenue Tracker field IDs (schema-confirmed) — read via returnFieldsByFieldId.
const RT = { revenue: "fldOLm9i5J0GMpjWB", month: "fldOiS6lqPg9hdzcC", source: "fldC7Q35IWWeGDY4E", date: "fldbfTVghGhW494UJ" };
// Samvaya intake base (read-only; different base).
const SAMVAYA_BASE = "applSxfQV00wCPrgJ";
const SAMVAYA_TABLE = "tblJfL4yDgkCRiqit";
const SV = { type: "fldpOs2n5FbExGywp", campaign: "fldvlo616I0v6ccDb", sentA: "fldMOg7oC7npCTtw7", sentB: "fldnACilGytGiXumU" };
const SV_MEDICAL = new Set(["doctor_(mbbs_/_md_/_ms_/_dnb)", "dentist_(bds)_or_ayush_practitioner", "other_healthcare_professional"]);

type DMMsg = { account: string; sender_id: string; direction: "in" | "out"; text: string; at: string };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const isPage = (a: string) => (PAGES as readonly string[]).includes(a);

// Generic Airtable read by FIELD ID (returnFieldsByFieldId) — lets us read any base
// (Revenue Tracker + the separate Samvaya base) without needing field display names.
async function atFetch(base: string, table: string, maxRecords = 5000): Promise<Record<string, unknown>[]> {
  const token = process.env.AIRTABLE_API_KEY;
  if (!token) throw new Error("AIRTABLE_API_KEY missing");
  const out: Record<string, unknown>[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams();
    qs.set("pageSize", "100");
    qs.set("returnFieldsByFieldId", "true");
    if (offset) qs.set("offset", offset);
    const r = await fetchWithTimeout(`https://api.airtable.com/v0/${base}/${table}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Airtable ${base}/${table} → ${r.status}`);
    const j = (await r.json()) as { records?: { fields: Record<string, unknown> }[]; offset?: string };
    for (const rec of j.records || []) out.push(rec.fields || {});
    offset = j.offset;
  } while (offset && out.length < maxRecords);
  return out;
}

// ---- DM leads (contact-shared) from the inbox mirror ----
async function computeDM(sb: NonNullable<ReturnType<typeof getSupabase>>) {
  const { data } = await sb.from("discover_cache").select("payload").eq("source", "dm_msg").limit(8000);
  const msgs = (data || []).map((r) => r.payload as DMMsg).filter((m) => m && isPage(m.account));
  const threads = new Map<string, DMMsg[]>();
  for (const m of msgs) {
    const key = `${m.account}::${m.sender_id}`;
    let arr = threads.get(key);
    if (!arr) { arr = []; threads.set(key, arr); }
    arr.push(m);
  }
  type Agg = { page: string; label: string; leads: number; interested: number; threads: number; replied: number; kinds: Record<string, number> };
  const byPage: Record<string, Agg> = {};
  for (const p of PAGES) byPage[p] = { page: p, label: PAGE_LABEL[p], leads: 0, interested: 0, threads: 0, replied: 0, kinds: {} };
  const keywords: Record<string, number> = {};
  for (const [key, tmsgs] of threads) {
    const agg = byPage[key.split("::")[0]];
    if (!agg) continue;
    agg.threads++;
    const inbound = tmsgs.filter((m) => m.direction === "in").map((m) => ({ direction: m.direction, text: m.text }));
    const cls = classifyThread(inbound);
    if (cls.matched) {
      if (CONTACT_KINDS.has(cls.kind)) { agg.leads++; agg.kinds[cls.kind] = (agg.kinds[cls.kind] || 0) + 1; }
      else agg.interested++;
    }
    if (tmsgs.some((m) => m.direction === "out")) agg.replied++;
    const text = inbound.map((m) => m.text).join(" ").toLowerCase();
    for (const k of KEYWORDS) if (text.includes(k.toLowerCase())) keywords[k] = (keywords[k] || 0) + 1;
  }
  const pages = PAGES.map((p) => { const a = byPage[p]; return { ...a, replyRate: a.threads ? Math.round((a.replied / a.threads) * 100) : 0 }; });
  const sum = (f: (a: Agg) => number) => pages.reduce((s, a) => s + f(a), 0);
  const th = sum((a) => a.threads);
  return {
    total: { leads: sum((a) => a.leads), interested: sum((a) => a.interested), threads: th, replyRate: th ? Math.round((sum((a) => a.replied) / th) * 100) : 0 },
    byPage: pages,
    keywords: Object.entries(keywords).map(([keyword, n]) => ({ keyword, n })).sort((a, b) => b.n - a.n),
    commentsVsDirect: null,
    topPost: null,
    note: "@goocampus inbox only — World/12thplus mirrors not started yet; totals below come from the CRM source field.",
  };
}

// ---- Instagram comments (READ-ONLY Graph API): top post + keyword comments ----
// No automation — a plain GET of our own posts' comments, so no Meta ban-risk.
async function computeComments(from: string, to: string) {
  const uid = process.env.IG_USER_ID;
  const token = process.env.IG_PAGE_ACCESS_TOKEN;
  if (!uid || !token) return { error: "IG_USER_ID / IG_PAGE_ACCESS_TOKEN missing" };
  type Cmt = { text?: string; username?: string; timestamp?: string };
  type Media = { id: string; permalink?: string; caption?: string; timestamp?: string; comments?: { data?: Cmt[] } };
  const posts: { id: string; permalink: string; caption: string; when: string; comments: number; keywords: string[] }[] = [];
  const keywords: Record<string, number> = {};
  let totalReal = 0, ownReplies = 0, pagesFetched = 0;
  const fields = "id,permalink,caption,timestamp,comments_count,comments.limit(80){text,username,timestamp}";
  let next: string | null = `${GRAPH}/${uid}/media?fields=${encodeURIComponent(fields)}&limit=50&access_token=${token}`;
  try {
    while (next && pagesFetched < 4) {
      const r = await fetchWithTimeout(next, { cache: "no-store" });
      if (!r.ok) throw new Error(`IG media → ${r.status}`);
      const j = (await r.json()) as { data?: Media[]; paging?: { next?: string } };
      pagesFetched++;
      for (const m of j.data || []) {
        let real = 0;
        const postKw = new Set<string>();
        for (const c of m.comments?.data || []) {
          const when = (c.timestamp || "").slice(0, 10);
          if (when && (when < from || when > to)) continue; // comment outside the window
          if (OWN_HANDLES.has((c.username || "").toLowerCase())) { ownReplies++; continue; } // our own CTA reply
          real++;
          const text = (c.text || "").toLowerCase();
          for (const k of KEYWORDS) if (text.includes(k.toLowerCase())) { keywords[k] = (keywords[k] || 0) + 1; postKw.add(k); }
        }
        if (real > 0) {
          totalReal += real;
          posts.push({
            id: m.id,
            permalink: m.permalink || "",
            caption: String(m.caption || "").replace(/\s+/g, " ").slice(0, 90),
            when: String(m.timestamp || "").slice(0, 10),
            comments: real,
            keywords: [...postKw],
          });
        }
      }
      next = j.paging?.next || null;
    }
  } catch (e) {
    return { error: String(e) };
  }
  posts.sort((a, b) => b.comments - a.comments);
  return {
    totalComments: totalReal,
    postsWithComments: posts.length,
    ownReplies,
    topPosts: posts.slice(0, 8),
    keywords: Object.entries(keywords).map(([keyword, n]) => ({ keyword, n })).sort((a, b) => b.n - a.n),
    note: "Read-only Instagram Graph API — real-prospect comments only (own CTA auto-replies excluded).",
  };
}

// ---- CRM: leads generated + source split (Airtable, created-date window) ----
async function computeCRM(from: string, to: string) {
  const rows = await airtableList<Record<string, unknown>>(CRM_TABLE, {
    filterByFormula: dateRangeFormula("Created Date", from, to),
    fields: ["Full Name", "Created Date", "Lead Status", "Lead Source (n8n)", "Primary Interest (n8n)"],
    pageSize: 100,
    maxRecords: 20_000,
  });
  const DM_SOURCES = new Set(["Instagram/Facebook DMs", "DM Booking"]);
  let closedWonStatus = 0;
  const byStatus: Record<string, number> = {};
  const genBySource: Record<string, number> = {};
  const dmLeadRows: { name: string; source: string; status: string; interest: string; when: string }[] = [];
  for (const rec of rows) {
    const status = (pickName(rec.fields["Lead Status"]) || "—").trim();
    const source = pickName(rec.fields["Lead Source (n8n)"]) || "—";
    byStatus[status] = (byStatus[status] || 0) + 1;
    genBySource[source] = (genBySource[source] || 0) + 1;
    if (status.toLowerCase() === CLOSED_WON) closedWonStatus++;
    if (DM_SOURCES.has(source)) {
      dmLeadRows.push({
        name: pickName(rec.fields["Full Name"]) || "—",
        source,
        status,
        interest: pickName(rec.fields["Primary Interest (n8n)"]) || "—",
        when: String(rec.fields["Created Date"] || ""),
      });
    }
  }
  dmLeadRows.sort((a, b) => (b.when || "").localeCompare(a.when || ""));
  return {
    generated: rows.length,
    dmLeads: dmLeadRows.length,
    genBySource,
    byStatus: Object.entries(byStatus).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    closedWonStatus, // note: CRM status is under-maintained — use the Revenue Tracker for real conversions
    dmLeadRows: dmLeadRows.slice(0, 400), // DM-sourced leads for the per-lead table (grouped/scrolled client-side)
  };
}

// The Revenue Tracker's primary period key is its "Month" single-select (e.g.
// "June 2026") — the "Date" field is only sometimes filled. So we match conversions
// by the month(s) the reporting window spans, which also fits its monthly update cadence.
function monthsInWindow(from: string, to: string): Set<string> {
  const set = new Set<string>();
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00`);
  let guard = 0;
  while (d <= end && guard++ < 36) {
    set.add(d.toLocaleString("en-US", { month: "long", year: "numeric" }));
    d.setMonth(d.getMonth() + 1);
  }
  return set;
}

// ---- Revenue Tracker: REAL conversions + revenue (by close-month) ----
async function computeRevenue(from: string, to: string) {
  const rows = await atFetch(SALES_HUB_BASE, REVENUE_TABLE);
  const months = monthsInWindow(from, to);
  let converted = 0;
  let revenue = 0;
  const bySource: Record<string, { count: number; revenue: number }> = {};
  const byMonth: Record<string, { count: number; revenue: number }> = {};
  for (const f of rows) {
    const month = String(f[RT.month] || "—");
    if (!months.has(month)) continue; // conversions that CLOSED in the window's month(s)
    const rev = Number(f[RT.revenue]) || 0;
    const source = String(f[RT.source] || "—");
    converted++;
    revenue += rev;
    const bs = bySource[source] || (bySource[source] = { count: 0, revenue: 0 });
    bs.count++; bs.revenue += rev;
    const bm = byMonth[month] || (byMonth[month] = { count: 0, revenue: 0 });
    bm.count++; bm.revenue += rev;
  }
  const AD_SOURCE = "Digital Marketing Activity";
  const DM_SOURCES = ["Instagram/Facebook DMs", "DM Booking"];
  return {
    converted,
    revenue,
    bySource,
    byMonth,
    adConverted: bySource[AD_SOURCE]?.count || 0,
    adRevenue: bySource[AD_SOURCE]?.revenue || 0,
    dmConverted: DM_SOURCES.reduce((s, k) => s + (bySource[k]?.count || 0), 0),
    dmRevenue: DM_SOURCES.reduce((s, k) => s + (bySource[k]?.revenue || 0), 0),
  };
}

// ---- Meta ads: GooCampus (Samvaya excluded) + Samvaya split out ----
async function computeAds(from: string, to: string) {
  const acct = getAdAccount();
  if (!acct) return { gc: null, samvaya: null };
  const campaigns = await fetchCampaigns(acct, from, to);
  const mk = (list: typeof campaigns) => {
    const leads = list.reduce((s, c) => s + (c.leads || 0), 0);
    const spend = list.reduce((s, c) => s + (c.spend || 0), 0);
    return {
      leads, spend, costPerLead: leads ? Math.round(spend / leads) : 0,
      campaigns: list.map((c) => ({ name: c.campaign_name, leads: c.leads, spend: c.spend, costPerLead: c.costPerLead })).sort((a, b) => b.leads - a.leads),
    };
  };
  return {
    gc: mk(campaigns.filter((c) => !isSamvaya(c.campaign_name))),
    samvaya: mk(campaigns.filter((c) => isSamvaya(c.campaign_name))),
  };
}

// ---- Samvaya: intake leads (own base) + ads; no conversion tracked ----
async function computeSamvaya(ads: unknown) {
  let intake: unknown;
  try {
    const rows = await atFetch(SAMVAYA_BASE, SAMVAYA_TABLE);
    let medical = 0, nonMedical = 0, sent = 0;
    const byCampaign: Record<string, number> = {};
    for (const f of rows) {
      const type = String(f[SV.type] || "").toLowerCase();
      if (SV_MEDICAL.has(type)) medical++; else if (type) nonMedical++;
      const c = String(f[SV.campaign] || "—");
      byCampaign[c] = (byCampaign[c] || 0) + 1;
      if (f[SV.sentA] === true || f[SV.sentB] === true) sent++;
    }
    intake = { total: rows.length, medical, nonMedical, sentRate: rows.length ? Math.round((sent / rows.length) * 100) : 0, byCampaign };
  } catch (e) {
    intake = { error: String(e) }; // e.g. token lacks Samvaya-base access → tab shows ads only
  }
  return { ads, intake, conversion: null }; // Samvaya is lead-gen only — no closed-won yet
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const to = url.searchParams.get("to") || ymd(new Date());
    const from = url.searchParams.get("from") || ymd(new Date(Date.now() - 30 * 86_400_000));
    const force = url.searchParams.get("force") === "1";

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const cacheKey = `social_leads_snapshot:${from}:${to}`;
    if (!force) {
      const { data } = await sb.from("discover_cache").select("payload, last_fetched").eq("cache_key", cacheKey).maybeSingle();
      if (data?.payload && data.last_fetched && Date.now() - new Date(data.last_fetched).getTime() < TTL_MS) {
        return NextResponse.json({ ...(data.payload as object), cached: true });
      }
    }

    const [dm, comments, crm, revenue, ads] = await Promise.all([
      computeDM(sb).catch((e) => ({ error: String(e) })),
      computeComments(from, to).catch((e) => ({ error: String(e) })),
      computeCRM(from, to).catch((e) => ({ error: String(e) })),
      computeRevenue(from, to).catch((e) => ({ error: String(e) })),
      computeAds(from, to).catch(() => ({ gc: null, samvaya: null })),
    ]);
    const samvaya = await computeSamvaya((ads as { samvaya?: unknown }).samvaya ?? null).catch((e) => ({ error: String(e) }));

    const snapshot = {
      window: { from, to },
      generatedAt: new Date().toISOString(),
      dm,
      comments, // read-only IG Graph: top post + keyword comments (no automation)
      crm,
      revenue,
      ads: (ads as { gc?: unknown }).gc ?? null, // GooCampus ads only (Samvaya excluded)
      samvaya,
      // top_post now delivered via comment analytics; comments_vs_direct still needs inbox (Advanced messaging access)
      gaps: ["comments_vs_direct_strict", "row_level_crm_diff", "speed_to_lead", "world_12thplus_dm_mirror"],
    };
    await sb.from("discover_cache").upsert(
      { cache_key: cacheKey, source: "social_leads_snapshot", last_fetched: new Date().toISOString(), payload: snapshot },
      { onConflict: "cache_key" },
    );
    return NextResponse.json({ ...snapshot, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Social leads snapshot failed"), { status: 502 });
  }
}
