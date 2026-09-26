"use client";
import { useEffect, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/LoadingBlock";
import { LI_PAGE, YT_CHANNEL } from "@/lib/brand-platforms";

/**
 * Executive overview — every channel, and what the spend returned, on one screen.
 *
 * The platform tabs each answer "how is Instagram doing". Nobody was answering "is
 * the marketing working", which needs the channels, the ad spend and the leads in the
 * same view. This reads the six APIs the individual tabs already use and puts their
 * headlines together; it owns no data of its own.
 *
 * Section order is Manya's: channels, paid against organic, what needs a decision,
 * then the business totals as the closing summary.
 *
 * Two rules it sticks to, because an executive view that quietly rounds off the
 * awkward parts is worse than none:
 *   · a number the API doesn't return is shown as missing, never as zero
 *   · reach, impressions and views are never added into one figure — they measure
 *     different things, and a single blended total would mean nothing
 */

type Range = { from: string; to: string };

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const fmt = (v: number | null, dash = "—") =>
  v == null ? dash : v.toLocaleString("en-IN");
/** Indian grouping, no paise — ₹1,32,437 reads faster than ₹132,437.03. */
const rupee = (v: number | null) =>
  v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (v: number | null, dp = 1) => (v == null ? "—" : `${v.toFixed(dp)}%`);
const hhmm = (sec: number | null) => {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
};

type Chan = {
  key: "youtube" | "instagram" | "linkedin" | "facebook";
  name: string; account: string; colour: string; badge: string; href: string;
  audience: number | null;
  rows: { k: string; v: React.ReactNode }[];
};

export function ExecutiveOverview({ range, rangeLabel, accountId }: { range: Range; rangeLabel: string; accountId: string }) {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  // Every call is scoped to the brand the page's switcher is on. Without accountId
  // these fell back to the default account, so the executive block quietly reported a
  // different Instagram from the detailed section directly beneath it.
  const urls = useMemo(() => {
    const win = `from=${range.from}&to=${range.to}`;
    const li = LI_PAGE[accountId], yt = YT_CHANNEL[accountId];
    return {
      ig: `/api/insights?accountId=${encodeURIComponent(accountId)}&${win}`,
      fb: `/api/facebook?account=${encodeURIComponent(accountId)}&${win}`,
      li: li ? `/api/linkedin?page=${encodeURIComponent(li)}&${win}` : null,
      yt: yt ? `/api/youtube?channel=${encodeURIComponent(yt)}&${win}` : null,
    };
  }, [accountId, range.from, range.to]);

  useEffect(() => {
    let alive = true;
    setD(null); setFailed([]);
    const one = async (name: string, url: string) => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return [name, null] as const;
        return [name, await r.json()] as const;
      } catch { return [name, null] as const; }
    };
    Promise.all([
      one("ig", urls.ig),
      one("fb", urls.fb),
      // A brand with no LinkedIn page or YouTube channel simply has nothing to fetch;
      // that is not a failure and shouldn't be reported as one.
      urls.li ? one("li", urls.li) : Promise.resolve(["li", null] as const),
      urls.yt ? one("yt", urls.yt) : Promise.resolve(["yt", null] as const),
      one("ads", `/api/ads`),
      one("leads", `/api/leads`),
    ]).then((pairs) => {
      if (!alive) return;
      const out: Record<string, unknown> = {};
      const bad: string[] = [];
      const unconnected = new Set([!urls.li && "li", !urls.yt && "yt"].filter(Boolean) as string[]);
      for (const [k, v] of pairs) { out[k] = v; if (v == null && !unconnected.has(k)) bad.push(k); }
      setD(out); setFailed(bad);
    });
    return () => { alive = false; };
  }, [urls]);

  if (!d) return <div className="exo"><LoadingBlock /></div>;

  /* ── pull the headline figures, defensively ─────────────────────────── */
  const ig = (d.ig || {}) as Record<string, Record<string, number>>;
  const fb = (d.fb || {}) as Record<string, Record<string, unknown>>;
  const li = (d.li || {}) as Record<string, Record<string, number>>;
  const yt = (d.yt || {}) as Record<string, Record<string, number>>;
  const ads = ((d.ads as Record<string, unknown>)?.totals || {}) as Record<string, number>;
  const leads = ((d.leads as Record<string, unknown>)?.totals || {}) as Record<string, number>;

  const igT = ig.totals || {}, igD = ig.deltas || {};
  const liS = li.summary || {}, ytS = yt.summary || {};
  const fbIns = (fb.insights || {}) as Record<string, number | boolean | null>;
  // page.followers is the page's actual follower count. insights.follows counts follow
  // ACTIONS in the window and runs ~30× higher — reading it as the audience made
  // Facebook look like the biggest channel when it is the smallest.
  const fbFollowers = num((fb.page as Record<string, unknown>)?.followers);
  const fbCountry = ((fb.audience as Record<string, unknown>)?.countries as { code: string; pct: number }[] | undefined)?.[0];

  const channels: Chan[] = [
    {
      key: "youtube", name: "YouTube", account: String((yt.channel as unknown as Record<string, string>)?.title || "—"),
      colour: "#FF0033", badge: "YT", href: "/dashboard/preview/youtube",
      audience: num(ytS.subscribers),
      rows: [
        { k: "Subscribers", v: <>{fmt(num(ytS.subscribers))} <Delta abs={num(ytS.subscriberGain)} /></> },
        { k: "Views", v: fmt(num(ytS.views)) },
        { k: "Watch time", v: <>{fmt(num(ytS.watchHours))} <Small>hours</Small></> },
        { k: "Avg view", v: <>{hhmm(num(ytS.avgViewDurationSec))} <Small>{pct(num(ytS.avgViewPercentage))}</Small></> },
        { k: "Uploads", v: <>{fmt((num(ytS.postedVideos) ?? 0) + (num(ytS.postedShorts) ?? 0))} <Small>{fmt(num(ytS.postedVideos))} long · {fmt(num(ytS.postedShorts))} shorts</Small></> },
      ],
    },
    {
      key: "instagram", name: "Instagram", account: String((ig.account as unknown as Record<string, string>)?.username || "—"),
      colour: "#E1306C", badge: "IG", href: "/dashboard/preview",
      audience: num(igT.followers),
      rows: [
        { k: "Followers", v: <>{fmt(num(igT.followers))} <Delta pctv={num(igD.followers)} /></> },
        { k: "Reach", v: <>{fmt(num(igT.reach))} <Delta pctv={num(igD.reach)} /></> },
        { k: "Engagement", v: <>{fmt(num(igT.engagement))} <Delta pctv={num(igD.engagement)} /></> },
        { k: "Profile visits", v: <>{fmt(num(igT.profileVisits))} <Delta pctv={num(igD.profileVisits)} /></> },
        { k: "New followers", v: <>{fmt(num(igT.newFollowers))} <Small>{num(igT.avgDailyGain) ?? "—"}/day</Small></> },
      ],
    },
    {
      key: "linkedin", name: "LinkedIn", account: String((li.page as unknown as Record<string, string>)?.name || "—"),
      colour: "#0A66C2", badge: "in", href: "/dashboard/preview/linkedin",
      audience: num(liS.followers),
      rows: [
        { k: "Followers", v: <>{fmt(num(liS.followers))} <Delta abs={num(liS.followerGain)} /></> },
        { k: "Impressions", v: <>{fmt(num(liS.impressions))} <Small>{fmt(num(liS.uniqueImpressions))} unique</Small></> },
        { k: "Per post", v: num(liS.impressions) && num(liS.posts) ? <>{fmt(Math.round(num(liS.impressions)! / num(liS.posts)!))} <Small>over {fmt(num(liS.posts))} posts</Small></> : <Missing /> },
        { k: "Engagement rate", v: pct(num(liS.engagementRate)) },
        { k: "Page views", v: fmt(num(liS.pageViews)) },
      ],
    },
    {
      key: "facebook", name: "Facebook", account: String((fb.page as Record<string, unknown>)?.name || "—"),
      colour: "#1877F2", badge: "f", href: "/dashboard/preview/facebook",
      audience: fbFollowers,
      rows: [
        { k: "Followers", v: fmt(fbFollowers) },
        { k: "Engagement", v: <>{fmt(num(fbIns.engagement))} {fbFollowers && num(fbIns.engagement) ? <Small tone="up">{(num(fbIns.engagement)! / fbFollowers).toFixed(1)}× followers</Small> : null}</> },
        { k: "Page views", v: fmt(num(fbIns.pageViews)) },
        { k: "Top country", v: fbCountry ? <>{fbCountry.code} <Small>{pct(fbCountry.pct)}</Small></> : <Missing /> },
        { k: "Reach", v: <Missing label="not reported by the API" /> },
      ],
    },
  ];

  const totalAudience = channels.reduce((s, c) => s + (c.audience ?? 0), 0) || null;

  /* ── paid vs organic ────────────────────────────────────────────────── */
  const paidLeads = num(ads.leads), paidReach = num(ads.reach), spend = num(ads.spend);
  const organicLeads = num(leads.comments);
  const organicReach = [num(igT.reach), num(liS.impressions), num(ytS.views)]
    .reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null);
  const totalLeads = paidLeads != null || organicLeads != null ? (paidLeads ?? 0) + (organicLeads ?? 0) : null;
  const per1k = (l: number | null, r: number | null) => (l != null && r ? (l / r) * 1000 : null);
  const paidPer1k = per1k(paidLeads, paidReach), orgPer1k = per1k(organicLeads, organicReach);
  const cpl = paidLeads && spend != null ? spend / paidLeads : null;
  const blendedCpl = totalLeads && spend != null ? spend / totalLeads : null;

  return (
    <div className="exo" id="executive-overview">
      {failed.length > 0 && (
        <div className="exo-warn">
          Couldn&rsquo;t reach {failed.length === 1 ? "one source" : `${failed.length} sources`} ({failed.join(", ")}).
          Everything below is built from what did load, so some figures are missing rather than wrong.
        </div>
      )}

      {/* ── 1 · CHANNELS ────────────────────────────────────────────── */}
      <SectionTitle>Channels<Em>{totalAudience ? `— ${fmt(totalAudience)} people follow you across four. Open a tab to go deeper.` : "— open a tab to go deeper."}</Em></SectionTitle>
      <div className="exo-chans">
        {channels.map((c) => (
          <div key={c.key} className="exo-chan">
            <div className="exo-chan-top">
              <span className="exo-ic" style={{ background: c.colour }}>{c.badge}</span>
              <div><div className="exo-nm">{c.name}</div><div className="exo-acct">{c.account}</div></div>
              {c.audience && totalAudience ? (
                <span className="exo-share">{Math.round((c.audience / totalAudience) * 100)}% of audience</span>
              ) : null}
            </div>
            <div className="exo-rows">
              {c.rows.map((r) => (
                <div key={r.k} className="exo-row"><span className="exo-k">{r.k}</span><span className="exo-v">{r.v}</span></div>
              ))}
            </div>
            <div className="exo-foot"><a href={c.href}>Open {c.name} →</a></div>
          </div>
        ))}
      </div>
      <p className="exo-note">
        Organic reach below is Instagram reach + LinkedIn impressions + YouTube views. Facebook reach
        returns nothing from the API, so Facebook is not in that figure and the real total is higher
        by an unknown amount.
      </p>

      {/* ── 2 · PAID vs ORGANIC ─────────────────────────────────────── */}
      <SectionTitle>Paid against organic<Em>— where the results actually came from</Em></SectionTitle>
      <div className="exo-vs">
        <table>
          <thead>
            <tr><th>&nbsp;</th><th><i className="sw" style={{ background: "#6E48F8" }} />Paid</th>
            <th><i className="sw" style={{ background: "#1AA053" }} />Organic</th><th>Reading</th></tr>
          </thead>
          <tbody>
            <tr><td>Leads</td><td className="n">{fmt(paidLeads)}</td><td className="n">{fmt(organicLeads)}</td>
              <td>{paidLeads && organicLeads ? <>Paid brings <b>{(paidLeads / organicLeads).toFixed(1)}×</b> the leads</> : "—"}</td></tr>
            <tr><td>Reach</td><td className="n">{fmt(paidReach)}</td><td className="n">{fmt(organicReach)}</td>
              <td>{paidReach && organicReach ? <>Paid reaches <b>{(paidReach / organicReach).toFixed(1)}×</b> as many people</> : "—"}</td></tr>
            <tr><td>Leads per 1,000 reached</td>
              <td className="n">{paidPer1k == null ? "—" : paidPer1k.toFixed(1)}</td>
              <td className={`n ${orgPer1k && paidPer1k && orgPer1k > paidPer1k ? "win" : ""}`}>{orgPer1k == null ? "—" : orgPer1k.toFixed(1)}</td>
              <td>{paidPer1k && orgPer1k ? (orgPer1k > paidPer1k
                ? <>Organic converts <b>{(orgPer1k / paidPer1k).toFixed(1)}×</b> better per person reached</>
                : <>Paid converts <b>{(paidPer1k / orgPer1k).toFixed(1)}×</b> better per person reached</>) : "—"}</td></tr>
            <tr><td>Spend</td><td className="n">{rupee(spend)}</td><td className="n">₹0</td>
              <td>Organic costs time, not budget</td></tr>
          </tbody>
        </table>
      </div>
      <p className="exo-note">
        Paid buys scale; organic converts better on the people it does reach. Ad figures come from the
        ad account&rsquo;s own window, which may not line up exactly with {rangeLabel.toLowerCase()} —
        treat the comparison as close, not exact.
      </p>

      {/* ── 3 · NEEDS A DECISION ────────────────────────────────────── */}
      <SectionTitle>Needs a decision<Em>— the exceptions, not the list</Em></SectionTitle>
      <div className="exo-attn">
        {num(igD.engagement) != null && num(igD.engagement)! < -10 && (
          <div className="exo-card bad">
            <div className="t"><span className="chip bad">Down {Math.abs(num(igD.engagement)!).toFixed(0)}%</span> Instagram engagement is falling</div>
            <div className="dsc">
              {fmt(num(igT.engagement))} engagements
              {num(igD.reach) != null && num(igD.reach)! > 0
                ? <> against a reach that <em>grew</em> {pct(num(igD.reach), 0)}. More people saw the work and fewer reacted.</>
                : <> this period.</>}
            </div>
          </div>
        )}
        <div className="exo-card warn">
          <div className="t"><span className="chip ask">Needs you</span> Is {rupee(cpl)} a good lead?</div>
          <div className="dsc">Set a target cost per lead and what a converted student is worth, and this
            can judge the spend instead of reporting it. Without that, {rupee(spend)} has no verdict.</div>
        </div>
        {fbFollowers && num(fbIns.engagement) && num(fbIns.engagement)! / fbFollowers > 2 && (
          <div className="exo-card good">
            <div className="t"><span className="chip good">Opportunity</span> Facebook punches above its size</div>
            <div className="dsc">{fmt(num(fbIns.engagement))} engagements from {fmt(fbFollowers)} followers —
              the best ratio of any channel, on the smallest audience.</div>
          </div>
        )}
      </div>

      {/* ── 4 · THE BUSINESS ────────────────────────────────────────── */}
      <SectionTitle>The business<Em>— what all of it added up to</Em></SectionTitle>
      <div className="exo-hero">
        <div className="exo-h lead">
          <div className="lbl">Leads generated</div>
          <div className="big">{fmt(totalLeads)}</div>
          <div className="sub">{fmt(paidLeads)} from ads · {fmt(organicLeads)} from comments</div>
          {totalLeads && paidLeads != null ? (
            <>
              <div className="bar">
                <i style={{ background: "#6E48F8", width: `${(paidLeads / totalLeads) * 100}%` }} />
                <i style={{ background: "#1AA053", width: `${((organicLeads ?? 0) / totalLeads) * 100}%` }} />
              </div>
              <div className="lg">
                <span><i style={{ background: "#6E48F8" }} />Paid {Math.round((paidLeads / totalLeads) * 100)}%</span>
                <span><i style={{ background: "#1AA053" }} />Organic {Math.round(((organicLeads ?? 0) / totalLeads) * 100)}%</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="exo-h">
          <div className="lbl">Cost per lead</div>
          <div className="big">{rupee(cpl)}</div>
          <div className="sub">on paid{blendedCpl ? ` · ${rupee(blendedCpl)} blended across both` : ""}</div>
          <div className="lg" style={{ marginTop: 12 }}><span className="chip ask">No target set</span></div>
        </div>

        <div className="exo-h">
          <div className="lbl">Ad spend</div>
          <div className="big">{rupee(spend)}</div>
          <div className="sub">{fmt(num(ads.clicks))} clicks · {pct(num(ads.ctr), 2)} CTR · {rupee(num(ads.cpc))} per click</div>
          <div className="sub" style={{ marginTop: 6 }}>{fmt(num(ads.impressions))} impressions at {rupee(num(ads.cpm))} CPM</div>
        </div>

        <div className="exo-h">
          <div className="lbl">Total reach</div>
          <div className="big">{fmt(paidReach != null || organicReach != null ? (paidReach ?? 0) + (organicReach ?? 0) : null)}</div>
          <div className="sub">{fmt(paidReach)} paid · {fmt(organicReach)} organic</div>
          {paidReach && organicReach ? (
            <>
              <div className="bar">
                <i style={{ background: "#6E48F8", width: `${(paidReach / (paidReach + organicReach)) * 100}%` }} />
                <i style={{ background: "#1AA053", width: `${(organicReach / (paidReach + organicReach)) * 100}%` }} />
              </div>
              <div className="lg">
                <span><i style={{ background: "#6E48F8" }} />Paid {Math.round((paidReach / (paidReach + organicReach)) * 100)}%</span>
                <span><i style={{ background: "#1AA053" }} />Organic {Math.round((organicReach / (paidReach + organicReach)) * 100)}%</span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <style jsx global>{EXO_CSS}</style>
    </div>
  );
}

/* ── small pieces ───────────────────────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="exo-h2">{children}</h2>;
}
function Em({ children }: { children: React.ReactNode }) { return <em>{children}</em>; }
function Small({ children, tone }: { children: React.ReactNode; tone?: "up" | "down" }) {
  return <small className={tone || "flat"}>{children}</small>;
}
function Missing({ label = "no data" }: { label?: string }) {
  return <span className="exo-missing">{label}</span>;
}
/** A change, shown as a percentage or an absolute gain — whichever the API gives. */
function Delta({ pctv, abs }: { pctv?: number | null; abs?: number | null }) {
  if (pctv != null) {
    const up = pctv >= 0;
    return <small className={up ? "up" : "down"}>{up ? "▲" : "▼"} {Math.abs(pctv).toFixed(1)}%</small>;
  }
  if (abs != null) return <small className={abs >= 0 ? "up" : "down"}>{abs >= 0 ? "▲" : "▼"} {Math.abs(abs).toLocaleString("en-IN")}</small>;
  return null;
}

const EXO_CSS = `
.exo{margin:18px 0 6px;scroll-margin-top:80px}
.exo .exo-h2{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
  color:#A6ACBE;margin:26px 0 10px;display:flex;align-items:baseline;gap:9px}
.exo .exo-h2 em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:500;
  font-size:12px;color:#A6ACBE}
.exo-warn{font-size:12.5px;color:#7A4E0B;background:#FEF6F0;border:1px solid #F3DCB4;
  border-radius:10px;padding:9px 13px;margin-bottom:14px}
.exo-note{font-size:12px;color:#A6ACBE;line-height:1.5;margin:11px 0 0}

.exo-chans{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.exo-chan{background:#fff;border:1px solid #EEF0F4;border-radius:12px;display:flex;flex-direction:column}
.exo-chan-top{display:flex;align-items:center;gap:9px;padding:12px 15px;border-bottom:1px solid #F3F5F9}
.exo-ic{width:25px;height:25px;border-radius:7px;display:grid;place-items:center;color:#fff;
  font-size:11px;font-weight:700;flex:none}
.exo-nm{font-weight:600;font-size:14px;color:#232D42}
.exo-acct{font-size:11.5px;color:#8A92A6}
.exo-share{margin-left:auto;font-size:11.5px;font-weight:600;color:#8A92A6;background:#F7F8FC;
  border-radius:6px;padding:2px 7px;white-space:nowrap}
.exo-rows{padding:4px 15px 10px;flex:1}
.exo-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:6px 0;
  border-bottom:1px solid #F3F5F9}
.exo-row:last-child{border-bottom:0}
.exo-k{font-size:12.5px;color:#8A92A6}
.exo-v{font-size:14.5px;font-weight:600;color:#232D42;font-variant-numeric:tabular-nums;text-align:right}
.exo-v small{font-size:11px;font-weight:600;margin-left:5px}
.exo-v .up{color:#1AA053}
.exo-v .down{color:#C0201F}
.exo-v .flat{color:#A6ACBE}
.exo-missing{color:#A6ACBE;font-size:12px;font-weight:500}
.exo-foot{padding:9px 15px;border-top:1px solid #F3F5F9;background:#F7F8FC;border-radius:0 0 12px 12px}
.exo-foot a{color:#3A57E8;font-size:12.5px;font-weight:600;text-decoration:none}
.exo-foot a:hover{text-decoration:underline}

.exo-vs{background:#fff;border:1px solid #EEF0F4;border-radius:12px;overflow-x:auto}
.exo-vs table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px}
.exo-vs th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:#A6ACBE;padding:10px 16px;border-bottom:1px solid #EEF0F4;background:#F7F8FC}
.exo-vs td{padding:10px 16px;border-bottom:1px solid #F3F5F9;color:#232D42;
  font-variant-numeric:tabular-nums}
.exo-vs tr:last-child td{border-bottom:0}
.exo-vs td:first-child{color:#8A92A6;font-variant-numeric:normal}
.exo-vs .n{font-weight:600}
.exo-vs .win{color:#1AA053}
.exo-vs .sw{width:9px;height:9px;border-radius:2px;display:inline-block;margin-right:6px}

.exo-attn{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px}
.exo-card{background:#fff;border:1px solid #EEF0F4;border-radius:12px;padding:13px 15px}
.exo-card.bad{border-color:#F1C4BD;background:#FFF8F7}
.exo-card.warn{border-color:#F3DCB4;background:#FEF9F2}
.exo-card.good{border-color:#BFE6CD;background:#F6FCF8}
.exo-card .t{font-weight:600;font-size:13.5px;color:#232D42;display:flex;align-items:center;
  gap:7px;flex-wrap:wrap}
.exo-card .dsc{font-size:12.5px;color:#4A5468;margin-top:5px;line-height:1.45}
.exo .chip{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  border-radius:5px;padding:2px 6px;flex:none}
.exo .chip.bad{background:#FCEBEA;color:#C0201F}
.exo .chip.good{background:#E3F5EA;color:#1AA053}
.exo .chip.ask{background:#EDE9FE;color:#5B4AC4}

.exo-hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.exo-h{background:#fff;border:1px solid #EEF0F4;border-radius:12px;padding:15px 17px}
.exo-h.lead{background:linear-gradient(180deg,#EEF1FD,#fff);border-color:#D5DCF8}
.exo-h .lbl{font-size:11.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#8A92A6}
.exo-h .big{font-size:30px;font-weight:600;letter-spacing:-.025em;margin:5px 0 1px;
  color:#232D42;font-variant-numeric:tabular-nums}
.exo-h .sub{font-size:12px;color:#A6ACBE;line-height:1.45}
.exo-h .bar{display:flex;gap:2px;margin-top:11px;height:6px;border-radius:3px;overflow:hidden}
.exo-h .bar i{display:block;height:100%}
.exo-h .lg{display:flex;gap:11px;flex-wrap:wrap;margin-top:9px;font-size:11.5px;color:#8A92A6}
.exo-h .lg i{width:7px;height:7px;border-radius:2px;display:inline-block;margin-right:4px}
`;
