"use client";
import { REPORT_HISTORY, type HistoryTable } from "@/lib/report-history";

// Full monthly report in the team's Notion format (see docs/MONTHLY_REPORT_SPEC.md).
// Phase 1: render the imported month-over-month history tables in the template's
// section order. Live current-month data, the CRM lead grids, and the editable
// manual sections come in later phases (marked as placeholders below).
export function MonthlyReportView({ monthLabel = "May 2026" }: { monthLabel?: string }) {
  const H = REPORT_HISTORY;
  return (
    <article className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-9">
      <header className="border-b border-gray-100 pb-5">
        <div className="text-[11px] uppercase tracking-widest text-brand font-semibold mb-1">Monthly performance</div>
        <h1 className="text-xl font-semibold text-[#232D42] tracking-tight">{monthLabel} Monthly Report</h1>
        <div className="text-[12.5px] text-gray-500 mt-1">GooCampus · all channels</div>
      </header>

      <Manual title="Achievements" hint="Leads converted this month + all-time highs + strategy notes." />
      <Manual title="Focused SBUs" hint="Focused SBUs + webinar / live-session write-ups (registrations, attendees)." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Manual title="AMC E-Book" hint="Total sales so far + note." />
        <Manual title="Newsletter" hint="Total subscribers + note." />
      </div>

      <Section title="Total Organic Leads" note="Organic leads by source, month over month (paid ads excluded).">
        <MonthlyTable t={H.organicLeads} />
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Placeholder title="Lead Status" note="Chart from the CRM — coming next." />
        <Placeholder title="Total Lead Status (SBU)" note="Status × SBU from the CRM — coming next." />
      </div>

      <PlatformHeader name="Instagram" />
      <Section title="Instagram — monthly" note="Followers · reach · content interactions · DMs · leads · posts · reels · stories. Latest month bold.">
        <MonthlyTable t={H.instagram} />
      </Section>
      <Section title="Likes · Comments · Saves · Shares" note="Month-over-month totals.">
        <MonthlyTable t={H.engagement} />
      </Section>
      <Placeholder title="Best-performing content · Instagram" note="Top posts with thumbnails — from live data, coming next." />
      <Placeholder title="Instagram Performance Summary" note="Key insight + growth summary (MoM %) — from live data, coming next." />

      <PlatformHeader name="YouTube" />
      <Section title="YouTube — monthly" note="Subscribers · views · videos · shorts · leads.">
        <MonthlyTable t={H.youtube} />
      </Section>

      <PlatformHeader name="Facebook" />
      <Section title="Facebook — monthly" note="Views · posts · reels · content interactions · followers.">
        <MonthlyTable t={H.facebook} />
      </Section>

      <PlatformHeader name="LinkedIn" />
      <Section title="LinkedIn — monthly" note="Followers · impressions · reactions · posts · comments.">
        <MonthlyTable t={H.linkedin} />
      </Section>

      <Manual title="Future Prospects" hint="Strategy bullets for the coming month." />
      <Manual title="Post-Meeting Action Notes" hint="Actions agreed in the review meeting." />

      <footer className="pt-5 border-t border-gray-100 text-[11px] text-gray-400 italic">
        Historical months imported once from the team&rsquo;s Notion report; the latest month and the live/chart sections fill from the dashboard&rsquo;s own data (being wired up).
      </footer>
    </article>
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

// Editable narrative section — placeholder for now (phase 4 makes it an input saved
// with the report). Rendered as a dashed "to fill" card so the layout is complete.
function Manual({ title, hint }: { title: string; hint: string }) {
  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">✍️ {title}</span>
        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">editable · you fill this</span>
      </div>
      <div className="text-[12px] text-gray-500 mt-1.5 leading-relaxed">{hint}</div>
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
