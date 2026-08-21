import { fetchWithTimeout } from "./fetch-with-timeout";
import { recordApiCall } from "./api-usage";
import { metaLimiter } from "./concurrency";
import { getIntegrationToken } from "./integration-tokens";
const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type AdAccountConfig = {
  id: string;
  name: string;
  token: string;
};

// Reads the token via getIntegrationToken("meta") so a token rotated through the
// Diagnostics "Reconnect" flow takes effect live (no redeploy); falls back to the env var.
export async function getAdAccount(): Promise<AdAccountConfig | null> {
  const id = process.env.META_AD_ACCOUNT_ID;
  const token = await getIntegrationToken("meta");
  if (!id || !token) return null;
  return { id, name: process.env.META_AD_ACCOUNT_NAME || id, token };
}

type RawAction = { action_type: string; value: string };
type RawCostAction = { action_type: string; value: string };

function extractAction(actions: RawAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((sum, a) => sum + parseFloat(a.value || "0"), 0);
}

function extractCostPerAction(costs: RawCostAction[] | undefined, types: string[]): number {
  if (!costs) return 0;
  const matches = costs.filter((a) => types.includes(a.action_type));
  if (matches.length === 0) return 0;
  return parseFloat(matches[0].value || "0");
}

// Action-type families
const LEAD_TYPES = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
const MESSAGING_TYPES = ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_first_reply"];
const PURCHASE_TYPES = ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"];
const LINK_CLICK_TYPES = ["link_click"];
const POST_ENGAGEMENT_TYPES = ["post_engagement"];

export type AdsTotals = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpm: number;
  cpc: number;
  ctr: number;
  frequency: number;
  leads: number;
  messagingStarted: number;
  purchases: number;
  linkClicks: number;
  postEngagement: number;
  costPerLead: number;
  costPerMessage: number;
  costPerPurchase: number;
  roas: number;
};

const INSIGHTS_FIELDS = "spend,impressions,reach,clicks,cpm,cpc,ctr,frequency,actions,cost_per_action_type,action_values,purchase_roas";

function mapInsightsRow(r: {
  spend?: string; impressions?: string; reach?: string; clicks?: string;
  cpm?: string; cpc?: string; ctr?: string; frequency?: string;
  actions?: RawAction[]; cost_per_action_type?: RawCostAction[];
  action_values?: RawAction[]; purchase_roas?: { value: string }[];
}): AdsTotals {
  const actions = r.actions;
  const costs = r.cost_per_action_type;
  return {
    spend: parseFloat(r.spend || "0"),
    impressions: parseInt(r.impressions || "0", 10),
    reach: parseInt(r.reach || "0", 10),
    clicks: parseInt(r.clicks || "0", 10),
    cpm: parseFloat(r.cpm || "0"),
    cpc: parseFloat(r.cpc || "0"),
    ctr: parseFloat(r.ctr || "0"),
    frequency: parseFloat(r.frequency || "0"),
    leads: extractAction(actions, LEAD_TYPES),
    messagingStarted: extractAction(actions, MESSAGING_TYPES),
    purchases: extractAction(actions, PURCHASE_TYPES),
    linkClicks: extractAction(actions, LINK_CLICK_TYPES),
    postEngagement: extractAction(actions, POST_ENGAGEMENT_TYPES),
    costPerLead: extractCostPerAction(costs, LEAD_TYPES),
    costPerMessage: extractCostPerAction(costs, MESSAGING_TYPES),
    costPerPurchase: extractCostPerAction(costs, PURCHASE_TYPES),
    roas: parseFloat(r.purchase_roas?.[0]?.value || "0"),
  };
}

export type AdsDailyPoint = {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpm: number;
  ctr: number;
  leads: number;
};

export type CampaignRow = AdsTotals & {
  campaign_id: string;
  campaign_name: string;
  // Populated by mergeCampaignBudgets — 0 when budget is set at ad-set level (ABO) rather
  // than campaign level (CBO). The Ads UI treats 0 as "budget unavailable" and skips the bar.
  daily_budget: number;
  lifetime_budget: number;
  status: string;  // ACTIVE | PAUSED | DELETED | ARCHIVED
  // When the campaign began. Needed to judge pacing: spend divided by the whole
  // reporting window makes anything launched mid-window look starved.
  start_time: string | null;
};

export type AdRow = AdsTotals & {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  creative_thumbnail: string | null;
  creative_body: string | null;
  creative_title: string | null;
  permalink: string | null;
  // Flight / config (from the ad's config edge, not insights)
  status: string | null;      // effective_status: ACTIVE / PAUSED / …
  start_time: string | null;  // ad set start (falls back to the ad's created_time)
  end_time: string | null;    // ad set end (null = open-ended / ongoing)
  objective: string | null;   // campaign objective
};

async function gget<T = unknown>(p: string, token: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  // Meta's Ads Insights endpoint intermittently returns code 2 ("Service temporarily
  // unavailable", e.g. subcode 1504044) even for valid requests — Meta's own guidance
  // is to retry. Retry transient errors (code 2 / 5xx) with backoff before giving up.
  let last = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await metaLimiter(() => fetchWithTimeout(`${GRAPH}/${p}?${qs}`, { cache: "no-store" }));
    const json = await res.json();
    const e = json.error;
    recordApiCall("Meta Ads", res.ok && !e, res.status);
    if (res.ok && !e) return json;

    const bits = [e?.code != null ? `code ${e.code}` : "", e?.error_subcode ? `subcode ${e.error_subcode}` : ""].filter(Boolean).join("/");
    const hint = e?.error_user_msg ? ` — ${e.error_user_msg}` : "";
    last = `Meta ads ${p} [${bits || res.status}]: ${e?.message || res.status}${hint}`.slice(0, 190);

    const transient = e?.code === 2 || res.status >= 500 || res.status === 429;
    if (transient && attempt < 2) { await new Promise((r) => setTimeout(r, 700 * (attempt + 1))); continue; }
    break;
  }
  throw new Error(last || `Meta ads ${p}: request failed`);
}

export async function fetchAdsTotals(acct: AdAccountConfig, from: string, to: string): Promise<AdsTotals> {
  const json = await gget<{ data: Parameters<typeof mapInsightsRow>[0][] }>(`${acct.id}/insights`, acct.token, {
    fields: INSIGHTS_FIELDS,
    time_range: JSON.stringify({ since: from, until: to }),
    level: "account",
  });
  return mapInsightsRow(json.data?.[0] || {});
}

export async function fetchAdsDaily(acct: AdAccountConfig, from: string, to: string): Promise<AdsDailyPoint[]> {
  const json = await gget<{ data: (Parameters<typeof mapInsightsRow>[0] & { date_start: string })[] }>(`${acct.id}/insights`, acct.token, {
    fields: "spend,impressions,reach,clicks,cpm,ctr,actions",
    time_range: JSON.stringify({ since: from, until: to }),
    time_increment: "1",
    level: "account",
  });
  return (json.data || []).map((r) => ({
    date: r.date_start,
    spend: parseFloat(r.spend || "0"),
    impressions: parseInt(r.impressions || "0", 10),
    reach: parseInt(r.reach || "0", 10),
    clicks: parseInt(r.clicks || "0", 10),
    cpm: parseFloat(r.cpm || "0"),
    ctr: parseFloat(r.ctr || "0"),
    leads: extractAction(r.actions, LEAD_TYPES),
  }));
}

export type AdBreakdownRow = { key: string; spend: number; impressions: number; reach: number; clicks: number; leads: number };

// Meta insights split by a breakdown dimension (publisher_platform, platform_position,
// age, gender, region…), aggregated by the joined dimension value and sorted by spend.
export async function fetchAdsBreakdown(
  acct: AdAccountConfig, from: string, to: string, breakdowns: string, keyFields: string[],
): Promise<AdBreakdownRow[]> {
  const json = await gget<{ data: Record<string, unknown>[] }>(`${acct.id}/insights`, acct.token, {
    fields: "spend,impressions,reach,clicks,actions",
    time_range: JSON.stringify({ since: from, until: to }),
    breakdowns,
    level: "account",
    limit: "500",
  });
  const map = new Map<string, AdBreakdownRow>();
  for (const r of json.data || []) {
    const key = keyFields.map((f) => String(r[f] ?? "—")).join(" · ") || "—";
    let e = map.get(key);
    if (!e) { e = { key, spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0 }; map.set(key, e); }
    e.spend += parseFloat((r.spend as string) || "0");
    e.impressions += parseInt((r.impressions as string) || "0", 10);
    e.reach += parseInt((r.reach as string) || "0", 10);
    e.clicks += parseInt((r.clicks as string) || "0", 10);
    e.leads += extractAction(r.actions as RawAction[] | undefined, LEAD_TYPES);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend);
}

export async function fetchCampaigns(acct: AdAccountConfig, from: string, to: string): Promise<CampaignRow[]> {
  // Two calls in parallel: performance from /insights, budget/status from /campaigns.
  // Meta requires them separately because /insights doesn't expose configuration fields
  // and /campaigns doesn't expose performance metrics. We merge by campaign_id.
  const [perfJson, cfgJson] = await Promise.all([
    gget<{ data: (Parameters<typeof mapInsightsRow>[0] & { campaign_id: string; campaign_name: string })[] }>(`${acct.id}/insights`, acct.token, {
      fields: `campaign_id,campaign_name,${INSIGHTS_FIELDS}`,
      time_range: JSON.stringify({ since: from, until: to }),
      level: "campaign",
      limit: "200",
    }),
    gget<{ data: { id: string; name: string; daily_budget?: string; lifetime_budget?: string; effective_status?: string; status?: string; start_time?: string }[] }>(`${acct.id}/campaigns`, acct.token, {
      fields: "id,name,daily_budget,lifetime_budget,effective_status,status,start_time",
      limit: "200",
    }),
  ]);

  // Build a budget lookup — Meta returns budgets in the smallest currency unit (paise for INR),
  // so we divide by 100 to get rupees.
  const budgetById = new Map<string, { daily: number; lifetime: number; status: string; start_time: string | null }>();
  for (const c of cfgJson.data || []) {
    budgetById.set(c.id, {
      daily: parseFloat(c.daily_budget || "0") / 100,
      lifetime: parseFloat(c.lifetime_budget || "0") / 100,
      status: c.effective_status || c.status || "UNKNOWN",
      start_time: c.start_time || null,
    });
  }

  // When a campaign has no campaign-level daily budget (i.e. budget lives on its ad sets),
  // sum the ad-set daily_budgets so the dashboard still shows a real number instead of a
  // dash. Fire one adsets call per campaign lazily to avoid a heavy fan-out — cap at 30
  // campaigns to stay well under Meta's rate limit for the range picker's default view.
  const perfList = perfJson.data || [];
  const missingBudgetIds = perfList
    .map((r) => r.campaign_id)
    .filter((id) => (budgetById.get(id)?.daily ?? 0) === 0)
    .slice(0, 30);
  if (missingBudgetIds.length > 0) {
    const results = await Promise.allSettled(missingBudgetIds.map(async (id) => {
      const j = await gget<{ data: { daily_budget?: string }[] }>(`${id}/adsets`, acct.token, {
        fields: "daily_budget",
        limit: "50",
      });
      const total = (j.data || []).reduce((s, x) => s + (parseFloat(x.daily_budget || "0") / 100), 0);
      return { id, total };
    }));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.total > 0) {
        const existing = budgetById.get(r.value.id) || { daily: 0, lifetime: 0, status: "UNKNOWN", start_time: null };
        budgetById.set(r.value.id, { ...existing, daily: r.value.total });
      }
    }
  }

  return perfList
    .map((r) => {
      const budget = budgetById.get(r.campaign_id) || { daily: 0, lifetime: 0, status: "UNKNOWN", start_time: null };
      return {
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        daily_budget: budget.daily,
        lifetime_budget: budget.lifetime,
        status: budget.status,
        start_time: budget.start_time,
        ...mapInsightsRow(r),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

// ---- Daily snapshot (matches the Meta "daily summary" notification) ----
export type DaySummary = { date: string; spend: number; reach: number; impressions: number; leads: number };
export type DayAd = { ad_id: string; ad_name: string; spend: number; reach: number; impressions: number; cpm: number; ctr: number; leads: number };

export async function fetchDaySummary(acct: AdAccountConfig, date: string): Promise<DaySummary> {
  const json = await gget<{ data: { spend?: string; reach?: string; impressions?: string; actions?: RawAction[] }[] }>(
    `${acct.id}/insights`, acct.token,
    { fields: "spend,reach,impressions,actions", time_range: JSON.stringify({ since: date, until: date }), level: "account" },
  );
  const r = json.data?.[0] || {};
  return {
    date,
    spend: parseFloat(r.spend || "0"),
    reach: parseInt(r.reach || "0", 10),
    impressions: parseInt(r.impressions || "0", 10),
    leads: extractAction(r.actions, LEAD_TYPES),
  };
}

// One row per campaign that spent on the given date. Feeds the "Individual campaign spend
// yesterday" section — paired with each campaign's daily_budget to show budget-usage bars.
export type DayCampaignSpend = {
  campaign_id: string; campaign_name: string;
  spend: number; reach: number; impressions: number; leads: number;
};

export async function fetchCampaignSpendForDay(acct: AdAccountConfig, date: string): Promise<DayCampaignSpend[]> {
  const json = await gget<{ data: { campaign_id: string; campaign_name: string; spend?: string; reach?: string; impressions?: string; actions?: RawAction[] }[] }>(
    `${acct.id}/insights`, acct.token,
    {
      fields: "campaign_id,campaign_name,spend,reach,impressions,actions",
      time_range: JSON.stringify({ since: date, until: date }),
      level: "campaign",
      limit: "200",
    },
  );
  return (json.data || [])
    .map((r) => ({
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      spend: parseFloat(r.spend || "0"),
      reach: parseInt(r.reach || "0", 10),
      impressions: parseInt(r.impressions || "0", 10),
      leads: extractAction(r.actions, LEAD_TYPES),
    }))
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

export async function fetchActiveAdsForDay(acct: AdAccountConfig, date: string): Promise<DayAd[]> {
  const json = await gget<{ data: { ad_id: string; ad_name: string; spend?: string; reach?: string; impressions?: string; cpm?: string; ctr?: string; actions?: RawAction[] }[] }>(
    `${acct.id}/insights`, acct.token,
    { fields: "ad_id,ad_name,spend,reach,impressions,cpm,ctr,actions", time_range: JSON.stringify({ since: date, until: date }), level: "ad", limit: "200" },
  );
  return (json.data || [])
    .map((r) => ({
      ad_id: r.ad_id,
      ad_name: r.ad_name,
      spend: parseFloat(r.spend || "0"),
      reach: parseInt(r.reach || "0", 10),
      impressions: parseInt(r.impressions || "0", 10),
      cpm: parseFloat(r.cpm || "0"),
      ctr: parseFloat(r.ctr || "0"),
      leads: extractAction(r.actions, LEAD_TYPES),
    }))
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

export async function fetchAdsForCampaign(acct: AdAccountConfig, campaignId: string, from: string, to: string): Promise<AdRow[]> {
  const json = await gget<{ data: (Parameters<typeof mapInsightsRow>[0] & {
    ad_id: string; ad_name: string; adset_id: string; adset_name: string;
  })[] }>(`${acct.id}/insights`, acct.token, {
    fields: `ad_id,ad_name,adset_id,adset_name,${INSIGHTS_FIELDS}`,
    time_range: JSON.stringify({ since: from, until: to }),
    level: "ad",
    filtering: JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]),
    limit: "200",
  });

  const rows = json.data || [];

  // Fetch creative previews per ad (parallel, capped)
  const previews = await Promise.all(
    rows.map(async (r) => {
      try {
        const c = await gget<{
          creative?: { thumbnail_url?: string; body?: string; title?: string; effective_object_story_id?: string };
          effective_status?: string; created_time?: string;
          adset?: { start_time?: string; end_time?: string };
          campaign?: { objective?: string };
        }>(
          r.ad_id, acct.token,
          { fields: "creative{thumbnail_url,body,title,effective_object_story_id},effective_status,created_time,adset{start_time,end_time},campaign{objective}" }
        );
        return {
          thumb: c.creative?.thumbnail_url || null,
          body: c.creative?.body || null,
          title: c.creative?.title || null,
          permalink: c.creative?.effective_object_story_id
            ? `https://www.facebook.com/${c.creative.effective_object_story_id}`
            : null,
          status: c.effective_status || null,
          start_time: c.adset?.start_time || c.created_time || null,
          end_time: c.adset?.end_time || null,
          objective: c.campaign?.objective || null,
        };
      } catch {
        return { thumb: null, body: null, title: null, permalink: null, status: null, start_time: null, end_time: null, objective: null };
      }
    })
  );

  return rows.map((r, i) => ({
    ad_id: r.ad_id,
    ad_name: r.ad_name,
    adset_id: r.adset_id,
    adset_name: r.adset_name,
    creative_thumbnail: previews[i].thumb,
    creative_body: previews[i].body,
    creative_title: previews[i].title,
    permalink: previews[i].permalink,
    status: previews[i].status,
    start_time: previews[i].start_time,
    end_time: previews[i].end_time,
    objective: previews[i].objective,
    ...mapInsightsRow(r),
  })).sort((a, b) => b.spend - a.spend);
}
