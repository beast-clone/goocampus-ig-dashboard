"use client";
import { useCallback, useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { fmtDateShort, fmtDateTime } from "@/lib/date";

// Social Leads — DM Leads (CRM-sourced) · Meta Ads (Samvaya excluded) · Samvaya.
// Reads the once-a-day cached snapshot from /api/leads/social. Conversions come from
// the Revenue Tracker ("Closed won" ledger), never the under-maintained CRM status.

type SourceAgg = Record<string, { count: number; revenue: number }>;
type Snap = {
  window: { from: string; to: string };
  generatedAt: string;
  cached?: boolean;
  dm: {
    total: { leads: number; interested: number; threads: number; replyRate: number };
    byPage: { page: string; label: string; leads: number; interested: number; threads: number; replyRate: number }[];
    keywords: { keyword: string; n: number }[];
    note?: string;
  };
  comments?: {
    totalComments?: number;
    postsWithComments?: number;
    ownReplies?: number;
    topPosts?: { id: string; permalink: string; caption: string; when: string; comments: number; keywords: string[] }[];
    keywords?: { keyword: string; n: number }[];
    note?: string;
    error?: string;
  };
  crm: { generated: number; dmLeads: number; genBySource: Record<string, number>; byStatus: { name: string; count: number }[]; closedWonStatus: number; dmLeadRows?: { name: string; source: string; status: string; interest: string; when: string }[] };
  revenue: { converted: number; revenue: number; bySource: SourceAgg; byMonth: SourceAgg; adConverted: number; adRevenue: number; dmConverted: number; dmRevenue: number };
  ads: { leads: number; spend: number; costPerLead: number; campaigns: { name: string; leads: number; spend: number; costPerLead: number }[] } | null;
  samvaya: {
    ads: { leads: number; spend: number; costPerLead: number; campaigns: { name: string; leads: number; spend: number; costPerLead: number }[] } | null;
    intake: { total: number; medical: number; nonMedical: number; sentRate: number; byCampaign: Record<string, number> } | { error: string } | null;
    conversion: null;
  };
};

const fmt = (n: number) => (n ?? 0).toLocaleString("en-IN");
const fmtINR = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${Math.round(n || 0).toLocaleString("en-IN")}`);
const fmtWhen = (s: string) => fmtDateShort(s, s || "—");
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  "New": { bg: "#E1F0FB", fg: "#0C447C" },
  "Junk lead": { bg: "#FBE4EC", fg: "#C03221" },
  "Initial discussions": { bg: "#E3F5EA", fg: "#137A3E" },
  "Bookings": { bg: "#FEF3E2", fg: "#B7791F" },
  "Hot lead": { bg: "#FDE7DA", fg: "#C05621" },
  "SQL": { bg: "#EFEBFE", fg: "#6E48F8" },
  "Interested": { bg: "#DBF3EF", fg: "#0E7C6E" },
  "Attempted to contact": { bg: "#F0F2F8", fg: "#5A6273" },
  "Re-Enquiry": { bg: "#E4F4FD", fg: "#0B84C4" },
  "Contract stage": { bg: "#E9ECFB", fg: "#2138B0" },
  "Closed won": { bg: "#CDEED9", fg: "#0F6B36" },
  "Not interested": { bg: "#F0F2F8", fg: "#8A92A6" },
};
const stStyle = (s: string) => { const c = STATUS_STYLE[s] || { bg: "#F0F2F8", fg: "#8A92A6" }; return { background: c.bg, color: c.fg }; };

export default function LeadsPage() {
  return (
    <HopeDashboardShell active="leads" title="Social Leads" subtitle="Inbox DMs & paid leads — a lead counts only when a contact is shared; conversions are real Closed-won." hideAccountPicker hideRange>
      {() => <SocialLeads />}
    </HopeDashboardShell>
  );
}

function SocialLeads() {
  const [tab, setTab] = useState<"dm" | "ads" | "samvaya">("dm");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (d: number, force = false) => {
    setLoading(true);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    try {
      const r = await fetch(`/api/leads/social?from=${from}&to=${to}${force ? "&force=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j as Snap);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(days); }, [load, days]);

  const synced = fmtDateTime(data?.generatedAt);

  return (
    <div className="sl">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="sl-top">
        <div className="sl-fresh">
          <span className="sl-dot" /> Synced daily · last: {synced}
          <button className="sl-refresh" onClick={() => load(days, true)} disabled={loading}>↻ Refresh</button>
        </div>
        <div className="sl-period">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}d</button>
          ))}
        </div>
      </div>

      <div className="sl-tabs">
        <button className={`sl-tab ${tab === "dm" ? "on" : ""}`} onClick={() => setTab("dm")}>DM Leads {data && <span className="n">{fmt(data.crm?.dmLeads)}</span>}</button>
        <button className={`sl-tab ${tab === "ads" ? "on" : ""}`} onClick={() => setTab("ads")}>Meta Ads Leads {data?.ads && <span className="n">{fmt(data.ads.leads)}</span>}</button>
        <button className={`sl-tab ${tab === "samvaya" ? "on" : ""}`} onClick={() => setTab("samvaya")}>Samvaya {data?.samvaya && <span className="n">{fmt((data.samvaya.intake as { total?: number })?.total || 0)}</span>}</button>
      </div>

      {err && <div className="sl-err">Couldn’t load: {err} <button onClick={() => load(days, true)}>Retry</button></div>}
      {loading && !data && <div className="sl-loading">Loading snapshot…</div>}

      {data && tab === "dm" && <DMTab d={data} />}
      {data && tab === "ads" && <AdsTab d={data} />}
      {data && tab === "samvaya" && <SamvayaTab d={data} />}
    </div>
  );
}

/* ---------------- DM ---------------- */
function DMTab({ d }: { d: Snap }) {
  const dmLeads = d.crm?.dmLeads || 0;
  const won = d.revenue?.dmConverted || 0;
  const rev = d.revenue?.dmRevenue || 0;
  const convRate = dmLeads ? Math.round((won / dmLeads) * 1000) / 10 : 0;
  const topKw = Math.max(1, ...(d.dm?.keywords || []).map((k) => k.n));
  const leadRows = d.crm?.dmLeadRows || [];
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const statusList = Object.entries(leadRows.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const shown = statusFilter ? leadRows.filter((r) => r.status === statusFilter) : leadRows;
  return (
    <>
      <div className="sl-kpis">
        <Kpi accent lbl="DM Leads · contact shared" val={fmt(dmLeads)} foot="from CRM (IG/FB DMs + DM Booking)" />
        <Kpi lbl="Converted · Closed won" val={fmt(won)} foot={`${convRate}% of DM leads`} />
        <Kpi lbl="Revenue (won)" val={rev > 0 ? fmtINR(rev) : "—"} foot={rev > 0 ? "from Revenue Tracker" : "amounts pending this month"} />
        <Kpi lbl="Reply rate · @goocampus" val={`${d.dm?.total?.replyRate ?? 0}%`} foot="inbox auto-replies" />
      </div>

      <div className="sl-cols">
        <div className="sl-stack">
          <div className="sl-card pad">
            <H ic="◫" t="Where DM leads come from" />
            <div className="sl-note" style={{ marginTop: 0, color: "var(--ink-soft)" }}>
              The <b style={{ color: "var(--ink)" }}>{fmt(dmLeads)}</b> DM leads are counted from your <b>CRM</b> (lead source = “Instagram/Facebook DMs” + “DM Booking”) — each one is a real lead who shared a contact. A per-page split (Edu · 12thplus · World) will appear here once those Instagram inboxes are connected to the dashboard mirror. Today only <b>@goocampus</b> is partly connected ({d.dm?.total?.threads ?? 0} threads).
            </div>
          </div>

          <div className="sl-card pad">
            <H ic="#" t="Top keywords" hint="in DMs" />
            {(d.dm?.keywords || []).length === 0 ? <div className="sl-empty">No keyword hits in the mirrored inbox yet.</div> : (
              <div className="sl-bars">
                {(d.dm?.keywords || []).map((k) => (
                  <div key={k.keyword} className="br">
                    <div className="brhead"><span>{k.keyword}</span><b>{k.n}</b></div>
                    <div className="track"><div className="fill" style={{ width: `${(k.n / topKw) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sl-card pad">
            <H ic="☰" t="Leads · contact shared" hint={`${fmt(dmLeads)} total`} />
            <div className="sl-filters">
              <button className={`fpill ${!statusFilter ? "on" : ""}`} onClick={() => setStatusFilter(null)}>All <span>{fmt(leadRows.length)}</span></button>
              {statusList.map(([st, ct]) => (
                <button key={st} className={`fpill ${statusFilter === st ? "on" : ""}`} style={stStyle(st)} onClick={() => setStatusFilter(statusFilter === st ? null : st)}>{st} <span>{fmt(ct)}</span></button>
              ))}
            </div>
            <div className="sl-tblscroll">
              <table className="sl-tbl">
                <thead><tr><th>Person</th><th>Source</th><th>Interest</th><th>Status</th><th>When</th></tr></thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i}>
                      <td className="strong">{r.name}</td>
                      <td><span className={`chip ${r.source.includes("Booking") ? "cm" : "dm"}`}>{r.source.includes("Booking") ? "◎ DM Booking" : "✉ IG/FB DM"}</span></td>
                      <td>{r.interest}</td>
                      <td><span className="schip" style={stStyle(r.status)}>{r.status}</span></td>
                      <td className="num">{fmtWhen(r.when)}</td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>No leads in this group.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="sl-note">{statusFilter ? <>Showing <b>{fmt(shown.length)}</b> “{statusFilter}” of {fmt(leadRows.length)}</> : <>Showing all {fmt(leadRows.length)} · scroll for more</>} · all are in the CRM. The <b>evidence snippet</b> (the DM where they shared their contact) appears once the inbox mirror connects.</div>
          </div>

          {(() => {
            const c = d.comments;
            const cErr = !c || !!c.error;
            const topPosts = c?.topPosts || [];
            const cKw = c?.keywords || [];
            const topCKw = Math.max(1, ...cKw.map((k) => k.n));
            return (
              <div className="sl-card pad">
                <H ic="◎" t="Comments → leads · Top posts" hint={cErr ? "unavailable" : `${fmt(c?.totalComments || 0)} prospect comments`} />
                {cErr ? (
                  <div className="sl-empty">Couldn’t read Instagram comments{c?.error ? ` — ${c.error}` : ""}.</div>
                ) : topPosts.length === 0 ? (
                  <div className="sl-empty">No prospect comments in this period (your own CTA replies are excluded).</div>
                ) : (
                  <>
                    <div className="cposts">
                      {topPosts.map((p, i) => (
                        <a key={p.id} className="cpost" href={p.permalink} target="_blank" rel="noreferrer">
                          <span className="cpost-rank">{i + 1}</span>
                          <span className="cpost-body">
                            <span className="cpost-cap">{p.caption || "(no caption)"}</span>
                            <span className="cpost-meta">
                              <span className="cpost-date">{fmtWhen(p.when)}</span>
                              {p.keywords.map((k) => <span key={k} className="chip dm">{k}</span>)}
                            </span>
                          </span>
                          <span className="cpost-n"><b>{fmt(p.comments)}</b><small>comments</small></span>
                        </a>
                      ))}
                    </div>
                    {cKw.length > 0 && (
                      <>
                        <div className="sl-subh">Keywords in comments</div>
                        <div className="sl-bars">
                          {cKw.map((k) => (
                            <div key={k.keyword} className="br">
                              <div className="brhead"><span>{k.keyword}</span><b>{k.n}</b></div>
                              <div className="track"><div className="fill" style={{ width: `${(k.n / topCKw) * 100}%` }} /></div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="sl-note">Live from Instagram (read-only) · {fmt(c?.postsWithComments || 0)} posts with prospect comments · {fmt(c?.ownReplies || 0)} own CTA replies excluded. <b>Comment-vs-direct-DM split</b> needs inbox read access (Meta Advanced messaging) — in progress.</div>
                  </>
                )}
              </div>
            );
          })()}

        </div>
        <AIRail lines={[
          `${fmt(dmLeads)} DM leads this period; ${won} already Closed won.`,
          d.dm?.total?.replyRate ? `Reply rate ${d.dm.total.replyRate}% on @goocampus — automations are firing.` : "",
          (d.dm?.keywords || [])[0] ? `Top hook: ${d.dm.keywords[0].keyword} (${d.dm.keywords[0].n}).` : "",
          (d.comments?.totalComments || 0) > 0 ? `${fmt(d.comments!.totalComments!)} prospect comments across posts; top post drew ${d.comments!.topPosts?.[0]?.comments ?? 0}.` : "",
          (d.comments?.keywords || [])[0] ? `Most-commented keyword: ${d.comments!.keywords![0].keyword} (${d.comments!.keywords![0].n}).` : "",
          "Start the World & 12thplus inbox mirrors to see their DM detail here.",
        ]} />
      </div>
    </>
  );
}

/* ---------------- ADS ---------------- */
function AdsTab({ d }: { d: Snap }) {
  const ads = d.ads;
  const won = d.revenue?.adConverted || 0;
  const rev = d.revenue?.adRevenue || 0;
  if (!ads) return <div className="sl-empty">No ad account connected.</div>;
  const cpc = won ? Math.round(ads.spend / won) : 0;
  return (
    <>
      <div className="sl-kpis">
        <Kpi accent lbl="Paid leads · Samvaya excluded" val={fmt(ads.leads)} foot={`${fmtINR(ads.spend)} spend`} />
        <Kpi lbl="Converted · Closed won" val={fmt(won)} foot="Revenue Tracker · Digital Marketing" />
        <Kpi lbl="Cost / lead" val={fmtINR(ads.costPerLead)} foot="raw" />
        <Kpi warn lbl="Cost / conversion" val={won ? fmtINR(cpc) : "—"} foot={rev > 0 ? `ROI ${(rev / ads.spend).toFixed(1)}×` : "revenue pending this month"} />
      </div>
      <div className="sl-cols">
        <div className="sl-stack">
          <div className="sl-card">
            <div className="pad" style={{ paddingBottom: 4 }}><H ic="☰" t="By campaign" hint="Meta lead forms" /></div>
            <div className="sl-tblwrap">
              <table className="sl-tbl">
                <thead><tr><th>Campaign</th><th>Leads</th><th>Spend</th><th>Cost/lead</th></tr></thead>
                <tbody>
                  {ads.campaigns.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td className="num strong">{fmt(c.leads)}</td><td className="num">{fmtINR(c.spend)}</td><td className="num">{c.leads ? fmtINR(c.costPerLead) : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sl-note">Samvaya campaigns are excluded here — see the <b>Samvaya</b> tab.</div>
          </div>
        </div>
        <AIRail lines={[
          `${fmt(ads.leads)} paid leads for ${fmtINR(ads.spend)} (₹${ads.costPerLead}/lead).`,
          won ? `${won} closed won so far → cost/conversion ${fmtINR(cpc)}.` : "No ad-sourced closings recorded this month yet.",
          ads.campaigns[0] ? `Top volume: ${ads.campaigns[0].name} (${fmt(ads.campaigns[0].leads)}).` : "",
          "Cost/conversion is the real ROI — watch it, not cost/lead.",
        ]} />
      </div>
    </>
  );
}

/* ---------------- SAMVAYA ---------------- */
function SamvayaTab({ d }: { d: Snap }) {
  const ads = d.samvaya?.ads;
  const intake = d.samvaya?.intake as { total: number; medical: number; nonMedical: number; sentRate: number; byCampaign: Record<string, number>; error?: string } | null;
  const hasIntake = !!intake && !("error" in intake);
  return (
    <>
      <div className="sl-note" style={{ marginBottom: 14 }}>Samvaya Matrimony — kept separate from GooCampus. Lead-gen only for now, so <b>conversion isn’t tracked yet</b>.</div>
      <div className="sl-kpis">
        <Kpi accent lbl="Intake leads" val={hasIntake ? fmt(intake!.total) : "—"} foot={hasIntake ? `${intake!.sentRate}% WhatsApp/email sent` : "base not readable"} />
        <Kpi lbl="Ad leads" val={ads ? fmt(ads.leads) : "—"} foot={ads ? `${fmtINR(ads.spend)} spend` : ""} />
        <Kpi lbl="Medical" val={hasIntake ? fmt(intake!.medical) : "—"} foot="doctors / dentists / healthcare" />
        <Kpi lbl="Non-medical" val={hasIntake ? fmt(intake!.nonMedical) : "—"} foot="other professions" />
      </div>
      <div className="sl-cols">
        <div className="sl-stack">
          {hasIntake && (
            <div className="sl-card pad">
              <H ic="◈" t="Intake by campaign" hint={`${fmt(intake!.total)} leads`} />
              <div className="sl-bars">
                {Object.entries(intake!.byCampaign).sort((a, b) => b[1] - a[1]).map(([name, n]) => {
                  const top = Math.max(...Object.values(intake!.byCampaign));
                  return (
                    <div key={name} className="br"><div className="brhead"><span>{name}</span><b>{fmt(n)}</b></div><div className="track"><div className="fill" style={{ width: `${(n / top) * 100}%` }} /></div></div>
                  );
                })}
              </div>
            </div>
          )}
          {ads && (
            <div className="sl-card">
              <div className="pad" style={{ paddingBottom: 4 }}><H ic="☰" t="Samvaya ad campaigns" hint="Meta lead forms" /></div>
              <div className="sl-tblwrap">
                <table className="sl-tbl">
                  <thead><tr><th>Campaign</th><th>Leads</th><th>Spend</th><th>Cost/lead</th></tr></thead>
                  <tbody>
                    {ads.campaigns.map((c) => (
                      <tr key={c.name}><td>{c.name}</td><td className="num strong">{fmt(c.leads)}</td><td className="num">{fmtINR(c.spend)}</td><td className="num">{c.leads ? fmtINR(c.costPerLead) : "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <AIRail lines={[
          hasIntake ? `${fmt(intake!.total)} intake leads · ${intake!.medical} medical vs ${intake!.nonMedical} non-medical.` : "Intake base not readable (token access).",
          hasIntake ? `${intake!.sentRate}% got their WhatsApp/email nurture.` : "",
          ads ? `Ads brought ${fmt(ads.leads)} leads for ${fmtINR(ads.spend)}.` : "",
          "Conversion/revenue tracking = a future Samvaya CRM step.",
        ]} />
      </div>
    </>
  );
}

/* ---------------- shared bits ---------------- */
function Kpi({ lbl, val, foot, accent, warn }: { lbl: string; val: string; foot?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`sl-kpi ${accent ? "accent" : ""} ${warn ? "warn" : ""}`}>
      <div className="lbl">{lbl}</div>
      <div className="val">{val}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}
function H({ ic, t, hint }: { ic?: string; t: string; hint?: string }) {
  return <div className="sl-h">{ic && <span className="ic">{ic}</span>}<h3>{t}</h3>{hint && <span className="hint">{hint}</span>}</div>;
}
function AIRail({ lines }: { lines: string[] }) {
  return (
    <aside>
      <div className="sl-ai">
        <div className="aih"><span className="spark">✦</span><h3>AI Summary</h3><span className="tag">Daily</span></div>
        {lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </aside>
  );
}

const CSS = `
.sl{--brand:#3A57E8;--brand-soft:#E9ECFB;--brand-ink:#2138B0;--ink:#232D42;--ink-soft:#4A5468;--muted:#8A92A6;--faint:#A6ACBE;--line:#EEF0F4;--line2:#F3F5F9;--panel:#FFF;--panel2:#F7F8FC;--good:#1AA053;--rose:#D6336C;--rose-soft:#FBE4EC;font-size:14.5px}
.sl *{box-sizing:border-box}
.sl h3{margin:0}
.sl-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.sl-fresh{font-size:.76rem;color:var(--muted);display:flex;align-items:center;gap:.5rem}
.sl-dot{width:7px;height:7px;border-radius:50%;background:var(--good)}
.sl-refresh{font:inherit;font-size:.74rem;font-weight:500;color:var(--brand-ink);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:.28rem .55rem;cursor:pointer;margin-left:.3rem}
.sl-period{display:flex;gap:.3rem;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.26rem}
.sl-period button{font:inherit;font-size:.78rem;border:0;background:none;color:var(--muted);padding:.32rem .6rem;border-radius:7px;cursor:pointer}
.sl-period button.on{background:var(--brand);color:#fff;font-weight:500}
.sl-tabs{display:flex;gap:.35rem;border-bottom:1px solid var(--line);margin-bottom:1.1rem}
.sl-tab{font:inherit;font-size:.92rem;font-weight:500;border:0;background:none;color:var(--muted);padding:.7rem 1rem;cursor:pointer;position:relative;display:flex;align-items:center;gap:.5rem}
.sl-tab .n{font-size:.72rem;font-weight:600;background:var(--panel2);color:var(--ink-soft);border-radius:20px;padding:.05rem .5rem}
.sl-tab.on{color:var(--brand-ink)}
.sl-tab.on .n{background:var(--brand-soft);color:var(--brand-ink)}
.sl-tab.on::after{content:"";position:absolute;left:.6rem;right:.6rem;bottom:-1px;height:2px;background:var(--brand);border-radius:2px}
.sl-loading,.sl-empty{padding:2rem;text-align:center;color:var(--muted);font-size:.86rem}
.sl-err{background:var(--rose-soft);color:var(--rose);border-radius:10px;padding:.7rem 1rem;font-size:.84rem;margin-bottom:1rem}
.sl-err button{margin-left:.5rem;font:inherit;font-weight:600;color:var(--rose);background:none;border:0;cursor:pointer;text-decoration:underline}
.sl-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1rem}
@media(max-width:760px){.sl-kpis{grid-template-columns:repeat(2,1fr)}}
.sl-kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem 1.05rem}
.sl-kpi.accent{border-left:3px solid var(--brand)}
.sl-kpi.warn{border-left:3px solid var(--rose)}
.sl-kpi .lbl{color:var(--muted);font-size:.71rem;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.sl-kpi .val{font-size:1.85rem;font-weight:600;letter-spacing:-.02em;margin-top:.3rem;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}
.sl-kpi .foot{color:var(--muted);font-size:.75rem;margin-top:.42rem}
.sl-cols{display:grid;grid-template-columns:1fr 300px;gap:1rem;align-items:start}
@media(max-width:900px){.sl-cols{grid-template-columns:1fr}}
.sl-stack{display:flex;flex-direction:column;gap:1rem;min-width:0}
.sl-card{background:var(--panel);border:1px solid var(--line);border-radius:14px}
.sl-card.pad{padding:1.05rem 1.1rem}
.sl-h{display:flex;align-items:center;gap:.55rem;margin-bottom:.85rem}
.sl-h .ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);flex:0 0 28px;font-size:.85rem}
.sl-h h3{font-size:.85rem;font-weight:600;color:var(--ink)}
.sl-h .hint{color:var(--faint);font-size:.71rem;margin-left:auto}
.sl-note{font-size:.75rem;color:var(--faint);margin-top:.7rem;line-height:1.5}
.sl-pagegrid{display:grid;grid-template-columns:repeat(2,1fr);gap:.7rem}
.sl-pagecell{border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem}
.sl-pagecell .k{font-size:.78rem;color:var(--ink-soft);font-weight:500}
.sl-pagecell .v{font-size:1.1rem;font-weight:600;color:var(--ink);margin-top:.2rem}
.sl-pagecell .v.muted{font-size:.78rem;font-weight:500;color:var(--faint)}
.sl-pagecell .v .s{font-size:.68rem;color:var(--muted);font-weight:400}
.sl-bars{display:flex;flex-direction:column;gap:.65rem}
.sl-bars .br .brhead{display:flex;justify-content:space-between;font-size:.8rem;color:var(--ink-soft)}
.sl-bars .br .brhead b{color:var(--ink);font-variant-numeric:tabular-nums}
.sl-bars .track{height:7px;border-radius:20px;background:var(--panel2);overflow:hidden;margin-top:.25rem}
.sl-bars .fill{height:100%;border-radius:20px;background:var(--brand)}
.sl-tblwrap{overflow-x:auto}
.sl-tbl{width:100%;border-collapse:collapse;font-size:.83rem}
.sl-tbl th{text-align:left;color:var(--muted);font-weight:600;font-size:.67rem;text-transform:uppercase;letter-spacing:.04em;padding:.5rem .8rem;border-bottom:1px solid var(--line)}
.sl-tbl td{padding:.55rem .8rem;border-bottom:1px solid var(--line2);color:var(--ink-soft)}
.sl-tbl tr:last-child td{border-bottom:0}
.sl-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
.sl-tbl td.strong{color:var(--ink);font-weight:600}
.sl-tbl .chip{font-size:.68rem;font-weight:600;padding:.16rem .5rem;border-radius:20px;white-space:nowrap;display:inline-block}
.sl-tbl .chip.dm{background:var(--brand-soft);color:var(--brand-ink)}
.sl-tbl .chip.cm{background:#EFEBFE;color:#6E48F8}
.cposts{display:flex;flex-direction:column;gap:.4rem;margin:.15rem 0 .35rem}
.cpost{display:flex;align-items:center;gap:.7rem;padding:.55rem .6rem;border:1px solid var(--line);border-radius:10px;text-decoration:none;transition:background .12s}
.cpost:hover{background:var(--panel2)}
.cpost-rank{flex:none;width:22px;height:22px;border-radius:6px;background:var(--brand-soft);color:var(--brand-ink);font-size:.74rem;font-weight:700;display:flex;align-items:center;justify-content:center}
.cpost-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:.22rem}
.cpost-cap{font-size:.82rem;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpost-meta{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}
.cpost-date{font-size:.72rem;color:var(--muted)}
.cpost-meta .chip{font-size:.66rem;font-weight:600;padding:.1rem .45rem;border-radius:20px;white-space:nowrap}
.cpost-meta .chip.dm{background:var(--brand-soft);color:var(--brand-ink)}
.cpost-n{flex:none;text-align:right;display:flex;flex-direction:column;line-height:1.05}
.cpost-n b{font-size:1rem;color:var(--ink);font-variant-numeric:tabular-nums}
.cpost-n small{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.sl-subh{font-size:.72rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:.85rem 0 .5rem}
.sl-tbl .schip{font-size:.7rem;font-weight:600;padding:.16rem .55rem;border-radius:20px;white-space:nowrap;display:inline-block}
.sl-filters{display:flex;flex-wrap:wrap;gap:.4rem;margin:.1rem 0 .85rem}
.fpill{font:inherit;font-size:.73rem;font-weight:600;border:1px solid var(--line);background:var(--panel);color:var(--ink-soft);border-radius:20px;padding:.28rem .62rem;cursor:pointer;display:inline-flex;gap:.4rem;align-items:center}
.fpill span{font-weight:700;opacity:.65}
.fpill.on{box-shadow:0 0 0 2px var(--brand) inset}
.sl-tblscroll{max-height:430px;overflow:auto;border:1px solid var(--line);border-radius:10px}
.sl-tblscroll .sl-tbl th{position:sticky;top:0;background:var(--panel2);z-index:1}
.sl-tblscroll .sl-tbl td,.sl-tblscroll .sl-tbl th{padding-left:.9rem}
.sl-ai{background:linear-gradient(180deg,var(--brand-soft),var(--panel) 42%);border:1px solid var(--line);border-radius:14px;padding:1rem 1.05rem;position:sticky;top:1rem}
.sl-ai .aih{display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem}
.sl-ai .spark{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--brand);color:#fff}
.sl-ai h3{font-size:.88rem;font-weight:600;color:var(--ink)}
.sl-ai .tag{margin-left:auto;font-size:.55rem;letter-spacing:.07em;text-transform:uppercase;color:var(--brand-ink);background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:.2em .45em;font-weight:700}
.sl-ai p{font-size:.81rem;color:var(--ink-soft);margin:.5rem 0;line-height:1.5}
`;
