"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useCallback, useEffect, useRef, useState } from "react";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
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
  crm: { generated: number; dmLeads: number; genBySource: Record<string, number>; byStatus: { name: string; count: number }[]; closedWonStatus: number; dmLeadRows?: { name: string; source: string; status: string; interest: string; when: string; contacted?: boolean; calls?: number; counsellor?: string }[] };
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
// "28 Oct, 5:30 pm" in IST — CRM Created Date carries the time.
const fmtWhenTime = (s: string) => { const d = new Date(s); return isNaN(+d) ? (s || "—") : d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }); };
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
// Colours travel as CSS variables so dark mode can derive its own from the same
// fg (see .schip / .fpill in the dark block below) — the light pastels with dark
// text were ~2.5:1 on the dark theme (28 Sep).
const stStyle = (s: string) => { const c = STATUS_STYLE[s] || { bg: "#F0F2F8", fg: "#8A92A6" }; return { "--st-bg": c.bg, "--st-fg": c.fg, background: "var(--st-bg)", color: "var(--st-fg)" } as React.CSSProperties; };

export default function LeadsPage() {
  return (
    <PreviewDashboardShell active="leads" title="Marketing Leads" subtitle="Inbox DMs & paid leads — a lead counts only when a contact is shared; conversions are real Closed-won." hideAccountPicker hideRange>
      {() => <SocialLeads />}
    </PreviewDashboardShell>
  );
}

function SocialLeads() {
  const [tab, setTab] = useState<"dm" | "ads" | "samvaya">("dm");
  const [days, setDays] = useState<number | "custom">(30);
  const today = new Date().toISOString().slice(0, 10);
  const [cFrom, setCFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [cTo, setCTo] = useState(today);
  const [data, setData] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (d: number | "custom", force = false) => {
    setLoading(true);
    const to = d === "custom" ? cTo : new Date().toISOString().slice(0, 10);
    const from = d === "custom" ? cFrom : new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
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
  }, [cFrom, cTo]);
  useEffect(() => { load(days); }, [load, days]);
  // A visible date box; clicking it opens the picker.
  const dateBox = (v: string, set: (s: string) => void) => (
    <input type="date" className="sl-date" value={v} max={today}
      onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* opens natively */ } }}
      onChange={(e) => e.target.value && set(e.target.value)} />
  );

  const synced = fmtDateTime(data?.generatedAt);

  return (
    <div className="sl">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="sl-top">
        <div className="sl-fresh">
          <span className="sl-dot" /> Synced daily · last: {synced}
          <button className="sl-refresh" onClick={() => load(days, true)} disabled={loading}>↻ Refresh</button>
        </div>
        <div className="sl-range">
          {days === "custom" && (
            <span className="sl-custom">
              {dateBox(cFrom, (v) => { setCFrom(v); if (v > cTo) setCTo(v); })}
              <span>to</span>
              {dateBox(cTo, (v) => { setCTo(v); if (v < cFrom) setCFrom(v); })}
            </span>
          )}
          <div className="sl-period">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}d</button>
            ))}
            <button className={days === "custom" ? "on" : ""} onClick={() => setDays("custom")}>Custom</button>
          </div>
        </div>
      </div>

      <div className="sl-tabs">
        <button className={`sl-tab ${tab === "dm" ? "on" : ""}`} onClick={() => setTab("dm")}>DM Leads {data && <span className="n">{fmt(data.crm?.dmLeads)}</span>}</button>
        <button className={`sl-tab ${tab === "ads" ? "on" : ""}`} onClick={() => setTab("ads")}>Meta Ads Leads {data?.ads && <span className="n">{fmt(data.ads.leads)}</span>}</button>
        <button className={`sl-tab ${tab === "samvaya" ? "on" : ""}`} onClick={() => setTab("samvaya")}>Samvaya {data?.samvaya && <span className="n">{fmt((data.samvaya.intake as { total?: number })?.total || 0)}</span>}</button>
      </div>

      {err && <div className="sl-err">Couldn’t load: {err} <button onClick={() => load(days, true)}>Retry</button></div>}
      {loading && !data && <LoadingBlock label="Loading snapshot…" />}

      {data && tab === "dm" && <DMTab d={data} />}
      {data && tab === "ads" && <AdsTab d={data} />}
      {data && tab === "samvaya" && <SamvayaTab d={data} />}
    </div>
  );
}

/* ---------------- DM ---------------- */
// Statuses where the counsellor is in a real conversation — same set as Sales Hub's follow-up card.
const TALKING = new Set(["Initial discussions", "Hot lead", "Interested", "Bookings", "Re-Enquiry", "Future prospect", "Qualified", "Negotiation", "Payment pending", "Closed won"]);

function DMTab({ d }: { d: Snap }) {
  const dmLeads = d.crm?.dmLeads || 0;
  const won = d.revenue?.dmConverted || 0;
  const rev = d.revenue?.dmRevenue || 0;
  const convRate = dmLeads ? Math.round((won / dmLeads) * 1000) / 10 : 0;
  const leadRows = d.crm?.dmLeadRows || [];
  const booked = leadRows.filter((r) => r.source.includes("Booking")).length;
  const statusList = Object.entries(leadRows.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  // Leads still worth chasing — "Hot lead" / "Interested" statuses (not "Not interested").
  const warm = leadRows.filter((r) => /hot|interested/i.test(r.status) && !/not interested/i.test(r.status)).length;

  // Contacted = same rule as Sales Hub (a call, a note, or status left "New").
  const contactedN = leadRows.filter((r) => r.contacted).length;
  const pct = leadRows.length ? Math.round((contactedN / leadRows.length) * 100) : 0;
  const byCounsellor = [...leadRows.reduce((m, l) => {
    const name = l.counsellor || "Unassigned";
    const r = m.get(name) || { name, n: 0, contacted: 0, notYet: 0, noAnswer: 0, talking: 0 };
    r.n++;
    if (l.contacted) r.contacted++; else r.notYet++;
    if (/^attempted to contact$/i.test(l.status)) r.noAnswer++;
    else if (TALKING.has(l.status)) r.talking++;
    return m.set(name, r);
  }, new Map<string, { name: string; n: number; contacted: number; notYet: number; noAnswer: number; talking: number }>()).values()].sort((a, b) => b.n - a.n);
  const sum = byCounsellor.reduce((t, r) => ({ notYet: t.notYet + r.notYet, noAnswer: t.noAnswer + r.noAnswer, talking: t.talking + r.talking }), { notYet: 0, noAnswer: 0, talking: 0 });

  const [contactF, setContactF] = useState<"all" | "yes" | "no">("all");
  const [who, setWho] = useState("");
  const [statusF, setStatusF] = useState("");
  const shown = leadRows.filter((r) => (!statusF || r.status === statusF) && (!who || (r.counsellor || "Unassigned") === who) && (contactF === "all" || (contactF === "yes") === !!r.contacted));
  const tableRef = useRef<HTMLDivElement>(null);
  // Clicking a counsellor opens their not-contacted leads in the table, like Sales Hub.
  const focus = (name: string) => { setWho(name); setContactF("no"); setStatusF(""); tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <>
      <div className="sl-kpis">
        <Kpi accent lbl="DM Leads · contact shared" val={fmt(dmLeads)} foot="from CRM (IG/FB DMs + DM Booking)" />
        <Kpi lbl="Converted · Closed won" val={fmt(won)} foot={`${convRate}% of DM leads`} />
        <Kpi lbl="Revenue (won)" val={rev > 0 ? fmtINR(rev) : "—"} foot={rev > 0 ? "from Revenue Tracker" : "amounts pending this month"} />
        <Kpi lbl="Hot & interested" val={fmt(warm)} foot={leadRows.length ? `${Math.round((warm / leadRows.length) * 100)}% of DM leads` : "from lead statuses"} />
      </div>

      <div className="sl-cols">
        <div className="sl-stack">
          <div className="sl-card pad">
            <H ic="◷" t="DM leads · follow-up" hint="share contacted · follows the selected range" />
            {byCounsellor.length === 0 ? <div className="sl-empty">No DM leads in this range.</div> : (
              <>
                {byCounsellor.map((r) => {
                  const p = Math.round((r.contacted / Math.max(1, r.n)) * 100);
                  return (
                    <button key={r.name} className="sl-fu" onClick={() => focus(r.name)} title={`Show ${r.name}'s leads not contacted yet`}>
                      <span className="sl-fu-top">
                        <span className="sl-fu-av">{r.name.trim().charAt(0).toUpperCase()}</span>
                        <span className="sl-fu-name">{r.name}</span>
                        <span className="sl-fu-pct">{p}%<small>contacted</small></span>
                      </span>
                      <span className="sl-fu-bar"><i style={{ width: `${p}%` }} /></span>
                      <span className="sl-fu-meta">
                        <span>{r.n} assigned</span>
                        <span><b className="red">{r.notYet}</b> not contacted</span>
                        <span><b>{r.noAnswer}</b> no answer</span>
                        <span><b>{r.talking}</b> talking</span>
                      </span>
                    </button>
                  );
                })}
                <div className="sl-tiles">
                  <div className="sl-tile"><b style={{ color: "#C0201F" }}>{sum.notYet}</b><span>not contacted</span></div>
                  <div className="sl-tile"><b style={{ color: "#B7791F" }}>{sum.noAnswer}</b><span>called, no answer</span></div>
                  <div className="sl-tile"><b style={{ color: "#1A8A4A" }}>{sum.talking}</b><span>in conversation</span></div>
                </div>
              </>
            )}
          </div>

          <div className="sl-card pad" ref={tableRef}>
            <H ic="☰" t="Leads · first-contact tracking" hint={`${fmt(contactedN)} of ${fmt(leadRows.length)} contacted · ${pct}%`} />
            <div className="sl-toolbar">
              <div className="sl-seg">
                {([["all", "All"], ["yes", "Contacted"], ["no", "Not yet"]] as const).map(([k, lbl]) => (
                  <button key={k} className={contactF === k ? "on" : ""} onClick={() => setContactF(k)}>{lbl}</button>
                ))}
              </div>
              <PreviewSelect value={who} onChange={setWho} ariaLabel="Counsellor"
                options={[{ value: "", label: "All counsellors" }, ...byCounsellor.map((r) => ({ value: r.name, label: `${r.name} · ${r.n}` }))]} />
              <PreviewSelect value={statusF} onChange={setStatusF} ariaLabel="Status"
                options={[{ value: "", label: "All statuses" }, ...statusList.map(([st, n]) => ({ value: st, label: `${st} · ${n}` }))]} />
            </div>
            <div className="sl-tblscroll">
              <table className="sl-tbl nw">
                <thead><tr><th>Person</th><th>Status</th><th>Contacted</th><th>Assigned to</th><th>Source</th><th>When</th></tr></thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i}>
                      <td className="strong">{r.name}<span className="sub" title={r.interest}>{r.interest}</span></td>
                      <td><span className="schip" style={stStyle(r.status)}>{r.status}</span></td>
                      <td>{r.contacted ? <span className="sl-ct yes"><i />Contacted</span> : <span className="sl-ct no"><i />Not yet</span>}</td>
                      <td>{r.counsellor || "—"}</td>
                      <td><span className={`chip ${r.source.includes("Booking") ? "cm" : "dm"}`}>{r.source.includes("Booking") ? "◎ DM Booking" : "✉ IG/FB DM"}</span></td>
                      <td className="num">{fmtWhenTime(r.when)}</td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>No leads match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="sl-note">Showing <b>{fmt(shown.length)}</b> of {fmt(leadRows.length)} · Contacted = a call was attempted, a note was added, or the status left “New” — the same rule as Sales Hub.</div>
          </div>

          <div className="sl-card pad">
            <H ic="◫" t="Where DM leads come from" />
            <div className="sl-bars">
              {[["✉ Instagram / Facebook DMs", leadRows.length - booked], ["◎ DM Booking", booked]].map(([lbl, n]) => (
                <div key={lbl} className="br">
                  <div className="brhead"><span>{lbl}</span><b>{fmt(n as number)}</b></div>
                  <div className="track"><div className="fill" style={{ width: `${leadRows.length ? ((n as number) / leadRows.length) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="sl-note">Counted from your CRM — each one is a real lead who shared a contact.</div>
          </div>
        </div>
        <AIRail lines={[
          `${fmt(dmLeads)} DM leads this period; ${won} already Closed won.`,
          leadRows.length - contactedN ? `${fmt(leadRows.length - contactedN)} leads not contacted yet (${pct}% contacted).` : "Every lead has been contacted.",
          warm ? `${fmt(warm)} hot or interested leads to follow up.` : "",
          statusList[0] ? `Most leads are “${statusList[0][0]}” (${fmt(statusList[0][1])}).` : "",
          booked ? `${fmt(booked)} came in through DM Booking.` : "",
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
.sl{--brand:#3A57E8;--brand-soft:#E9ECFB;--brand-ink:#2138B0;--brand-rgb:58 87 232;--brand-dark-rgb:33 56 176;--brand-light-rgb:233 236 251;--ink:#232D42;--ink-soft:#4A5468;--muted:#8A92A6;--faint:#A6ACBE;--line:#EEF0F4;--line2:#F3F5F9;--panel:#FFF;--panel2:#F7F8FC;--good:#1AA053;--rose:#D6336C;--rose-soft:#FBE4EC;font-size:14.5px}
.sl *{box-sizing:border-box}
.sl h3{margin:0}
.sl-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.sl-fresh{font-size:.76rem;color:var(--muted);display:flex;align-items:center;gap:.5rem}
.sl-dot{width:7px;height:7px;border-radius:50%;background:var(--good)}
.sl-refresh{font:inherit;font-size:.74rem;font-weight:500;color:var(--brand-ink);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:.28rem .55rem;cursor:pointer;margin-left:.3rem}
.sl-period{display:flex;gap:.3rem;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.26rem}
.sl-period button{font:inherit;font-size:.78rem;border:0;background:none;color:var(--muted);padding:.32rem .6rem;border-radius:7px;cursor:pointer}
.sl-period button.on{background:var(--brand);color:#fff;font-weight:500}
.sl-range{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.sl-custom{display:inline-flex;align-items:center;gap:.4rem;font-size:.78rem;color:var(--muted)}
.sl-date{font:inherit;font-size:.78rem;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:.3rem .55rem;cursor:pointer}
.sl-ct{display:inline-flex;align-items:center;gap:.4rem;font-size:.74rem;font-weight:600;white-space:nowrap}
.sl-ct i{width:7px;height:7px;border-radius:50%;display:inline-block}
.sl-ct.yes{color:#137A3E}.sl-ct.yes i{background:#1AA053}
.sl-ct.no{color:var(--muted)}.sl-ct.no i{background:#C6CBD6}
.sl-fu{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line2);padding:.6rem 0;cursor:pointer;font:inherit}
.sl-fu:last-of-type{border-bottom:0}
.sl-fu-top{display:flex;align-items:center;gap:.5rem}
.sl-fu-av{width:20px;height:20px;border-radius:50%;background:var(--brand-soft);color:var(--brand-ink);font-size:.62rem;font-weight:600;display:grid;place-items:center}
.sl-fu-name{font-size:.82rem;font-weight:600;color:var(--ink)}
.sl-fu:hover .sl-fu-name{color:var(--brand)}
.sl-fu-pct{margin-left:auto;font-size:.88rem;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.sl-fu-pct small{font-size:.68rem;font-weight:400;color:var(--muted);margin-left:.25rem}
.sl-fu-bar{display:block;height:4px;border-radius:4px;background:var(--line);margin:.4rem 0;overflow:hidden}
.sl-fu-bar i{display:block;height:100%;background:var(--brand);border-radius:4px}
.sl-fu-meta{display:flex;flex-wrap:wrap;gap:.2rem .75rem;font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums}
.sl-fu-meta b{font-weight:600;color:var(--ink)}.sl-fu-meta b.red{color:#C0201F}
.sl-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.5rem}
.sl-tile{border-radius:8px;background:var(--panel2);padding:.4rem .65rem}
.sl-tile b{display:block;font-size:.88rem;font-weight:600;font-variant-numeric:tabular-nums}
.sl-tile span{font-size:.7rem;color:var(--muted)}
.sl-toolbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:.1rem 0 .8rem}
.sl-seg{display:inline-flex;gap:.2rem;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.22rem}
.sl-seg button{font:inherit;font-size:.76rem;border:0;background:none;color:var(--muted);padding:.28rem .7rem;border-radius:7px;cursor:pointer}
.sl-seg button.on{background:var(--brand);color:#fff;font-weight:500}
.sl-tbl.nw td,.sl-tbl.nw th{white-space:nowrap}
.sl-tbl .sub{display:block;font-size:.7rem;color:var(--muted);font-weight:400;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.sl-ct small{font-weight:400;color:var(--muted)}
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
.sl-tbl .chip.cm{background:var(--dk-sl-EFEBFE);color:#6E48F8}
.sl-tbl .schip{font-size:.7rem;font-weight:600;padding:.16rem .55rem;border-radius:20px;white-space:nowrap;display:inline-block}
.sl-tblscroll{max-height:430px;overflow:auto;border:1px solid var(--line);border-radius:10px}
.sl-tblscroll .sl-tbl th{position:sticky;top:0;background:var(--panel2);z-index:1}
.sl-tblscroll .sl-tbl td,.sl-tblscroll .sl-tbl th{padding-left:.9rem}
.sl-ai{background:linear-gradient(180deg,var(--brand-soft),var(--panel) 42%);border:1px solid var(--line);border-radius:14px;padding:1rem 1.05rem;position:sticky;top:1rem}
.sl-ai .aih{display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem}
.sl-ai .spark{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--brand);color:#fff}
.sl-ai h3{font-size:.88rem;font-weight:600;color:var(--ink)}
.sl-ai .tag{margin-left:auto;font-size:.55rem;letter-spacing:.07em;text-transform:uppercase;color:var(--brand-ink);background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:.2em .45em;font-weight:700}
.sl-ai p{font-size:.81rem;color:var(--ink-soft);margin:.5rem 0;line-height:1.5}
.sl{--dk-sl-EFEBFE:#EFEBFE;}
html[data-theme="dark"] .sl{--brand-soft:#2C3666;--brand-ink:#93A3FF;--ink:#E8EBF3;--ink-soft:#C2C8D6;--muted:#959DB1;--faint:#858DA1;--line:#2C3246;--line2:#262B3C;--panel:#1F2332;--panel2:#191D2A;--rose-soft:rgba(214,51,108,.18);--dk-panel:#1F2332;--dk-sl-EFEBFE:rgba(83,51,204,.16);}
html[data-theme="dark"] .sl .schip,html[data-theme="dark"] .sl .fpill{background:color-mix(in srgb,var(--st-fg) 22%,#1F2332)!important;color:color-mix(in srgb,var(--st-fg) 45%,#fff)!important}
html[data-theme="dark"] .sl-tbl .chip.cm{color:#B9A6FF}

`;
