"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconSearch, IconUsers, IconTag, IconHelpCircle, IconLayoutGrid, IconSpeakerphone, IconMessageCircle, IconBrandYoutube, IconWorld, IconCalendarEvent, IconDots, IconCurrencyRupee, IconHeartHandshake, IconPlus, IconExternalLink, IconListDetails, IconChartBar, IconSparkles, IconX, type Icon } from "@tabler/icons-react";
import { addBrand } from "@/lib/use-sbus";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { CHANNELS, type ChannelKey, TALKING, brandFor, channelOf, interestKey, isBlankInterest, isWarm, leadBrands } from "@/lib/lead-brand";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { fmtDateShort } from "@/lib/date";

// Marketing Leads (docs/MARKETING_LEADS_SPEC.md). Every CRM lead in the range, grouped by
// brand automatically from its Primary Interest; channel is a filter. Leads come live from
// /api/leads-crm/counsellor (same data + "contacted" rule as Sales Hub). Ad spend and Samvaya
// are not CRM leads — they keep their views, read from the daily /api/leads/social snapshot.

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
    <PreviewDashboardShell active="leads" title="Marketing Leads" subtitle="Every marketing lead, grouped by brand automatically — ads, DMs, YouTube and the website. Contacted uses the same rule as Sales Hub." hideAccountPicker hideRange>
      {() => <MarketingLeads />}
    </PreviewDashboardShell>
  );
}

/* ---------------- Marketing Leads (docs/MARKETING_LEADS_SPEC.md · prototype v3) ---------------- */
type Lead = { id: string; name: string; source: string; status: string; interest: string; campaign: string; createdAt: string; daysUntouched: number | null; linkToRecord: string; counsellor: string; callAttempts: number; contacted: boolean };
type Picked = { kind: "brand"; brand: string } | { kind: "view"; view: "ads" | "samvaya" };
const ALL = "__all", NONE = "__none";
const INK = "text-[#232D42]", MUTED = "text-[#8A92A6]";
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const chan = (k: ChannelKey) => CHANNELS.find((c) => c.key === k)!;
// Left-list icons — Tabler outline on a soft tint, like Scheduler's Status list.
const CH_ICON: Record<ChannelKey, Icon> = { ads: IconSpeakerphone, dm: IconMessageCircle, yt: IconBrandYoutube, web: IconWorld, book: IconCalendarEvent, other: IconDots };
const BRAND_TONE = "#3A57E8";

function MarketingLeads() {
  const [days, setDays] = useState<number | "custom">(30);
  const today = ymd(new Date());
  const [cFrom, setCFrom] = useState(ymd(new Date(Date.now() - 30 * 86_400_000)));
  const [cTo, setCTo] = useState(today);
  const from = days === "custom" ? cFrom : ymd(new Date(Date.now() - days * 86_400_000));
  const to = days === "custom" ? cTo : today;

  const [brands, setBrands] = useState<string[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);   // ad spend + Samvaya — the daily snapshot, loaded on demand

  const [picked, setPicked] = useState<Picked>({ kind: "brand", brand: ALL });
  const [ch, setCh] = useState<ChannelKey | "all">("all");
  const [contactF, setContactF] = useState<"all" | "no" | "yes">("all");
  const [q, setQ] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sbus").then((r) => r.json()).then((d) => setBrands(leadBrands(d.sbus || []))).catch(() => {});
    fetch("/api/leads/brand-matches").then((r) => r.json()).then((d) => setMatches(d.matches || {})).catch(() => {});
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => setIsAdmin(!!d?.user?.isAdmin)).catch(() => {});
  }, []);
  const load = useCallback(async () => {
    setLeads(null); setErr(null); setSnap(null);
    try {
      const r = await fetch(`/api/leads-crm/counsellor?name=all&from=${from}&to=${to}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setLeads(j.leads || []);
    } catch (e) { setErr((e as Error).message); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (picked.kind !== "view" || snap) return;
    fetch(`/api/leads/social?from=${from}&to=${to}`).then((r) => r.json()).then((d) => setSnap(d as Snap)).catch(() => {});
  }, [picked, snap, from, to]);

  const rows = useMemo(() => (leads || []).map((l) => ({ ...l, ch: channelOf(l.source), brand: brandFor(l.interest, brands, matches) })), [leads, brands, matches]);
  type Row = (typeof rows)[number];
  const inBrand = (l: Row) => picked.kind === "brand" && (picked.brand === ALL || (picked.brand === NONE ? !l.brand : l.brand === picked.brand));
  const inCh = (l: Row) => ch === "all" || l.ch === ch;
  const notC = (ls: Row[]) => ls.filter((l) => !l.contacted).length;

  // Left list: brands (counts follow the channel), then channels (counts follow the brand).
  const byBrand = new Map<string, Row[]>();
  for (const l of rows.filter(inCh)) { const k = l.brand ?? NONE; byBrand.set(k, [...(byBrand.get(k) || []), l]); }
  const brandList = [...byBrand.entries()].filter(([k]) => k !== NONE).sort((a, b) => b[1].length - a[1].length);
  const quiet = brands.filter((b) => !byBrand.has(b));
  const inSelBrand = picked.kind === "brand" ? rows.filter(inBrand) : [];
  const sel = inSelBrand.filter(inCh);
  const cN = sel.filter((l) => l.contacted).length;
  const title = picked.kind === "view" ? (picked.view === "ads" ? "Ad campaigns" : "Samvaya") : picked.brand === ALL ? "All leads" : picked.brand === NONE ? "No brand yet" : picked.brand;
  const shown = sel
    .filter((l) => (contactF === "all" || (contactF === "yes") === l.contacted) && (!q || `${l.name} ${l.status} ${l.counsellor} ${l.interest}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const lead = leadId ? rows.find((l) => l.id === leadId) : undefined;
  const pick = (p: Picked) => { setPicked(p); setLeadId(null); };

  const [adding, setAdding] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  // Same helper as Marketing Hub's Brand pages — the new brand appears in every brand list.
  const createBrand = async (name: string): Promise<string | null> => {
    setAddErr(null);
    try {
      const saved = await addBrand(name);
      const d = await fetch("/api/sbus", { cache: "no-store" }).then((r) => r.json());
      setBrands(leadBrands(d.sbus || []));
      return saved;
    } catch (e) { setAddErr((e as Error).message); return null; }
  };
  const saveMatch = async (interest: string, brand: string) => {
    const r = await fetch("/api/leads/brand-matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interest, brand }) });
    const j = await r.json();
    if (r.ok) setMatches(j.matches || {}); else alert(j.error || "Couldn't save the match.");
  };
  const dateBox = (v: string, set: (s: string) => void) => (
    <input type="date" value={v} max={today} onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* opens natively */ } }}
      onChange={(e) => e.target.value && set(e.target.value)}
      className={`h-10 border border-gray-100 rounded-lg px-3 text-[14px] ${INK} bg-white cursor-pointer`} />
  );

  return (
    <div className="preview-scope space-y-5">
      {/* period */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex border border-gray-100 rounded-lg overflow-hidden bg-white">
          {([7, 30, 90, "custom"] as const).map((d) => (
            <button key={d} onClick={() => { setDays(d); setLeadId(null); }}
              className={`h-10 px-[18px] text-[14px] font-medium ${days === d ? "bg-brand-light text-brand" : "text-[#4A5468] hover:text-brand"}`}>{d === "custom" ? "Custom" : `${d}d`}</button>
          ))}
        </div>
        {days === "custom" && <span className="inline-flex items-center gap-2">{dateBox(cFrom, (v) => { setCFrom(v); if (v > cTo) setCTo(v); })}<span className={MUTED}>to</span>{dateBox(cTo, (v) => { setCTo(v); if (v < cFrom) setCFrom(v); })}</span>}
        <span className={`ml-auto text-[13px] ${MUTED}`}>{fmtWhen(from)} – {fmtWhen(to)} · by lead created date</span>
      </div>

      {err ? <div className="bg-white border border-gray-100 rounded-2xl px-6 py-10 text-center text-[14px] text-[#8A92A6]">Couldn&apos;t load leads: {err} <button onClick={load} className="text-brand font-medium">Try again</button></div> : (
      <div className="grid gap-5 items-start grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* left — brands, channels, other views */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className={`px-[22px] pt-5 pb-3 text-[17px] font-medium ${INK}`}>Brands</div>
          <div className="px-3 pb-3.5">
            {!leads ? <LoadingBlock /> : (<>
              <NavItem on={picked.kind === "brand" && picked.brand === ALL} onClick={() => pick({ kind: "brand", brand: ALL })} icon={IconUsers} color="#3A57E8"
                name="All leads" sub={notCSub(notC(rows.filter(inCh)))} count={rows.filter(inCh).length} />
              {brandList.map(([b, ls]) => (
                <NavItem key={b} on={picked.kind === "brand" && picked.brand === b} onClick={() => pick({ kind: "brand", brand: b })}
                  icon={IconTag} color={BRAND_TONE} name={b} sub={notCSub(notC(ls))} count={ls.length} />
              ))}
              {byBrand.has(NONE) && <NavItem on={picked.kind === "brand" && picked.brand === NONE} onClick={() => pick({ kind: "brand", brand: NONE })} icon={IconHelpCircle} color="#D9861B"
                name="No brand yet" sub={<>interest not matched — fix</>} count={byBrand.get(NONE)!.length} />}
              {quiet.length > 0 && <div className={`text-[12.5px] ${MUTED} px-2.5 pt-2`} title={quiet.join(" · ")}>No leads in this range: {quiet.length} brand{quiet.length > 1 ? "s" : ""}</div>}
              {isAdmin && (adding ? (
                <div className="mx-1 mt-3 p-3 border border-gray-100 rounded-xl">
                  <div className={`text-[12px] ${MUTED} mb-1.5`}>New brand</div>
                  <input autoFocus value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="e.g. Ireland Pathway"
                    onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}
                    className={`h-10 w-full rounded-lg border border-gray-200 px-3 text-[14px] ${INK} outline-none focus:border-brand`} />
                  {addErr && <div className="text-[12.5px] text-[#C0201F] mt-1.5">{addErr}</div>}
                  <div className="flex gap-2 mt-2.5">
                    <button disabled={!newBrand.trim()} onClick={async () => { if (await createBrand(newBrand.trim())) { setNewBrand(""); setAdding(false); } }}
                      className="h-9 flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand text-white text-[13px] font-medium disabled:opacity-50"><IconPlus size={15} stroke={2} />Add brand</button>
                    <button onClick={() => { setAdding(false); setNewBrand(""); setAddErr(null); }} className={`h-9 px-3.5 rounded-lg border border-gray-100 text-[13px] font-medium ${INK}`}>Cancel</button>
                  </div>
                  <div className={`text-[12px] ${MUTED} mt-2 leading-snug`}>Leads move here when their Primary Interest matches the name — or match an interest under No brand yet.</div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className="mx-1 mt-2 w-[calc(100%-8px)] h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-200 text-brand text-[13.5px] font-medium hover:border-brand">
                  <IconPlus size={15} stroke={2} />Add brand
                </button>
              ))}

              {picked.kind === "brand" && (<>
                <div className={`text-[12px] uppercase tracking-wide ${MUTED} px-2.5 pt-5 pb-1.5`}>Channels</div>
                <NavItem on={ch === "all"} onClick={() => { setCh("all"); setLeadId(null); }} icon={IconLayoutGrid} color="#4A5468" name="All channels" count={inSelBrand.length} />
                {CHANNELS.map((c) => { const ls = inSelBrand.filter((l) => l.ch === c.key); return ls.length ? (
                  <NavItem key={c.key} on={ch === c.key} onClick={() => { setCh(c.key); setLeadId(null); }} icon={CH_ICON[c.key]} color={c.color} name={c.label} sub={notCSub(notC(ls))} count={ls.length} />
                ) : null; })}
              </>)}

              <div className={`text-[12px] uppercase tracking-wide ${MUTED} px-2.5 pt-5 pb-1.5`}>More</div>
              <NavItem on={picked.kind === "view" && picked.view === "ads"} onClick={() => pick({ kind: "view", view: "ads" })} icon={IconCurrencyRupee} color="#2138B0" name="Ad campaigns" sub="Meta spend & cost per lead" />
              <NavItem on={picked.kind === "view" && picked.view === "samvaya"} onClick={() => pick({ kind: "view", view: "samvaya" })} icon={IconHeartHandshake} color="#7A5AF8" name="Samvaya" sub="own intake base" />
            </>)}
          </div>
        </div>

        {picked.kind === "view" ? (
          // The two views that aren't CRM leads keep their existing layout.
          <div className="min-w-0 sl"><style dangerouslySetInnerHTML={{ __html: CSS }} />
            {!snap ? <div className="bg-white border border-gray-100 rounded-2xl"><LoadingBlock label="Loading…" /></div>
              : picked.view === "ads" ? <AdsTab d={snap} /> : <SamvayaTab d={snap} />}
          </div>
        ) : (
          <div className="min-w-0 space-y-5">
            {/* the selection: name, numbers, filters */}
            <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className={`text-[20px] font-medium ${INK}`}>{title}</div>
                  <div className={`text-[13px] ${MUTED}`}>{leads ? `${fmt(sel.length)} leads${ch !== "all" ? ` · ${chan(ch).label}` : ""}` : "Loading…"}</div>
                </div>
              </div>
              <SummaryCards sel={sel} title={title} />
            </div>

            {picked.brand === NONE && <Matcher sel={sel} brands={brands} matches={matches} isAdmin={isAdmin} onMatch={saveMatch} onCreate={createBrand} />}

            {/* the leads */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-6 pt-5 pb-4 flex items-center gap-3 flex-wrap">
                <div className={`text-[16px] font-medium ${INK} mr-auto`}>Leads <span className={`text-[13px] font-normal ${MUTED}`}>· newest first · click one for details</span></div>
                <div className="flex items-center gap-2 border border-gray-100 rounded-xl px-3 h-10 w-[260px]">
                  <IconSearch size={16} className="text-[#8A92A6] shrink-0" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, status, counsellor…" className={`flex-1 min-w-0 outline-none text-[14px] ${INK} bg-transparent`} />
                </div>
                <div className="inline-flex border border-gray-100 rounded-lg overflow-hidden">
                  {([["all", "All", sel.length], ["no", "Not yet", sel.length - cN], ["yes", "Contacted", cN]] as const).map(([k, lbl, n]) => (
                    <button key={k} onClick={() => setContactF(k)}
                      className={`h-10 px-4 text-[13.5px] font-medium whitespace-nowrap ${contactF === k ? "bg-brand-light text-brand" : "bg-white text-[#4A5468] hover:text-brand"}`}>
                      {lbl} <span className={`font-normal ${contactF === k ? "" : MUTED}`}>{fmt(n)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-auto border-t border-gray-100" style={{ maxHeight: "max(480px, calc(100vh - 420px))" }}>
                {!leads ? <LoadingBlock /> : shown.length === 0 ? <div className={`py-10 text-center text-[14px] ${MUTED}`}>No leads here.</div> : (
                  <table className="w-full min-w-[600px] text-[14px]">
                    <thead className="sticky top-0 bg-white z-[1]"><tr className={`text-left text-[12.5px] ${MUTED}`}>
                      {["Person", "Status", "Contacted", "Assigned to", "When"].map((h) => <th key={h} className="font-normal px-4 py-3 border-b border-gray-100 whitespace-nowrap">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {shown.map((l) => (
                        <tr key={l.id} onClick={() => setLeadId(l.id)} className="cursor-pointer hover:bg-[#FAFBFD] border-b border-gray-100 last:border-0">
                          <td className="px-4 py-3.5 max-w-[220px]"><div className={`font-medium ${INK} truncate`}>{l.name || "—"}</div><div className={`text-[12.5px] ${MUTED} truncate`}>{l.interest || "No interest set"}</div></td>
                          <td className="px-4 py-3.5"><span className="inline-block text-[12px] font-medium rounded-full px-2.5 py-0.5 leading-snug" style={stStyle(l.status)}>{l.status || "—"}</span></td>
                          <td className="px-4 py-3.5 whitespace-nowrap"><ContactedDot on={l.contacted} /></td>
                          <td className="px-4 py-3.5 text-[#4A5468]">{l.counsellor}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap"><div className="text-[#4A5468]">{fmtWhenTime(l.createdAt)}</div><div className={`text-[12.5px] ${MUTED}`}>{chan(l.ch).short}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className={`grid gap-5 items-start ${ch === "all" ? "lg:grid-cols-2" : ""}`}>
              {ch === "all" && <Sources sel={sel} />}
              <FollowUp sel={sel} />
            </div>
          </div>
        )}
      </div>
      )}

      {lead && (
        <div className="fixed inset-0 z-50 bg-[#232D42]/40 flex items-center justify-center p-4" onClick={() => setLeadId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-auto px-7 py-6" onClick={(e) => e.stopPropagation()}>
            <LeadDetail l={lead} brand={lead.brand} channel={chan(lead.ch).label} onClose={() => setLeadId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

const notCSub = (n: number) => (n ? <><b className="font-medium text-[#C0201F]">{fmt(n)}</b> not contacted</> : <>all contacted</>);

function NavItem({ on, onClick, icon: I, color, name, sub, count }: { on: boolean; onClick: () => void; icon: Icon; color: string; name: string; sub?: ReactNode; count?: number }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 text-left px-2.5 py-[11px] rounded-xl mb-0.5 ${on ? "bg-brand-light" : "hover:bg-[#FAFBFD]"}`}>
      <span className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: `${color}1F`, color }}><I size={18} stroke={1.8} /></span>
      <span className="flex-1 min-w-0">
        <span className={`block truncate text-[14.5px] font-medium ${INK}`}>{name}</span>
        {sub && <span className={`block truncate text-[12.5px] ${MUTED} mt-px`}>{sub}</span>}
      </span>
      {count != null && <span className={`shrink-0 min-w-[32px] h-[26px] px-2 rounded-full grid place-items-center text-[13px] font-medium ${on ? "bg-white text-brand" : "bg-[#F0F2F8] text-[#4A5468]"}`}>{fmt(count)}</span>}
    </button>
  );
}

type SelLead = { contacted: boolean; status: string; counsellor: string; ch: ChannelKey; interest: string };
const ContactedDot = ({ on }: { on: boolean }) => (
  <span className={`inline-flex items-center gap-1.5 font-medium ${on ? "text-[#137A3E]" : MUTED}`}>
    <span className="w-2 h-2 rounded-full" style={{ background: on ? "#1AA053" : "#C6CBD6" }} />{on ? "Contacted" : "Not yet"}
  </span>
);
const CardHead = ({ icon: I, t, sub }: { icon: Icon; t: string; sub?: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="w-9 h-9 rounded-[10px] bg-brand-light text-brand grid place-items-center shrink-0"><I size={18} stroke={1.8} /></span>
    <div><div className={`text-[16px] font-medium ${INK}`}>{t}</div>{sub && <div className={`text-[13px] ${MUTED}`}>{sub}</div>}</div>
  </div>
);

function SummaryCards({ sel, title }: { sel: SelLead[]; title: string }) {
  const cN = sel.filter((l) => l.contacted).length;
  const card = (l: string, v: ReactNode, s: string) => (
    <div className="border border-gray-100 rounded-[14px] px-5 py-4">
      <div className={`text-[13px] ${MUTED}`}>{l}</div><div className={`text-[28px] font-medium ${INK} mt-1 leading-tight`}>{v}</div><div className={`text-[12.5px] ${MUTED} mt-0.5`}>{s}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
      {card("Leads", fmt(sel.length), title)}
      {card("Contacted", `${pctOf(cN, sel.length)}%`, `${fmt(cN)} of ${fmt(sel.length)}`)}
      {card("Not contacted yet", <span className="text-[#C0201F]">{fmt(sel.length - cN)}</span>, "no call, note or status change")}
      {card("Hot & interested", fmt(sel.filter((l) => isWarm(l.status)).length), "Hot lead + Interested")}
    </div>
  );
}

function Sources({ sel }: { sel: SelLead[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
      <CardHead icon={IconLayoutGrid} t="Where they came from" sub="by channel" />
      {sel.length === 0 ? <div className={`text-[14px] ${MUTED}`}>No leads.</div> : (<>
        <div className="flex h-3 rounded-full overflow-hidden bg-[#EEF0F4]">
          {CHANNELS.map((c) => { const n = sel.filter((l) => l.ch === c.key).length; return n ? <i key={c.key} style={{ width: `${(n / sel.length) * 100}%`, background: c.color }} /> : null; })}
        </div>
        <div className="mt-4 space-y-2.5">
          {CHANNELS.map((c) => { const n = sel.filter((l) => l.ch === c.key).length; return n ? (
            <div key={c.key} className="flex items-center gap-2.5 text-[14px]"><i className="w-[10px] h-[10px] rounded-[3px] inline-block" style={{ background: c.color }} /><span className={INK}>{c.label}</span><span className={`ml-auto ${MUTED}`}>{fmt(n)} · {pctOf(n, sel.length)}%</span></div>
          ) : null; })}
        </div>
      </>)}
    </div>
  );
}

function FollowUp({ sel }: { sel: SelLead[] }) {
  const fu = new Map<string, { n: number; c: number; na: number; t: number }>();
  for (const l of sel) {
    const k = l.counsellor || "Unassigned", x = fu.get(k) || { n: 0, c: 0, na: 0, t: 0 };
    x.n++; if (l.contacted) x.c++;
    if (/^attempted to contact$/i.test(l.status)) x.na++; else if (TALKING.has(l.status)) x.t++;
    fu.set(k, x);
  }
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
      <CardHead icon={IconUsers} t="Follow-up by counsellor" sub="share contacted" />
      {[...fu.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, x]) => {
        const p = pctOf(x.c, x.n);
        return (
          <div key={k} className="py-3 border-t border-gray-100 first-of-type:border-t-0">
            <div className="flex items-center"><span className={`text-[14px] font-medium ${INK}`}>{k}</span><span className={`ml-auto text-[14px] font-medium ${INK}`}>{p}% <span className={`text-[11px] font-normal ${MUTED}`}>contacted</span></span></div>
            <div className="h-1.5 rounded-full bg-[#EEF0F4] my-2 overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: `${p}%` }} /></div>
            <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[13px] ${MUTED}`}><span>{x.n} assigned</span><span><b className="font-medium text-[#C0201F]">{x.n - x.c}</b> not contacted</span><span>{x.na} no answer</span><span>{x.t} talking</span></div>
          </div>
        );
      })}
      {sel.length === 0 && <div className={`text-[14px] ${MUTED}`}>No leads.</div>}
    </div>
  );
}

function Matcher({ sel, brands, matches, isAdmin, onMatch, onCreate }: {
  sel: SelLead[]; brands: string[]; matches: Record<string, string>; isAdmin: boolean;
  onMatch: (interest: string, brand: string) => void; onCreate: (name: string) => Promise<string | null>;
}) {
  const um = new Map<string, number>();
  for (const l of sel) um.set(l.interest || "", (um.get(l.interest || "") || 0) + 1);
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
      <CardHead icon={IconHelpCircle} t="Match these interests to a brand"
        sub={isAdmin ? "Pick once — every lead with that interest moves there, now and in future. Not in the list? Add a new brand from the picker." : "An admin can match these to a brand."} />
      {[...um.entries()].sort((a, b) => b[1] - a[1]).map(([i, n]) => {
        const k = interestKey(i);
        return (
          <div key={i} className="flex items-center gap-4 py-3 border-t border-gray-100 text-[14px]">
            <span className={`flex-1 min-w-0 truncate ${INK}`}>{i || "(blank)"}</span><span className={`${MUTED} w-16 text-right`}>{fmt(n)} lead{n === 1 ? "" : "s"}</span>
            <span className="w-[240px] shrink-0">{isBlankInterest(k) ? <span className={`text-[13px] ${MUTED}`}>no interest — fix in CRM</span>
              : isAdmin ? <PreviewSelect value={matches[k] || ""} onChange={(b) => onMatch(i, b)} placeholder="Choose a brand…" ariaLabel={`Brand for ${i}`}
                  options={[{ value: "", label: "Choose a brand…" }, ...brands.map((b) => ({ value: b, label: b }))]}
                  addOption={{ label: "Add a new brand", onAdd: async (name) => { const b = await onCreate(name); if (b) onMatch(i, b); } }} />
              : <span className={`text-[13px] ${MUTED}`}>not matched</span>}</span>
          </div>
        );
      })}
    </div>
  );
}

function LeadDetail({ l, brand, channel, onClose }: { l: Lead; brand: string | null; channel: string; onClose: () => void }) {
  const row = (k: string, v: ReactNode) => <><span className={MUTED}>{k}</span><div className={INK}>{v}</div></>;
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className={`text-[22px] font-medium ${INK}`}>{l.name || "—"}</div>
          <div className={`${MUTED} text-[13px] mt-0.5`}>{fmtWhenTime(l.createdAt)} · {channel}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className={`w-9 h-9 rounded-lg grid place-items-center ${MUTED} hover:bg-[#F6F7FB]`}><IconX size={18} stroke={1.8} /></button>
      </div>
      <div className="grid grid-cols-[150px_1fr] gap-x-[18px] gap-y-4 text-[14px] mt-5">
        {row("Status", <span className="inline-block text-[12px] font-medium rounded-full px-2.5 py-0.5 whitespace-nowrap" style={stStyle(l.status)}>{l.status || "—"}</span>)}
        {row("Contacted", <><ContactedDot on={l.contacted} />{l.callAttempts ? <span className={MUTED}> · {l.callAttempts} call{l.callAttempts > 1 ? "s" : ""}</span> : null}</>)}
        {row("Assigned to", l.counsellor)}
        {row("Brand", brand || "No brand yet")}
        {row("Primary Interest", l.interest || "—")}
        {row("Source (CRM)", l.source || "—")}
        {row("Campaign", l.campaign || "—")}
        {row("Idle", l.daysUntouched != null ? `${l.daysUntouched} day${l.daysUntouched === 1 ? "" : "s"} since last update` : "—")}
      </div>
      {l.linkToRecord && <a href={l.linkToRecord} target="_blank" rel="noreferrer" className="mt-6 h-10 px-4 rounded-lg bg-brand text-white text-[14px] font-medium inline-flex items-center gap-1.5">Open in CRM<IconExternalLink size={15} stroke={1.8} /></a>}
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
            <div className="pad" style={{ paddingBottom: 4 }}><H ic={IconListDetails} t="By campaign" hint="Meta lead forms" /></div>
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
              <H ic={IconChartBar} t="Intake by campaign" hint={`${fmt(intake!.total)} leads`} />
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
              <div className="pad" style={{ paddingBottom: 4 }}><H ic={IconListDetails} t="Samvaya ad campaigns" hint="Meta lead forms" /></div>
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
function H({ ic: I, t, hint }: { ic?: Icon; t: string; hint?: string }) {
  return <div className="sl-h">{I && <span className="ic"><I size={16} stroke={1.8} /></span>}<h3>{t}</h3>{hint && <span className="hint">{hint}</span>}</div>;
}
function AIRail({ lines }: { lines: string[] }) {
  return (
    <aside>
      <div className="sl-ai">
        <div className="aih"><span className="spark"><IconSparkles size={15} stroke={1.8} /></span><h3>AI Summary</h3><span className="tag">Daily</span></div>
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
