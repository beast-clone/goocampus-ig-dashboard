const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type AdAccountConfig = {
  id: string;
  name: string;
  token: string;
};

export function getAdAccount(): AdAccountConfig | null {
  const id = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_LONG_LIVED_USER_TOKEN;
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
};

async function gget<T = unknown>(p: string, token: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${p}?${qs}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `Graph error: ${res.status}`);
  return json;
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

export async function fetchCampaigns(acct: AdAccountConfig, from: string, to: string): Promise<CampaignRow[]> {
  const json = await gget<{ data: (Parameters<typeof mapInsightsRow>[0] & { campaign_id: string; campaign_name: string })[] }>(`${acct.id}/insights`, acct.token, {
    fields: `campaign_id,campaign_name,${INSIGHTS_FIELDS}`,
    time_range: JSON.stringify({ since: from, until: to }),
    level: "campaign",
    limit: "200",
  });
  return (json.data || [])
    .map((r) => ({
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      ...mapInsightsRow(r),
    }))
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
        const c = await gget<{ creative?: { thumbnail_url?: string; body?: string; title?: string; effective_object_story_id?: string } }>(
          r.ad_id, acct.token, { fields: "creative{thumbnail_url,body,title,effective_object_story_id}" }
        );
        return {
          thumb: c.creative?.thumbnail_url || null,
          body: c.creative?.body || null,
          title: c.creative?.title || null,
          permalink: c.creative?.effective_object_story_id
            ? `https://www.facebook.com/${c.creative.effective_object_story_id}`
            : null,
        };
      } catch {
        return { thumb: null, body: null, title: null, permalink: null };
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
    ...mapInsightsRow(r),
  })).sort((a, b) => b.spend - a.spend);
}
