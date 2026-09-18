"use client";
import { IconPencil } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { REPORT_HISTORY, type HistoryTable } from "@/lib/report-history";
import { type ManualFields } from "@/lib/report-manual";
import { LoadingBlock } from "@/components/LoadingBlock";

// Full monthly report in the team's Notion format (see docs/MONTHLY_REPORT_SPEC.md).
// Phase 1: render the imported month-over-month history tables in the template's
// section order. Live current-month data, the CRM lead grids, and the editable
// manual sections come in later phases (marked as placeholders below).
export function MonthlyReportView({ monthLabel }: { monthLabel?: string }) {
  const H = REPORT_HISTORY;
  // The report is for the CURRENT month, live (month-to-date). Window = 1st → today.
  const now = new Date();
  const label = monthLabel ?? now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [manual, setManual] = useState<ManualFields | null>(null);
  const manualRef = useRef<ManualFields | null>(null);
  const [notesSave, setNotesSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => { manualRef.current = manual; }, [manual]);
  useEffect(() => {
    fetch(`/api/reports/manual?month=${monthKey}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j) => setManual(j.fields as ManualFields))
      .catch(() => setManual({ achievements: "", focusedSbus: "", amcEbook: "", newsletter: "", futureProspects: "", actionNotes: "" }));
  }, [monthKey]);
  const updateField = (field: keyof ManualFields, value: string) =>
    setManual((m) => ({ ...(m ?? { achievements: "", focusedSbus: "", amcEbook: "", newsletter: "", futureProspects: "", actionNotes: "" }), [field]: value }));
  // Save the WHOLE current notes object, and serialise saves in a promise chain so
  // two quick blurs can't race a read-modify-write and drop a field.
  const saveNotes = () => {
    setNotesSave("saving");
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(async () => {
        const r = await fetch("/api/reports/manual", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month: monthKey, patch: manualRef.current ?? {} }),
        });
        setNotesSave(r.ok ? "saved" : "error");
      })
      .catch(() => setNotesSave("error"));
  };

  // Snapshot: freeze this month's assembled live numbers so the month is preserved
  // once the platform APIs can't re-fetch it. Save on demand + auto-save on view.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/reports/snapshot?month=${monthKey}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.savedAt) setSavedAt(j.savedAt); })
      .catch(() => {});
  }, [monthKey]);
  const saveMonth = async () => {
    setSaveState("saving");
    try {
      const q = `from=${from}&to=${to}`;
      const j = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [leadStatus, organic, instagram, youtube, linkedin, topPosts, man] = await Promise.all([
        j(`/api/reports/lead-status?${q}`),
        j(`/api/reports/organic-leads?from=2026-06-01&to=${to}`),
        j(`/api/reports/instagram-month?${q}`),
        j(`/api/reports/platform-month?platform=youtube&${q}`),
        j(`/api/reports/platform-month?platform=linkedin&${q}`),
        j(`/api/reports/instagram-top?${q}`),
        j(`/api/reports/manual?month=${monthKey}`),
      ]);
      const payload = { label, window: { from, to }, leadStatus, organic, instagram, youtube, linkedin, topPosts, manual: (man as { fields?: unknown } | null)?.fields ?? null };
      const r = await fetch("/api/reports/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: monthKey, payload }) });
      if (r.ok) { const res = await r.json(); setSavedAt(res.savedAt); setSaveState("saved"); } else setSaveState("error");
    } catch { setSaveState("error"); }
  };
  // Auto-save once a few seconds after the data has settled, so a viewed month is
  // always captured before it rolls over (belt-and-braces alongside a monthly cron).
  useEffect(() => {
    const t = setTimeout(() => { saveMonth(); }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  return (
    <article className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-9">
      <header className="border-b border-gray-100 pb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-brand font-semibold mb-1">Monthly performance</div>
          <h1 className="text-xl font-semibold text-[#232D42] tracking-tight">{label} Monthly Report</h1>
          <div className="text-[12.5px] text-gray-500 mt-1">GooCampus · all channels · this month to date</div>
        </div>
        <div className="flex items-center gap-2.5">
          {savedAt && <span className="text-[11px] text-gray-400">saved {new Date(savedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
          <button onClick={saveMonth} disabled={saveState === "saving"} title="Freeze this month's numbers so it's preserved after the month ends"
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-brand/40 text-brand bg-brand-light hover:bg-brand hover:text-white transition disabled:opacity-50">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : saveState === "error" ? "Retry save" : "Save this month"}
          </button>
        </div>
      </header>

      <ManualEditable title="Achievements" hint="Leads converted this month + all-time highs + strategy notes." value={manual?.achievements ?? ""} onChange={(v) => updateField("achievements", v)} onBlur={saveNotes} loaded={manual != null} state={notesSave} />
      <ManualEditable title="Focused SBUs" hint="Focused SBUs + webinar / live-session write-ups (registrations, attendees)." value={manual?.focusedSbus ?? ""} onChange={(v) => updateField("focusedSbus", v)} onBlur={saveNotes} loaded={manual != null} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ManualEditable title="AMC E-Book" hint="Total sales so far + note." value={manual?.amcEbook ?? ""} onChange={(v) => updateField("amcEbook", v)} onBlur={saveNotes} loaded={manual != null} />
        <ManualEditable title="Newsletter" hint="Total subscribers + note." value={manual?.newsletter ?? ""} onChange={(v) => updateField("newsletter", v)} onBlur={saveNotes} loaded={manual != null} />
      </div>

      <Section title="Total Organic Leads" note="Organic leads by source, month over month (paid ads excluded).">
        <OrganicLeadsTable base={H.organicLeads} from="2026-06-01" to={to} />
      </Section>

      <LeadGrids from={from} to={to} />

      <PlatformHeader name="Instagram" />
      <Section title="Instagram — monthly" note="Followers · reach · content interactions · DMs · leads · posts · reels · stories. Latest month bold.">
        <InstagramTable base={H.instagram} from={from} to={to} />
      </Section>
      <Section title="Likes · Comments · Saves · Shares" note="Month-over-month totals.">
        <MonthlyTable t={H.engagement} />
      </Section>
      <InstagramTopContent from={from} to={to} />
      <InstagramSummary from={from} to={to} />

      <PlatformHeader name="YouTube" />
      <Section title="YouTube — monthly" note="Subscribers · views · videos · shorts · leads.">
        <PlatformLiveTable base={H.youtube} platform="youtube" from={from} to={to}
          buildRow={(j, short) => [`${short} · live`, fmtNum(j.subscribers), fmtCompact(j.views), String(j.video), String(j.shorts), String(j.leads)]} />
      </Section>

      <PlatformHeader name="Facebook" />
      <Section title="Facebook — monthly" note="Views · posts · reels · content interactions · followers.">
        <MonthlyTable t={H.facebook} />
        <div className="text-[11px] text-gray-400 mt-1.5">No live current-month row yet — the stored Facebook token lacks <b>read_insights</b>, so live Page metrics aren&rsquo;t available. Re-scope the token to enable it. History imported from the Notion report.</div>
      </Section>

      <PlatformHeader name="LinkedIn" />
      <Section title="LinkedIn — monthly" note="Followers · impressions · reactions · posts · comments.">
        <PlatformLiveTable base={H.linkedin} platform="linkedin" from={from} to={to}
          buildRow={(j, short) => [`${short} · live`, fmtNum(j.followers), fmtNum(j.impressions), String(j.reactions), String(j.posts), String(j.comments)]} />
      </Section>

      <ManualEditable title="Future Prospects" hint="Strategy bullets for the coming month." value={manual?.futureProspects ?? ""} onChange={(v) => updateField("futureProspects", v)} onBlur={saveNotes} loaded={manual != null} />
      <ManualEditable title="Post-Meeting Action Notes" hint="Actions agreed in the review meeting." value={manual?.actionNotes ?? ""} onChange={(v) => updateField("actionNotes", v)} onBlur={saveNotes} loaded={manual != null} />

      <footer className="pt-5 border-t border-gray-100 text-[11px] text-gray-400 italic">
        Historical months imported once from the team&rsquo;s Notion report; the latest month and the live/chart sections fill from the dashboard&rsquo;s own data (being wired up).
      </footer>
    </article>
  );
}

// Total Organic Leads: imported history (through May 2026) + CRM-estimate months
// appended from June 2026 onward (paid ads excluded). Latest month bold.
function OrganicLeadsTable({ base, from, to }: { base: HistoryTable; from: string; to: string }) {
  const [extra, setExtra] = useState<string[][]>([]);
  const [est, setEst] = useState(false);
  useEffect(() => {
    fetch(`/api/reports/organic-leads?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j: { rows: { month: string; igfb: number; dmBookings: number; ytEnquiries: number; website: number; inboundCall: number; total: number }[] }) => {
        const rows = (j.rows || []).map((r) => [
          `${new Date(r.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })} · est`,
          String(r.igfb), String(r.dmBookings), String(r.ytEnquiries), String(r.website), String(r.inboundCall), String(r.total),
        ]);
        setExtra(rows);
        setEst(rows.length > 0);
      })
      .catch(() => {});
  }, [from, to]);
  return (
    <>
      <MonthlyTable t={{ heading: base.heading, header: base.header, rows: [...base.rows, ...extra] }} />
      {est && <div className="text-[11px] text-gray-400 mt-1.5">Months marked <b>· est</b> (Jun 2026 →) are a <b>CRM estimate</b> from Lead Source — can differ from the curated figure. Earlier months imported from the Notion report.</div>}
    </>
  );
}

const fmtNum = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-IN"));

// Best-performing Instagram content this month — thumbnails ranked by engagement.
function InstagramTopContent({ from, to }: { from: string; to: string }) {
  const [d, setD] = useState<{ posts: { permalink: string; thumb: string; type: string; likes: number; comments: number }[] } | null>(null);
  useEffect(() => {
    fetch(`/api/reports/instagram-top?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j) => setD(j))
      .catch(() => setD({ posts: [] }));
  }, [from, to]);
  return (
    <Section title="Best-performing content · Instagram" note="This month's top posts, ranked by likes + comments.">
      {!d ? <div className="border border-gray-200 rounded-xl"><LoadingBlock className="!py-8" size={24} label="Loading top posts…" /></div>
        : d.posts.length === 0 ? <div className="text-sm text-gray-400">No Instagram posts in this window yet.</div>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {d.posts.map((p, i) => (
              <a key={i} href={p.permalink} target="_blank" rel="noreferrer" className="group block">
                <div className="aspect-square rounded-lg bg-gray-100 overflow-hidden border border-gray-100">
                  {p.thumb ? <img src={p.thumb} alt="" className="w-full h-full object-cover transition group-hover:scale-105" /> : <div className="w-full h-full grid place-items-center text-2xl text-gray-300">▢</div>}
                </div>
                <div className="text-[10.5px] text-gray-500 mt-1 flex items-center justify-between"><span>{p.type}</span><span className="tabular-nums">♥{fmtNum(p.likes)} · {fmtNum(p.comments)}</span></div>
              </a>
            ))}
          </div>
        )}
    </Section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="border border-gray-200 rounded-xl p-3"><div className="text-[22px] font-semibold tabular-nums text-[#232D42] leading-none">{value}</div><div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">{label}</div></div>;
}

// Instagram Performance Summary — this month's headline numbers (live). MoM growth %
// fills once the previous month is snapshotted (the report saves each month, phase 3).
function InstagramSummary({ from, to }: { from: string; to: string }) {
  const [d, setD] = useState<{ available: boolean; followers: number | null; reach: number | null; contentInteractions: number | null; leads: number } | null>(null);
  useEffect(() => {
    fetch(`/api/reports/instagram-month?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j) => setD(j))
      .catch(() => {});
  }, [from, to]);
  return (
    <Section title="Instagram Performance Summary" note="This month to date (live).">
      {!d ? <div className="border border-gray-200 rounded-xl"><LoadingBlock className="!py-8" size={24} /></div> : (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label="Followers" value={fmtNum(d.followers)} />
            <MiniStat label="Reach" value={fmtCompact(d.reach)} />
            <MiniStat label="Content interactions" value={fmtCompact(d.contentInteractions)} />
            <MiniStat label="Leads · IG/Fb est" value={String(d.leads ?? 0)} />
          </div>
          <div className="text-[11px] text-gray-400 mt-2">Month-over-month growth % fills in once the previous month is snapshotted — the report saves each month going forward.</div>
        </div>
      )}
    </Section>
  );
}

// Generic platform table: imported history + a LIVE current-month row built from
// /api/reports/platform-month (only appended when the platform returns real data).
function PlatformLiveTable({ base, platform, from, to, buildRow }: {
  base: HistoryTable; platform: string; from: string; to: string;
  buildRow: (j: Record<string, number>, short: string) => string[];
}) {
  const [row, setRow] = useState<string[] | null>(null);
  useEffect(() => {
    fetch(`/api/reports/platform-month?platform=${platform}&from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j) => {
        if (!j.available) return;
        const short = new Date(to + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
        setRow(buildRow(j, short));
      })
      .catch(() => {});
    // buildRow only formats the response; capturing the first ref is fine and avoids a refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, from, to]);
  return (
    <>
      <MonthlyTable t={{ heading: base.heading, header: base.header, rows: row ? [...base.rows, row] : base.rows }} />
      {row && <div className="text-[11px] text-gray-400 mt-1.5">The <b>· live</b> row is this month to date — real data. Leads (where shown) are a CRM estimate.</div>}
    </>
  );
}

// L/K compact notation to match the imported Notion values (e.g. "9.91L", "40.1K").
function fmtCompact(n: number | null): string {
  if (n == null) return "—";
  if (n >= 100_000) return `${(n / 100_000).toFixed(2).replace(/\.?0+$/, "")}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

// Instagram monthly table: imported history + the current month's LIVE row from
// Meta (followers/reach/content interactions/posts/reels/stories; leads = CRM
// IG/Fb estimate; DM not available from the API).
function InstagramTable({ base, from, to }: { base: HistoryTable; from: string; to: string }) {
  const [row, setRow] = useState<string[] | null>(null);
  useEffect(() => {
    fetch(`/api/reports/instagram-month?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j: { available: boolean; followers: number | null; reach: number | null; contentInteractions: number | null; post: number; reel: number; story: number; leads: number }) => {
        if (!j.available) return;
        const short = new Date(to + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
        setRow([`${short} · live`, j.followers != null ? j.followers.toLocaleString("en-IN") : "—", fmtCompact(j.reach), fmtCompact(j.contentInteractions), "—", String(j.leads), String(j.post), String(j.reel), String(j.story)]);
      })
      .catch(() => {});
  }, [from, to]);
  return (
    <>
      <MonthlyTable t={{ heading: base.heading, header: base.header, rows: row ? [...base.rows, row] : base.rows }} />
      {row && <div className="text-[11px] text-gray-400 mt-1.5">The <b>· live</b> row is this month to date from Meta — followers, reach, content interactions, posts &amp; reels are real. <b>Leads</b> = CRM IG/Fb estimate; <b>DM</b> and <b>Story</b> counts aren&rsquo;t exposed by the API (shown as — / 0).</div>}
    </>
  );
}

type LeadStatusResp = {
  window: { from: string; to: string };
  total: number;
  byStatus: { status: string; count: number }[];
  statuses: string[];
  bySbu: { sbu: string; total: number; counts: Record<string, number> }[];
};

// Lead Status + Total Lead Status (SBU) — live from the CRM for the report window.
function LeadGrids({ from, to }: { from: string; to: string }) {
  const [d, setD] = useState<LeadStatusResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/reports/lead-status?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setD(j as LeadStatusResp))
      .catch((e) => setErr(e instanceof Error ? e.message : "failed"));
  }, [from, to]);

  if (err) return <Placeholder title="Lead Status" note={`Couldn't load — ${err}`} />;
  if (!d) return <div className="border border-gray-200 rounded-xl"><LoadingBlock className="!py-8" size={24} label="Loading lead status…" /></div>;

  const maxStatus = Math.max(1, ...d.byStatus.map((s) => s.count));
  // Keep the SBU matrix readable: the top 7 statuses as columns, rest folded into "Other".
  const cols = d.statuses.slice(0, 7);
  const otherCols = d.statuses.slice(7);
  const otherOf = (counts: Record<string, number>) => otherCols.reduce((n, s) => n + (counts[s] || 0), 0);

  return (
    <div className="space-y-6">
      <Section title="Lead Status" note={`Leads created ${d.window.from} → ${d.window.to}, by status · ${d.total} total.`}>
        <div className="border border-gray-200 rounded-xl p-4 space-y-2.5">
          {d.byStatus.map((s) => {
            const pct = d.total ? Math.round((s.count / d.total) * 100) : 0;
            return (
              <div key={s.status} className="grid grid-cols-[170px_1fr_64px] items-center gap-3 text-[12.5px]">
                <span className="text-[#3B4457] truncate" title={s.status}>{s.status}</span>
                <span className="h-2.5 rounded-full bg-[#F3F5FA] overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: `${(s.count / maxStatus) * 100}%` }} /></span>
                <span className="text-right tabular-nums"><b className="font-medium text-[#232D42]">{s.count}</b> <span className="text-gray-400">{pct}%</span></span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Total Lead Status (SBU)" note="Leads by SBU (rows) × status (columns).">
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wide sticky left-0 bg-gray-50">SBU</th>
                {cols.map((s) => <th key={s} className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wide">{s}</th>)}
                {otherCols.length > 0 && <th className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wide">Other</th>}
                <th className="px-3 py-2 text-right font-semibold text-[11px] uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.bySbu.map((r) => (
                <tr key={r.sbu} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-left font-medium text-[#232D42] sticky left-0 bg-white">{r.sbu}</td>
                  {cols.map((s) => <td key={s} className="px-3 py-2 text-right tabular-nums text-gray-600">{r.counts[s] || 0}</td>)}
                  {otherCols.length > 0 && <td className="px-3 py-2 text-right tabular-nums text-gray-600">{otherOf(r.counts)}</td>}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#232D42]">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-widest text-gray-500 font-semibold">{title}</div>
      {note && <div className="text-[12px] text-gray-400 mt-0.5 mb-3">{note}</div>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

function PlatformHeader({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="h-px flex-1 bg-gray-100" />
      <div className="text-[13px] font-semibold text-brand uppercase tracking-widest">{name}</div>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  );
}

// A month-over-month table: header row + one row per month, latest row emphasised,
// horizontally scrollable so wide tables never break the page.
function MonthlyTable({ t }: { t: HistoryTable }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-[12.5px] whitespace-nowrap">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            {t.header.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-semibold text-[11px] uppercase tracking-wide ${i === 0 ? "text-left sticky left-0 bg-gray-50" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, ri) => {
            const last = ri === t.rows.length - 1;
            return (
              <tr key={ri} className={`border-t border-gray-100 ${last ? "bg-brand-light/50 font-semibold text-[#232D42]" : ""}`}>
                {row.map((c, ci) => (
                  <td key={ci} className={`px-3 py-2 tabular-nums ${ci === 0 ? `text-left sticky left-0 ${last ? "bg-[#eef1fb]" : "bg-white"}` : "text-right"}`}>{c || "—"}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Editable narrative section — fully controlled by the parent, which owns all six
// fields and saves the whole object on blur (serialised), so overlapping saves can't
// drop a field. Disabled until the saved values have loaded.
function ManualEditable({ title, hint, value, onChange, onBlur, loaded, state }: {
  title: string; hint: string; value: string; onChange: (v: string) => void; onBlur: () => void; loaded: boolean;
  state?: "idle" | "saving" | "saved" | "error";
}) {
  const rows = Math.min(12, Math.max(3, (value || "").split("\n").length + 1));
  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500"><IconPencil size={12} stroke={1.8} className="inline -mt-0.5 mr-1" />{title}</span>
        {state === "saving" && <span className="text-[10px] text-gray-400">saving…</span>}
        {state === "saved" && <span className="text-[10px] text-emerald-600">✓ notes saved</span>}
        {state === "error" && <span className="text-[10px] text-rose-600">save failed — retry</span>}
      </div>
      <textarea
        value={value}
        disabled={!loaded}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        placeholder={loaded ? hint : "Loading…"}
        className="w-full text-[13px] text-[#232D42] border border-gray-200 rounded-lg px-3 py-2 leading-relaxed resize-y focus:outline-none focus:border-brand disabled:bg-gray-50 disabled:text-gray-400"
      />
    </section>
  );
}

// Live/chart section not wired up yet — shown so the report's shape is complete.
function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{title}</span>
        <span className="text-[10px] font-medium text-brand bg-brand-light rounded-full px-2 py-0.5">auto · wiring up</span>
      </div>
      <div className="text-[12px] text-gray-400 mt-1.5">{note}</div>
    </section>
  );
}
