"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { IconLock, IconUsers, IconClock, IconChartBar, IconCalendar, IconDownload, IconChevronLeft, IconChevronRight, IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react";
import { LoadingBlock } from "@/components/LoadingBlock";
import {
  type Person, type Rec, type Row, type View, COLORS, LIVE_WINDOW,
  addDays, clock, dayLabel, daysOf, dow, fmt, hrs, longDate, monthLabel, monthStart, short, weekStart, weekdayShort, workdays,
} from "./attendance-utils";
import { buildAttendancePdf, renderPdfPages } from "./attendance-pdf";

// Attendance board — the layout approved in docs/attendance-prototype/v11.html.
// Rules (arrived / left / hours) live in docs/ATTENDANCE_SPEC.md.

type Data = { start: string; today: string; nowMin: number; people: Person[]; records: { person: string; date: string; inMin: number; outMin: number; ended: boolean }[] };

const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
// Today isn't a missed day until it's over — no arrival yet reads "Not in yet".
const absentDays = (r: Row, days: string[], work: string[], today: string) => work.filter((d) => d < today && !r.x[days.indexOf(d)]).length;
const INK = "text-[#232D42]", MUTED = "text-[#8A92A6]";

export function AttendanceClient({ isAdmin }: { isAdmin: boolean }) {
  return (
    <PreviewDashboardShell active="my-workspace" title="Attendance" hideAccountPicker hideRange
      subtitle="Arrival, leaving time and hours worked for each person — by day, week, month or any range. Admin only.">
      {() => (isAdmin ? <Board /> : (
        <div className="preview-scope">
          <div className="bg-white border border-gray-100 rounded-2xl px-6 py-12 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-400 mb-3"><IconLock size={20} /></div>
            <div className="text-[15px] font-medium text-[#232D42]">Admins only</div>
            <div className="text-[13px] text-gray-500 mt-1">This attendance board is visible to admins.</div>
          </div>
        </div>
      ))}
    </PreviewDashboardShell>
  );
}

// A visible date box; clicking anywhere on it opens the picker (Chrome won't for an invisible input).
function DateBox({ value, max, onChange }: { value: string; max: string; onChange: (v: string) => void }) {
  return (
    <input type="date" value={value} max={max}
      onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* older browsers open it themselves */ } }}
      onChange={(e) => e.target.value && onChange(e.target.value > max ? max : e.target.value)}
      className={`h-9 border border-gray-100 rounded-lg px-3 text-[13px] ${INK} bg-white cursor-pointer`} />
  );
}

const Btn = ({ on, disabled, onClick, children, className = "" }: { on?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; className?: string }) => (
  <button onClick={onClick} disabled={disabled}
    className={`h-9 px-3.5 rounded-lg border text-[13px] font-medium inline-flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-default ${on ? "bg-brand-light text-brand border-brand-light" : `bg-white ${INK} border-gray-100 enabled:hover:border-brand enabled:hover:text-brand`} ${className}`}>
    {children}
  </button>
);

const Avatar = ({ row }: { row: Row }) => (
  <span className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-medium text-white shrink-0" style={{ background: row.color }}>{row.p.name[0]}</span>
);
const Who = ({ row, sub }: { row: Row; sub?: string }) => (
  <span className="flex items-center gap-3 min-w-0">
    <Avatar row={row} />
    <span className="min-w-0"><span className={`block text-[13.5px] font-medium ${INK} truncate`}>{row.p.name}</span><span className={`block text-[12px] ${MUTED} truncate`}>{sub ?? row.p.role}</span></span>
  </span>
);
const Prog = ({ m, target }: { m: number; target: number }) => (
  <span className="flex items-center gap-2.5 min-w-[140px] flex-1">
    <span className="flex-1 h-1.5 rounded-full bg-[#EEF0F4] overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: `${target ? Math.min(100, (m / target) * 100) : 0}%` }} /></span>
    <span className={`text-[12px] ${MUTED} w-9 text-right`}>{target ? Math.round((m / target) * 100) : 0}%</span>
  </span>
);
const Caret = ({ open }: { open: boolean }) => open ? <IconChevronUp size={14} className={MUTED} /> : <IconChevronDown size={14} className={MUTED} />;

function Board() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(todayIST());
  const [from, setFrom] = useState(monthStart(todayIST()));
  const [to, setTo] = useState(todayIST());
  const [sel, setSel] = useState<string | null>(null);
  const [chartWho, setChartWho] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const today = data?.today ?? todayIST();
  const days = useMemo(() => daysOf(view, anchor, from, to), [view, anchor, from, to]);
  const first = days[0], last = days[days.length - 1];

  const load = useCallback(() => {
    fetch(`/api/my-day/attendance?from=${first}&to=${last}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => { setData(d); setFailed(false); })
      .catch(() => setFailed(true));
  }, [first, last]);
  useEffect(() => { setData(null); load(); }, [load]);
  // Today moves while you watch — refresh every 2 minutes while the tab is on screen.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && last >= todayIST()) load(); }, 120000);
    return () => clearInterval(t);
  }, [load, last]);

  const start = data?.start ?? today;
  const work = useMemo(() => workdays(days, start, today), [days, start, today]);
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const byKey = new Map(data.records.map((r) => [`${r.person}|${r.date}`, r]));
    return data.people.map((p, i) => {
      const x: Rec[] = days.map((d) => { const r = byKey.get(`${p.key}|${d}`); return r ? { in: r.inMin, out: r.outMin, live: d === data.today && !r.ended } : null; });
      return { p, color: COLORS[i % COLORS.length], x, tot: x.reduce((a, b) => a + hrs(b), 0), present: work.filter((d) => x[days.indexOf(d)]).length };
    });
  }, [data, days, work]);
  const ended = (row: Row, i: number) => !!data?.records.find((r) => r.person === row.p.key && r.date === days[i])?.ended;
  const working = (x: Rec) => !!x && x.live && (data?.nowMin ?? 0) - x.out <= LIVE_WINDOW;

  // ── title + navigation
  const ws = weekStart(anchor);
  const title = view === "day" ? longDate(anchor) + (anchor === today ? " · today" : "")
    : view === "week" ? `Week · Mon ${short(ws)} – Fri ${short(addDays(ws, 4))}` + (days.includes(today) ? " (this week)" : "")
    : view === "month" ? monthLabel(anchor)
    : `${short(from)} – ${short(to)} ${to.slice(0, 4)}`;
  const nextOff = view === "day" ? anchor >= today : view === "week" ? addDays(ws, 7) > today : monthStart(anchor) >= monthStart(today);
  const shift = (dir: number) => {
    let a = anchor;
    if (view === "day") a = addDays(anchor, dir);
    else if (view === "week") a = addDays(anchor, 7 * dir);
    else { const d = new Date(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7) - 1 + dir, 1)); a = d.toISOString().slice(0, 10); }
    setAnchor(a > today ? today : a); setSel(null);
  };

  // ── summary cards (also page 1 of the PDF)
  const all = rows.reduce((a, r) => a + r.tot, 0);
  const n = rows.length || 1;
  const dayRows = rows.map((r) => ({ r, x: r.x[0] }));
  const isToday = view === "day" && anchor === today;
  const cards: [string, string, string][] = view === "day"
    ? [[isToday ? "Arrived" : "Present", `${dayRows.filter((d) => d.x).length} / ${rows.length}`, ""],
       [isToday ? "Working now" : "Left", String(isToday ? dayRows.filter((d) => working(d.x)).length : dayRows.filter((d) => d.x).length), isToday ? `active in the last ${LIVE_WINDOW} min` : ""],
       ["Hours worked", fmt(all), "everyone, after lunch"],
       [isToday ? "Not in yet" : "Absent", String(dayRows.filter((d) => !d.x).length), ""]]
    : [["People present", `${rows.filter((r) => r.present).length} / ${rows.length}`, ""],
       ["Hours worked", fmt(all), "everyone, after lunch"],
       ["Average per person", fmt(Math.round(all / n)), `target ${work.length * 8}h so far`],
       view === "week" ? ["Days absent", String(rows.reduce((a, r) => a + absentDays(r, days, work, today), 0)), "working days missed"]
                       : ["Working days", String(work.length), view === "custom" ? "in this range" : days.includes(today) ? "so far" : ""]];
  const cardIcons = [IconUsers, IconClock, IconChartBar, IconCalendar];

  // ── PDF report
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<Awaited<ReturnType<typeof buildAttendancePdf>> | null>(null);
  const [pdfErr, setPdfErr] = useState("");
  const pagesRef = useRef<HTMLDivElement>(null);
  const fileName = `attendance-${view}-${view === "custom" ? `${from}-to-${to}` : anchor}.pdf`;
  const openReport = async () => {
    setPdfOpen(true); setPdfDoc(null); setPdfErr("");
    try {
      const doc = await buildAttendancePdf({ title, cards, multi: view !== "day", rows, days, work, today, isToday });
      setPdfDoc(doc);
      if (pagesRef.current) await renderPdfPages(doc, pagesRef.current);
    } catch (e) { setPdfErr(e instanceof Error ? e.message : "could not build the report"); }
  };

  const notRecorded = view === "day" && anchor < start;
  const weekend = view === "day" && dow(anchor) >= 5 && !rows.some((r) => r.x[0]);

  return (
    <div className="preview-scope space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`text-[16px] font-medium ${INK} mr-2 min-w-[220px]`}>{title}</div>
        {view !== "custom" ? (
          <>
            <Btn onClick={() => shift(-1)} className="w-9 px-0 justify-center"><IconChevronLeft size={16} /></Btn>
            <DateBox value={anchor} max={today} onChange={(v) => { setAnchor(v); setSel(null); }} />
            <Btn onClick={() => shift(1)} disabled={nextOff} className="w-9 px-0 justify-center"><IconChevronRight size={16} /></Btn>
            <Btn on={anchor === today} onClick={() => { setAnchor(today); setSel(null); }}>Today</Btn>
          </>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className={`text-[13px] ${MUTED}`}>From</span><DateBox value={from} max={today} onChange={(v) => { setFrom(v); if (v > to) setTo(v); }} />
            <span className={`text-[13px] ${MUTED}`}>to</span><DateBox value={to} max={today} onChange={(v) => { setTo(v); if (v < from) setFrom(v); }} />
          </span>
        )}
        <div className="inline-flex border border-gray-100 rounded-lg overflow-hidden bg-white">
          {(["day", "week", "month", "custom"] as const).map((v) => (
            <button key={v} onClick={() => { setView(v); setSel(null); }}
              className={`h-[34px] px-4 text-[13px] font-medium capitalize ${view === v ? "bg-brand-light text-brand" : "bg-white text-[#4A5468] hover:text-brand"}`}>{v}</button>
          ))}
        </div>
        <Btn onClick={openReport} disabled={!data} className="ml-auto"><IconDownload size={15} />Download report (PDF)</Btn>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(([l, v, s], i) => { const Icon = cardIcons[i]; return (
          <div key={l} className="bg-white border border-gray-100 rounded-2xl px-4 py-4 flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-xl bg-brand-light text-brand flex items-center justify-center shrink-0"><Icon size={20} /></span>
            <span><span className={`block text-[12.5px] ${MUTED}`}>{l}</span><span className={`block text-[22px] font-medium ${INK} leading-tight`}>{data ? v : "—"}</span><span className={`block text-[12px] ${MUTED}`}>{s}</span></span>
          </div>
        ); })}
      </div>

      {failed ? <Empty>Couldn&apos;t load attendance. <button onClick={load} className="text-brand">Try again</button></Empty>
       : !data ? <div className="bg-white border border-gray-100 rounded-2xl"><LoadingBlock /></div>
       : notRecorded ? <Empty>Attendance recording started on {longDate(start)} — nothing was recorded before then.</Empty>
       : weekend ? <Empty>{weekdayShort(anchor)} — not a working day.</Empty>
       : view === "day" ? <DayTable rows={rows} isToday={isToday} sel={sel} setSel={setSel} working={working} ended={(r) => ended(r, 0)} />
       : (
        <>
          <Trend rows={rows} days={days} work={work} today={today} who={chartWho} setWho={setChartWho}
            label={view === "week" ? "Hours worked this week" : view === "month" ? "Hours worked this month" : "Hours worked in this range"} />
          {view === "week"
            ? <WeekTable rows={rows} days={days} work={work} today={today} start={start} sel={sel} setSel={setSel} />
            : <MonthTable rows={rows} days={days} work={work} today={today} start={start} sel={sel} setSel={setSel} />}
        </>
      )}

      <p className={`text-[12px] ${MUTED}`}>Arrived = the first dashboard page they open. Left = End day, or their last activity if they don&apos;t press it. Hours = arrived to left, minus the 1-hour lunch. Click a person to open their details.</p>

      {pdfOpen && (
        <div className="fixed inset-0 z-50 bg-[#232D42]/45 flex items-center justify-center" onClick={() => setPdfOpen(false)}>
          <div className="bg-white rounded-2xl w-[min(1100px,94vw)] h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
              <div className="flex-1"><div className={`text-[15px] font-medium ${INK}`}>Report preview</div><div className={`text-[12px] ${MUTED}`}>{fileName}</div></div>
              <Btn on onClick={() => pdfDoc?.save(fileName)} disabled={!pdfDoc}><IconDownload size={15} />Download PDF</Btn>
              <Btn onClick={() => setPdfOpen(false)}><IconX size={15} />Close</Btn>
            </div>
            <div ref={pagesRef} className="flex-1 overflow-auto bg-[#F6F7FB] p-5 flex flex-col items-center gap-4">
              {pdfErr ? <div className="text-[13px] text-[#C03221] py-10">Preview failed: {pdfErr}</div> : <div className={`text-[13px] ${MUTED} py-10`}>Preparing preview…</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <div className={`bg-white border border-gray-100 rounded-2xl px-6 py-10 text-center text-[13px] ${MUTED}`}>{children}</div>
);
const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th className={`text-[12px] ${MUTED} font-medium text-left px-5 py-3 border-b border-gray-100 whitespace-nowrap ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`px-5 py-3.5 border-b border-gray-100 align-middle text-[13px] ${INK} ${className}`}>{children}</td>
);
const rowCls = (open: boolean) => `cursor-pointer ${open ? "bg-[#F5F7FE]" : "hover:bg-[#FAFBFD]"}`;

// The opened person's days as a plain list — same in Week, Month and Custom.
function DayList({ row, days, today, start, cols }: { row: Row; days: string[]; today: string; start: string; cols: number }) {
  const pad = Array.from({ length: cols - 4 }, (_, i) => <td key={i} className="bg-[#FAFBFD] border-b border-gray-100" />);
  const sub = "px-5 py-2 text-[12px] text-[#4A5468] bg-[#FAFBFD] border-b border-gray-100 whitespace-nowrap";
  return (
    <>
      <tr><td className={`${sub} pl-[68px] pt-3 font-medium ${INK}`}>{row.p.name} · each working day</td>
        {["Arrived", "Left", "Hours worked"].map((h) => <td key={h} className={`${sub} pt-3 ${MUTED}`}>{h}</td>)}{pad}</tr>
      {days.map((d, i) => {
        const x = row.x[i];
        if (!x && (dow(d) >= 5 || d < start || d > today)) return null;
        return (
          <tr key={d}>
            <td className={`${sub} pl-[68px] ${MUTED}`}>{dayLabel(d)}</td>
            {x ? <><td className={sub}>{clock(x.in)}</td><td className={sub}>{x.live ? `last seen ${clock(x.out)}` : clock(x.out)}</td><td className={sub}>{fmt(hrs(x))}</td></>
               : <><td className={`${sub} ${d === today ? MUTED : "text-[#F16A1B]"}`}>{d === today ? "Not in yet" : "Absent"}</td><td className={sub} /><td className={sub} /></>}
            {pad}
          </tr>
        );
      })}
    </>
  );
}

function DayTable({ rows, isToday, sel, setSel, working, ended }: { rows: Row[]; isToday: boolean; sel: string | null; setSel: (k: string | null) => void; working: (x: Rec) => boolean; ended: (r: Row) => boolean }) {
  // Timeline from 8 AM to 9 PM.
  const span = 780, L = (m: number) => Math.max(0, Math.min(100, ((m + 60) / span) * 100));
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <table className="w-full border-collapse">
        <thead><tr>
          <Th className="w-[240px]">Person</Th>
          <Th><span className="flex justify-between font-normal"><span>8 AM</span><span>11</span><span>2 PM</span><span>5</span><span>9 PM</span></span></Th>
          <Th className="w-[110px]">Hours</Th><Th className="w-[170px]">Status</Th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const x = r.x[0], open = sel === r.p.key, on = working(x);
            const status = !x ? (isToday ? "Not in yet" : "Absent") : on ? "● Working" : x.live ? `Last seen ${clock(x.out)}` : `Left ${clock(x.out)}`;
            return [
              <tr key={r.p.key} className={rowCls(open)} onClick={() => setSel(open ? null : r.p.key)}>
                <Td><Who row={r} sub={x ? `${clock(x.in)} – ${on ? "now" : clock(x.out)}` : "—"} /></Td>
                <Td>
                  <span className="relative block h-2 rounded-full bg-[#EEF0F4]">
                    {x && <span className="absolute inset-y-0 rounded-full" style={{ left: `${L(x.in)}%`, width: `${Math.max(0.5, L(x.out) - L(x.in))}%`, background: r.color }} />}
                    {x && <span className="absolute inset-y-0 bg-white/75" style={{ left: `${L(240)}%`, width: `${(60 / span) * 100}%` }} />}
                  </span>
                </Td>
                <Td className="font-medium">{fmt(hrs(x))}</Td>
                <Td><span className="flex items-center justify-between gap-2"><span className={`text-[12px] font-medium whitespace-nowrap ${!x ? "text-[#F16A1B]" : on ? "text-[#1AA053]" : "text-[#4A5468]"}`}>{status}</span><Caret open={open} /></span></Td>
              </tr>,
              open && (
                <tr key={r.p.key + "-d"}><td colSpan={4} className="px-5 py-2.5 pl-[68px] text-[12px] text-[#4A5468] bg-[#FAFBFD] border-b border-gray-100">
                  {x ? <>Arrived {clock(x.in)} · {x.live ? `last activity ${clock(x.out)}` : `left ${clock(x.out)}`}{x.in < 300 && x.out > 240 ? " · 1-hour lunch not counted" : ""} · {fmt(hrs(x))}
                    {!x.live && <span className={MUTED}> · {ended(r) ? "pressed End day" : "didn't press End day — left = last activity"}</span>}</>
                     : <span className={MUTED}>No dashboard activity recorded on this day.</span>}
                </td></tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function WeekTable({ rows, days, work, today, start, sel, setSel }: { rows: Row[]; days: string[]; work: string[]; today: string; start: string; sel: string | null; setSel: (k: string | null) => void }) {
  const target = work.length * 480;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <table className="w-full border-collapse">
        <thead><tr><Th className="w-[240px]">Person</Th>{days.slice(0, 5).map((d) => <Th key={d}>{weekdayShort(d)} {+d.slice(8)}</Th>)}<Th className="w-[240px]">Week</Th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const open = sel === r.p.key;
            return [
              <tr key={r.p.key} className={rowCls(open)} onClick={() => setSel(open ? null : r.p.key)}>
                <Td><Who row={r} /></Td>
                {days.slice(0, 5).map((d, i) => <Td key={d}>{r.x[i] ? <span className="font-medium">{fmt(hrs(r.x[i]))}</span> : d > today ? "" : <span className="text-[#C9CEDA]">{d < start ? "—" : d === today ? "Not in yet" : "Absent"}</span>}</Td>)}
                <Td><span className="flex items-center gap-2.5"><span className="font-medium w-16">{fmt(r.tot)}</span><Prog m={r.tot} target={target} /><Caret open={open} /></span></Td>
              </tr>,
              open && <DayList key={r.p.key + "-d"} row={r} days={days} today={today} start={start} cols={7} />,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function MonthTable({ rows, days, work, today, start, sel, setSel }: { rows: Row[]; days: string[]; work: string[]; today: string; start: string; sel: string | null; setSel: (k: string | null) => void }) {
  const target = work.length * 480;
  if (!work.length) return <Empty>No recorded working days in this range{days[0] < start ? ` — recording started on ${longDate(start)}` : ""}.</Empty>;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <table className="w-full border-collapse">
        <thead><tr><Th className="w-[240px]">Person</Th><Th>Days present</Th><Th>Days absent</Th><Th>Average day</Th><Th className="w-[320px]">Hours worked</Th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const open = sel === r.p.key;
            return [
              <tr key={r.p.key} className={rowCls(open)} onClick={() => setSel(open ? null : r.p.key)}>
                <Td><Who row={r} /></Td>
                <Td>{r.present} of {work.length}</Td>
                <Td>{absentDays(r, days, work, today)}</Td>
                <Td>{fmt(Math.round(r.tot / Math.max(1, r.present)))}</Td>
                <Td><span className="flex items-center gap-2.5"><span className="font-medium w-[72px]">{fmt(r.tot)}</span><Prog m={r.tot} target={target} /><Caret open={open} /></span></Td>
              </tr>,
              open && <DayList key={r.p.key + "-d"} row={r} days={days} today={today} start={start} cols={5} />,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// One person at a time, Overview-style: pills to switch, their total on top, hover a day
// for its hours and arrived–left. Working days only; today joins once it's over.
function Trend({ rows, days, work, today, who, setWho, label }: { rows: Row[]; days: string[]; work: string[]; today: string; who: string | null; setWho: (k: string) => void; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const r = rows.find((x) => x.p.key === who) ?? rows[0];
  if (!r) return null;
  const pts = work.filter((d) => d < today).map((d) => ({ d, x: r.x[days.indexOf(d)] }));
  const w = 1100, h = 200, pl = 46, pr = 14, pt = 10, pb = 30, cw = w - pl - pr, ch = h - pt - pb;
  const ms = pts.map((p) => hrs(p.x));
  const max = Math.max(600, ...ms);
  const X = (j: number) => pl + (j * cw) / Math.max(1, pts.length - 1), Y = (m: number) => pt + ch - (m / max) * ch;
  const line = ms.map((m, j) => `${X(j)},${Y(m)}`).join(" ");
  const step = Math.ceil(pts.length / 7), lastJ = pts.length - 1;
  const hp = hover != null ? pts[hover] : null;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 flex-wrap">
        <div><div className={`text-[26px] font-medium ${INK} leading-tight`}>{fmt(r.tot)}</div><div className={`text-[13px] ${MUTED}`}>{r.p.name} · {label}</div></div>
        <div className="flex gap-1 bg-[#F3F5FA] rounded-[10px] p-1 flex-wrap">
          {rows.map((o) => (
            <button key={o.p.key} onClick={() => { setWho(o.p.key); setHover(null); }}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium inline-flex items-center gap-1.5 ${o.p.key === r.p.key ? `bg-white ${INK}` : MUTED}`}>
              <span className="w-2 h-2 rounded-full" style={{ background: o.color }} />{o.p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 pt-2 pb-4">
        {pts.length < 2 ? <div className={`py-8 text-center text-[13px] ${MUTED}`}>The graph fills in after the first full working day.</div> : (
          <div className="relative">
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="block"
              onPointerLeave={() => setHover(null)}
              onPointerMove={(e) => {
                const b = e.currentTarget.getBoundingClientRect(), sx = ((e.clientX - b.left) / b.width) * w;
                let best = 0; pts.forEach((_, j) => { if (Math.abs(X(j) - sx) < Math.abs(X(best) - sx)) best = j; }); setHover(best);
              }}>
              {Array.from({ length: Math.floor(max / 120) + 1 }, (_, g) => g * 2).map((g) => (
                <g key={g}><line x1={pl} x2={w - pr} y1={Y(g * 60)} y2={Y(g * 60)} stroke="#F1F3F8" /><text x={pl - 10} y={Y(g * 60) + 4} textAnchor="end" fontSize="11" fill="#8A92A6">{g}h</text></g>
              ))}
              <defs><linearGradient id="att-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={r.color} stopOpacity=".22" /><stop offset="100%" stopColor={r.color} stopOpacity="0" /></linearGradient></defs>
              <polygon points={`${X(0)},${Y(0)} ${line} ${X(lastJ)},${Y(0)}`} fill="url(#att-fill)" />
              <polyline points={line} fill="none" stroke={r.color} strokeWidth={2} strokeLinejoin="round" />
              <line x1={pl} x2={w - pr} y1={Y(480)} y2={Y(480)} stroke="#232D42" strokeOpacity=".25" strokeDasharray="5 5" />
              <text x={w - pr} y={Y(480) - 6} textAnchor="end" fontSize="11" fill="#8A92A6">8h</text>
              {pts.map((p, j) => ((j % step === 0 && lastJ - j >= step * 0.8) || j === lastJ) && (
                <text key={p.d} x={X(j)} y={h - 8} textAnchor={j === lastJ ? "end" : j === 0 ? "start" : "middle"} fontSize="11" fill="#8A92A6">{short(p.d)}</text>
              ))}
              {hover != null && <><line x1={X(hover)} x2={X(hover)} y1={pt} y2={pt + ch} stroke="#C9CEDA" /><circle cx={X(hover)} cy={Y(ms[hover])} r={5} fill="#fff" stroke={r.color} strokeWidth={2} /></>}
              <rect x={pl} y={0} width={cw} height={h} fill="transparent" />
            </svg>
            {hp && hover != null && (
              <div className="absolute pointer-events-none bg-white border border-gray-100 rounded-[10px] px-3 py-2 text-[12.5px] whitespace-nowrap"
                style={{ left: `calc(${(X(hover) / w) * 100}% ${X(hover) / w > 0.8 ? "- 190px" : "+ 14px"})`, top: Math.max(0, Y(ms[hover]) - 30) }}>
                <div className={`font-medium mb-1 ${INK}`}>{dayLabel(hp.d)}</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.color }} /><span className={MUTED}>{r.p.name}</span><b className={`font-medium ${INK}`}>{hp.x ? fmt(ms[hover]) : "Absent"}</b></div>
                {hp.x && <div className={`text-[12px] ${MUTED} mt-0.5`}>{clock(hp.x.in)} – {clock(hp.x.out)}</div>}
              </div>
            )}
          </div>
        )}
        <div className={`flex justify-between text-[12px] ${MUTED} mt-1`}><span>Hours worked each working day · dashed line = 8 hours</span><span>Hover any day for its hours</span></div>
      </div>
    </div>
  );
}
