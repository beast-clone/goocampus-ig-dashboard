"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";

type AdsTotals = {
  spend: number; impressions: number; reach: number; clicks: number;
  cpm: number; cpc: number; ctr: number; frequency: number;
  leads: number; messagingStarted: number; purchases: number;
  linkClicks: number; postEngagement: number;
  costPerLead: number; costPerMessage: number; costPerPurchase: number;
  roas: number;
};

type Campaign = AdsTotals & { campaign_id: string; campaign_name: string };
type Ad = AdsTotals & {
  ad_id: string; ad_name: string; adset_id: string; adset_name: string;
  creative_thumbnail: string | null; creative_body: string | null;
  creative_title: string | null; permalink: string | null;
};

type DaySummary = { date: string; spend: number; reach: number; impressions: number; leads: number };
type DayAd = { ad_id: string; ad_name: string; spend: number; reach: number; impressions: number; cpm: number; ctr: number; leads: number };

type AdsData = {
  account: { id: string; name: string };
  totals: AdsTotals;
  series: { date: string; spend: number; impressions: number; reach: number; clicks: number; cpm: number; ctr: number; leads: number }[];
  campaigns: Campaign[];
  daySummary?: DaySummary;
  activeAds?: DayAd[];
};

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtNum(n: number) {
  return n.toLocaleString("en-IN");
}

function fmtDay(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

export default function AdsPage() {
  return (
    <DashboardShell title="Ads">
      {({ range }) => <Ads range={range} />}
    </DashboardShell>
  );
}

function Ads({ range }: { range: { from: string; to: string } }) {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    const t0 = Date.now();
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    fetch(`/api/ads?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          setFetchedAt(Date.now());
          setLatencyMs(Date.now() - t0);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />;

  if (loading && !data) return <>{live}<div className="text-sm text-gray-500">Loading ads data…</div></>;
  if (error) return <>{live}<div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">Error: {error}</div></>;
  if (!data) return <>{live}<div className="text-sm text-gray-500">No data.</div></>;

  const hasLeads = data.totals.leads > 0;
  const hasMessages = data.totals.messagingStarted > 0;
  const hasPurchases = data.totals.purchases > 0;

  return (
    <>
      {live}
      <div className="mb-4 text-xs text-gray-500">
        Ad account: <span className="font-medium text-gray-700">{data.account.name}</span> ({data.account.id})
      </div>

      {/* Daily spend summary (yesterday) — matches Meta's notification */}
      {data.daySummary && <DailySpend summary={data.daySummary} ads={data.activeAds || []} />}

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Spend" value={fmtINR(data.totals.spend)} />
        <MetricCard label="Impressions" value={fmtNum(data.totals.impressions)} />
        <MetricCard label="Reach" value={fmtNum(data.totals.reach)} />
        <MetricCard label="Link Clicks" value={fmtNum(data.totals.linkClicks || data.totals.clicks)} />
      </div>

      {/* Conversion KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {hasLeads && <MetricCard label="Leads" value={fmtNum(data.totals.leads)} />}
        {hasLeads && <MetricCard label="Cost / Lead" value={fmtINR(data.totals.costPerLead)} />}
        {hasMessages && <MetricCard label="Messages Started" value={fmtNum(data.totals.messagingStarted)} />}
        {hasMessages && <MetricCard label="Cost / Message" value={fmtINR(data.totals.costPerMessage)} />}
        {hasPurchases && <MetricCard label="Purchases" value={fmtNum(data.totals.purchases)} />}
        {hasPurchases && <MetricCard label="ROAS" value={data.totals.roas.toFixed(2) + "x"} />}
        {!hasLeads && !hasMessages && !hasPurchases && (
          <div className="md:col-span-4 text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No conversion data — campaigns may not have Pixel/Lead-form tracking configured for this range.
          </div>
        )}
      </div>

      {/* Cost & engagement KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="CPM" value={fmtINR(data.totals.cpm)} />
        <MetricCard label="CPC" value={fmtINR(data.totals.cpc)} />
        <MetricCard label="CTR" value={data.totals.ctr.toFixed(2) + "%"} />
        <MetricCard label="Frequency" value={data.totals.frequency.toFixed(2)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <TrendChart title="Spend over time" data={data.series} dataKey="spend" />
        {hasLeads ? (
          <TrendChart title="Leads over time" data={data.series} dataKey="leads" />
        ) : (
          <TrendChart title="Impressions over time" data={data.series} dataKey="impressions" />
        )}
        <TrendChart title="Reach over time" data={data.series} dataKey="reach" />
        <TrendChart title="Clicks over time" data={data.series} dataKey="clicks" />
      </div>

      <CampaignsTable
        campaigns={data.campaigns}
        onSelect={(c) => setSelectedCampaign(c)}
        showLeads={hasLeads}
      />

      {selectedCampaign && (
        <CampaignDrilldown
          campaign={selectedCampaign}
          range={range}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </>
  );
}

function DailySpend({ summary, ads }: { summary: DaySummary; ads: DayAd[] }) {
  const topSpend = ads.length > 0 ? ads[0].spend : 0;
  // Split ads into two equal columns: first half on the left, second half on the right.
  const mid = Math.ceil(ads.length / 2);
  const left = ads.slice(0, mid);
  const right = ads.slice(mid);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
      {/* Compact headline strip — mirrors the Meta daily-summary notification */}
      <div className="px-5 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="text-xs uppercase tracking-wide opacity-80 mr-2">
          Daily summary · {fmtDay(summary.date)}
        </div>
        <div>
          <span className="text-lg font-bold">{fmtINR(summary.spend)}</span>
          <span className="text-xs opacity-80 ml-1">spent</span>
        </div>
        <div>
          <span className="text-lg font-bold">{fmtNum(summary.reach)}</span>
          <span className="text-xs opacity-80 ml-1">reached</span>
        </div>
        {summary.leads > 0 && (
          <div>
            <span className="text-lg font-bold">{fmtNum(summary.leads)}</span>
            <span className="text-xs opacity-80 ml-1">leads</span>
          </div>
        )}
      </div>

      <div className="px-5 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-600">
        Active ads spending yesterday ({ads.length})
      </div>

      {ads.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-gray-400">No ads spent yesterday.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-gray-100">
          <AdColumn ads={left} topSpend={topSpend} />
          <AdColumn ads={right} topSpend={topSpend} />
        </div>
      )}
    </div>
  );
}

function AdColumn({ ads, topSpend }: { ads: DayAd[]; topSpend: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {ads.map((ad) => (
        <div key={ad.ad_id} className="px-4 py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-900 truncate" title={ad.ad_name}>
              {ad.ad_name}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {fmtNum(ad.reach)} reached · {ad.ctr.toFixed(2)}% CTR
              {ad.leads > 0 && <> · {fmtNum(ad.leads)} leads</>}
            </div>
            <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full"
                style={{ width: topSpend > 0 ? `${(ad.spend / topSpend) * 100}%` : "0%" }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-semibold text-gray-900">{fmtINR(ad.spend)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Auto-classify each campaign into a "primary interest" bucket based on keywords in
// its name. Order matters — the FIRST matching rule wins, so put more-specific rules
// higher. Tweak this table when you launch a new campaign theme.
type InterestKey = "amc_australia" | "university_masters" | "mbbs_ug" | "walk_in" | "als" | "samvaya" | "traffic_boost" | "other";
type InterestDef = { key: InterestKey; label: string; emoji: string; color: string; keywords: (string | RegExp)[] };

const INTERESTS: InterestDef[] = [
  { key: "amc_australia",       label: "Australia AMC Pathway",    emoji: "🇦🇺", color: "bg-red-500",     keywords: ["AMC", "AUS-PGCP", "AHPRA", /\bAustralia\b/i] },
  { key: "university_masters",  label: "University / Masters",     emoji: "🎓", color: "bg-violet-500",   keywords: ["University Programs", "Masters", "Post-Graduate", /\bPG\b/] },
  { key: "mbbs_ug",             label: "MBBS / Undergrad",         emoji: "📚", color: "bg-blue-500",     keywords: ["MBBS", /\bUG\b/, "Study Abroad"] },
  { key: "walk_in",             label: "Walk-in / Events",         emoji: "📍", color: "bg-amber-500",    keywords: ["Walk-in", "Walk in", "State-wise"] },
  { key: "als",                 label: "ALS Certification",        emoji: "❤️", color: "bg-rose-500",     keywords: ["ALS"] },
  { key: "samvaya",             label: "Samvaya Matrimony",        emoji: "💍", color: "bg-pink-500",     keywords: ["Samvaya", "Matrimony"] },
  { key: "traffic_boost",       label: "Traffic / Boosted Posts",  emoji: "📣", color: "bg-teal-500",     keywords: ["Traffic Ads", "Instagram post:", "Boosted"] },
];

function classifyCampaign(name: string): InterestDef {
  for (const def of INTERESTS) {
    for (const kw of def.keywords) {
      const matched = typeof kw === "string" ? name.toLowerCase().includes(kw.toLowerCase()) : kw.test(name);
      if (matched) return def;
    }
  }
  return { key: "other", label: "Other / Unclassified", emoji: "❓", color: "bg-gray-400", keywords: [] };
}

function CampaignsTable({ campaigns, onSelect, showLeads }: { campaigns: Campaign[]; onSelect: (c: Campaign) => void; showLeads: boolean }) {
  // Top performer overall = lowest cost-per-lead if leads exist, else highest CTR
  const topId = campaigns.length > 0 ? campaigns
    .filter((c) => showLeads ? c.leads > 0 : c.impressions > 1000)
    .sort((a, b) => showLeads ? a.costPerLead - b.costPerLead : b.ctr - a.ctr)[0]?.campaign_id : null;

  // Group campaigns by primary interest, then sort groups by total spend (biggest first)
  const groups = new Map<string, { def: InterestDef; campaigns: Campaign[] }>();
  for (const c of campaigns) {
    const def = classifyCampaign(c.campaign_name);
    const g = groups.get(def.key);
    if (g) g.campaigns.push(c);
    else groups.set(def.key, { def, campaigns: [c] });
  }
  const orderedGroups = Array.from(groups.values())
    .map((g) => ({
      ...g,
      totals: g.campaigns.reduce(
        (acc, c) => ({
          spend: acc.spend + c.spend,
          impressions: acc.impressions + c.impressions,
          leads: acc.leads + c.leads,
          reach: acc.reach + c.reach,
        }),
        { spend: 0, impressions: 0, leads: 0, reach: 0 },
      ),
    }))
    .sort((a, b) => b.totals.spend - a.totals.spend);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="text-sm font-medium">
          Campaigns by primary interest
          <span className="text-gray-400 font-normal"> ({orderedGroups.length} groups · {campaigns.length} campaigns)</span>
        </div>
        <div className="text-xs text-gray-500">Click a row to see its ads</div>
      </div>
      <div className="divide-y divide-gray-100">
        {orderedGroups.map((g) => (
          <InterestGroup
            key={g.def.key}
            def={g.def}
            totals={g.totals}
            campaigns={g.campaigns}
            topId={topId}
            onSelect={onSelect}
            showLeads={showLeads}
          />
        ))}
      </div>
    </div>
  );
}

function InterestGroup({
  def, totals, campaigns, topId, onSelect, showLeads,
}: {
  def: InterestDef;
  totals: { spend: number; impressions: number; leads: number; reach: number };
  campaigns: Campaign[];
  topId: string | null;
  onSelect: (c: Campaign) => void;
  showLeads: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  return (
    <div>
      {/* Group header — clickable to collapse */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
        className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer transition"
      >
        <span className={`inline-block w-1.5 h-8 rounded-full ${def.color}`} />
        <div className="text-lg">{def.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{def.label}</div>
          <div className="text-[11px] text-gray-500">{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex items-baseline gap-5 text-xs">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Spend</div>
            <div className="font-semibold text-gray-900">{fmtINR(totals.spend)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Impressions</div>
            <div className="font-semibold text-gray-900">{fmtNum(totals.impressions)}</div>
          </div>
          {showLeads && (
            <>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Leads</div>
                <div className="font-semibold text-gray-900">{totals.leads > 0 ? fmtNum(totals.leads) : "—"}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Cost/Lead</div>
                <div className="font-semibold text-gray-900">{cpl > 0 ? fmtINR(cpl) : "—"}</div>
              </div>
            </>
          )}
          <div className="text-gray-400 pl-2 text-lg select-none">{expanded ? "▾" : "▸"}</div>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto bg-gray-50/50">
          <table className="w-full text-sm">
            <thead className="text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Campaign</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Impressions</th>
                {showLeads && <th className="text-right px-3 py-2 font-medium">Leads</th>}
                {showLeads && <th className="text-right px-3 py-2 font-medium">Cost/Lead</th>}
                <th className="text-right px-3 py-2 font-medium">CPC</th>
                <th className="text-right px-5 py-2 font-medium">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {campaigns.map((c) => (
                <tr
                  key={c.campaign_id}
                  onClick={() => onSelect(c)}
                  className="hover:bg-brand-light cursor-pointer transition"
                >
                  <td className="px-5 py-2.5 max-w-xs truncate" title={c.campaign_name}>
                    {c.campaign_id === topId && <span className="mr-1" title="Top performer">🏆</span>}
                    <span className="text-brand hover:underline">{c.campaign_name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmtINR(c.spend)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(c.impressions)}</td>
                  {showLeads && <td className="px-3 py-2.5 text-right">{c.leads > 0 ? fmtNum(c.leads) : "—"}</td>}
                  {showLeads && <td className="px-3 py-2.5 text-right">{c.costPerLead > 0 ? fmtINR(c.costPerLead) : "—"}</td>}
                  <td className="px-3 py-2.5 text-right">{fmtINR(c.cpc)}</td>
                  <td className="px-5 py-2.5 text-right">{c.ctr.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CampaignDrilldown({ campaign, range, onClose }: { campaign: Campaign; range: { from: string; to: string }; onClose: () => void }) {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    fetch(`/api/ads/campaign/${campaign.campaign_id}?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setAds(d.ads);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [campaign.campaign_id, range]);

  const hasLeads = ads ? ads.some((a) => a.leads > 0) : false;
  const topAdId = ads && ads.length > 0
    ? ads.filter((a) => hasLeads ? a.leads > 0 : a.impressions > 500)
        .sort((a, b) => hasLeads ? a.costPerLead - b.costPerLead : b.ctr - a.ctr)[0]?.ad_id
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-5xl md:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 uppercase">Campaign</div>
            <div className="text-lg font-semibold">{campaign.campaign_name}</div>
            <div className="text-xs text-gray-500 mt-1">
              {fmtINR(campaign.spend)} spend &middot; {fmtNum(campaign.impressions)} impressions
              {campaign.leads > 0 && <> &middot; {fmtNum(campaign.leads)} leads @ {fmtINR(campaign.costPerLead)}</>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl px-2">×</button>
        </div>

        <div className="overflow-y-auto p-6">
          {loading && <div className="text-sm text-gray-500">Loading ads…</div>}
          {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
          {ads && ads.length === 0 && <div className="text-sm text-gray-500">No ads in this range.</div>}
          {ads && ads.length > 0 && (
            <div className="space-y-3">
              {ads.map((ad) => (
                <div
                  key={ad.ad_id}
                  className={`flex gap-4 p-4 border rounded-xl ${ad.ad_id === topAdId ? "border-brand bg-brand-light" : "border-gray-100"}`}
                >
                  {ad.creative_thumbnail ? (
                    <img src={ad.creative_thumbnail} alt="" className="w-24 h-24 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-xs text-gray-400">No preview</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {ad.ad_id === topAdId && <span title="Top performer">🏆</span>}
                      <div className="font-medium truncate" title={ad.ad_name}>{ad.ad_name}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Ad set: {ad.adset_name}</div>
                    {ad.creative_body && <div className="text-xs text-gray-600 mt-1 line-clamp-2">{ad.creative_body}</div>}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs">
                      <Stat label="Spend" value={fmtINR(ad.spend)} />
                      <Stat label="Impressions" value={fmtNum(ad.impressions)} />
                      {hasLeads
                        ? <Stat label="Leads" value={ad.leads > 0 ? fmtNum(ad.leads) : "—"} />
                        : <Stat label="Clicks" value={fmtNum(ad.clicks)} />}
                      {hasLeads
                        ? <Stat label="Cost/Lead" value={ad.costPerLead > 0 ? fmtINR(ad.costPerLead) : "—"} />
                        : <Stat label="CPC" value={fmtINR(ad.cpc)} />}
                      <Stat label="CTR" value={ad.ctr.toFixed(2) + "%"} />
                    </div>
                    {ad.permalink && (
                      <a href={ad.permalink} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline mt-2 inline-block">
                        Open ad on Facebook ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-gray-400 uppercase tracking-wide" style={{ fontSize: 10 }}>{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
}
