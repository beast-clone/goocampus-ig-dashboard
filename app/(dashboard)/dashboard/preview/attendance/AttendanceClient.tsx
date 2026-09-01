"use client";
import { nowMinutesIST } from "@/lib/date";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { IconLogin, IconLogout, IconClock, IconChevronRight, IconRefresh, IconLock, IconCalendar } from "@tabler/icons-react";

type DayRow = { key: string; name: string; role: string; loginMin: number | null; loginAt: string | null; logoutMin: number | null; logoutAt: string | null; rolled: { title: string; reason: string }[]; doneToday: number; pending: number; tasks: { title: string; status: string; type: string; note: string; publishingDate: string }[] };
type AggRow = { key: string; name: string; role: string; daysPresent: number; workedMin: number; doneCount: number; lastLoginAt: string | null };
type Resp = { view: "day" | "week" | "month"; date: string; from: string; to: string; rows: DayRow[] | AggRow[] };

const AV: Record<string, { bg: string; fg: string }> = {
  manya: { bg: "#F4E4D6", fg: "#993C1D" }, praveen: { bg: "#F7D9CE", fg: "#993C1D" },
  nikhil: { bg: "#B5D4F4", fg: "#0C447C" }, nandu: { bg: "#CECBF6", fg: "#3C3489" },
  maheen: { bg: "#C0DD97", fg: "#27500A" },
};
const LUNCH_START = 240, LUNCH_END = 300, DAY_MINS = 600;
// IST, matching the server's nowMinIST() — the browser's own clock would put the
// "now" line in a different place than the bars it sits on for anyone abroad.
const nowMin = () => Math.max(0, Math.min(nowMinutesIST() - 540, DAY_MINS));
const fmtDur = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`; };
function workedNet(loginMin: number | null, logoutMin: number | null): number | null {
  if (loginMin == null) return null;
  const end = logoutMin ?? nowMin();
  if (end <= loginMin) return 0;
  const overlap = Math.max(0, Math.min(end, LUNCH_END) - Math.max(loginMin, LUNCH_START));
  return Math.max(0, end - loginMin - overlap);
}
const statusOf = (r: DayRow): "working" | "out" | "absent" => r.loginMin == null ? "absent" : r.logoutMin != null ? "out" : "working";
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const fmtShort = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function AttendanceClient({ isAdmin }: { isAdmin: boolean }) {
  return (
    <PreviewDashboardShell active="my-workspace" title="Attendance" hideAccountPicker hideRange
      subtitle="Who logged in, when they left, and what they did — saved daily, weekly and monthly. Admin only.">
      {() => (isAdmin ? <Board /> : (
        <div className="preview-scope">
          <div className="bg-white border border-gray-100 rounded-2xl px-6 py-12 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-400 mb-3"><IconLock size={20} /></div>
            <div className="text-[15px] font-semibold text-[#232D42]">Admins only</div>
            <div className="text-[13px] text-gray-500 mt-1">This attendance board is visible to admins.</div>
          </div>
        </div>
      ))}
    </PreviewDashboardShell>
  );
}

function Board() {
  const [date, setDate] = useState(todayStr());
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [resp, setResp] = useState<Resp | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const load = useCallback(() => {
    fetch(`/api/my-day/attendance?view=${view}&date=${date}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setResp(d); setFetchedAt(new Date()); })
      .catch(() => setResp(null));
  }, [view, date]);
  useEffect(() => { setResp(null); load(); }, [load]);

  const isDay = (resp?.view || view) === "day";
  const isToday = date === todayStr();
  const rangeLabel = useMemo(() => {
    if (!resp) return "";
    if (resp.view === "day") return new Date(resp.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (resp.view === "week") return `Week of ${fmtShort(resp.from)} – ${fmtShort(resp.to)}`;
    return new Date(resp.date + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }, [resp]);

  return (
    <div className="preview-scope space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[15px] font-medium text-[#232D42]">{rangeLabel}{isDay && isToday && <span className="text-[13px] text-gray-400 font-normal"> · today</span>}</div>
        <label className="relative inline-flex items-center gap-1 text-[12px] text-brand border border-brand/40 rounded-lg px-2.5 py-1.5 hover:bg-brand-light cursor-pointer">
          <IconCalendar size={13} /> Change date
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {(["day", "week", "month"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1.5 capitalize transition ${view === v ? "bg-brand text-white" : "bg-white text-[#4A5468] hover:bg-gray-50"}`}>{v}</button>
          ))}
        </div>
        {isDay && isToday && <span className="text-[11px] font-medium rounded-full px-2.5 py-1 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Live{fetchedAt ? ` · ${fetchedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</span>}
        <button onClick={load} className="ml-auto text-[12px] text-brand inline-flex items-center gap-1 border border-brand/40 rounded-lg px-2.5 py-1.5 hover:bg-brand-light"><IconRefresh size={13} /> Refresh</button>
      </div>

      {isDay ? <DayTable rows={(resp?.rows as DayRow[]) ?? null} expanded={expanded} setExpanded={setExpanded} />
             : <AggTable rows={(resp?.rows as AggRow[]) ?? null} view={(resp?.view as "week" | "month") || "week"} />}

      <div className="text-[11px] text-gray-400 flex items-center gap-1.5"><IconLogin size={12} /> Login = when a teammate opens their My Day · <IconClock size={12} /> Worked is net of the 1-hour lunch · saved permanently.</div>
    </div>
  );
}

function DayTable({ rows, expanded, setExpanded }: { rows: DayRow[] | null; expanded: string | null; setExpanded: (k: string | null) => void }) {
  const s = useMemo(() => {
    const rs = rows || [];
    return { in: rs.filter((r) => r.loginMin != null).length, working: rs.filter((r) => statusOf(r) === "working").length, out: rs.filter((r) => statusOf(r) === "out").length, absent: rs.filter((r) => statusOf(r) === "absent").length, total: rs.length };
  }, [rows]);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Logged in", `${s.in}/${s.total}`, "#232D42"], ["Working now", s.working, "#1AA053"], ["Logged out", s.out, "#232D42"], ["Not in yet", s.absent, "#D97706"]].map(([lbl, val, col]) => (
          <div key={lbl as string} className="bg-white border border-gray-100 rounded-xl px-4 py-3"><div className="text-[12px] text-gray-500">{lbl}</div><div className="text-[22px] font-semibold" style={{ color: col as string }}>{val}</div></div>
        ))}
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mt-3">
        <div className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_0.8fr_0.9fr_1.1fr] items-center gap-x-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
          <span>Person</span><span>In</span><span>Out</span><span>Worked</span><span className="text-center">Done</span><span className="text-center">Pending</span><span>Status</span>
        </div>
        {rows == null ? <div className="px-4 py-8 text-center text-[13px] text-gray-400">Loading…</div>
         : rows.length === 0 ? <div className="px-4 py-8 text-center text-[13px] text-gray-400">No attendance recorded for this day.</div>
         : rows.map((r) => {
          const st = statusOf(r), worked = workedNet(r.loginMin, r.logoutMin), av = AV[r.key] || { bg: "#EEF1F5", fg: "#46505F" };
          const open = expanded === r.key, hasDetail = r.tasks.length > 0 || r.rolled.length > 0;
          return (
            <div key={r.key} className="border-b border-gray-50 last:border-0">
              <button onClick={() => hasDetail && setExpanded(open ? null : r.key)} className={`w-full text-left grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_0.8fr_0.9fr_1.1fr] items-center gap-x-3 px-4 py-3 ${hasDetail ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}>
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0" style={{ background: av.bg, color: av.fg }}>{r.name[0]}</span>
                  <span className="min-w-0"><span className="block text-[13.5px] font-medium text-[#232D42] truncate">{r.name}</span><span className="block text-[11px] text-gray-400 truncate">{r.role}</span></span>
                </span>
                <span className="text-[13px] text-[#232D42]">{r.loginAt || <span className="text-gray-300">—</span>}</span>
                <span className="text-[13px] text-[#232D42]">{r.logoutAt || <span className="text-gray-300">—</span>}</span>
                <span className="text-[13px] font-medium text-[#232D42]">{worked == null ? <span className="text-gray-300 font-normal">—</span> : fmtDur(worked)}</span>
                <span className="text-[13px] text-center text-[#232D42]">{r.doneToday}</span>
                <span className="text-[13px] text-center text-[#232D42]">{r.pending}</span>
                <span className="inline-flex items-center gap-1.5">
                  {st === "working" && <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Working</span>}
                  {st === "out" && <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-gray-100 text-gray-500 inline-flex items-center gap-1"><IconLogout size={11} />Logged out</span>}
                  {st === "absent" && <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">Not in yet</span>}
                  {hasDetail && <IconChevronRight size={13} className={`text-gray-300 transition ${open ? "rotate-90" : ""}`} />}
                </span>
              </button>
              {open && hasDetail && (
                <div className="px-4 pb-3 pt-0 space-y-2">
                  {r.tasks.length > 0 && (
                    <div className="bg-gray-50 rounded-lg px-3.5 py-2.5">
                      <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Working on / pending · {r.tasks.length}</div>
                      <table className="w-full text-[12.5px]">
                        <thead><tr className="text-[10.5px] uppercase tracking-wide text-gray-400"><th className="text-left font-semibold pb-1 w-[46%]">Task</th><th className="text-left font-semibold pb-1 w-[38%]">Note</th><th className="text-left font-semibold pb-1">Publishing Date</th></tr></thead>
                        <tbody>{r.tasks.map((t, i) => (
                          <tr key={i} className="border-t border-gray-200/70 align-top">
                            <td className="py-1.5 pr-4 text-[#232D42]">{t.title}<span className="block text-[10.5px] text-gray-400">{t.status}</span></td>
                            <td className="py-1.5 pr-4 text-gray-600">{t.note || <span className="text-gray-300">—</span>}</td>
                            <td className="py-1.5 text-gray-500 whitespace-nowrap">{t.publishingDate ? new Date(t.publishingDate.slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : <span className="text-gray-300">—</span>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                  {r.rolled.length > 0 && (
                    <div className="bg-gray-50 rounded-lg px-3.5 py-2.5">
                      <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Rolled to tomorrow · {r.rolled.length}</div>
                      <table className="w-full text-[12.5px]">
                        <thead><tr className="text-[10.5px] uppercase tracking-wide text-gray-400"><th className="text-left font-semibold pb-1 w-1/2">Task</th><th className="text-left font-semibold pb-1">Note</th></tr></thead>
                        <tbody>{r.rolled.map((t, i) => (
                          <tr key={i} className="border-t border-gray-200/70 align-top">
                            <td className="py-1.5 pr-4 text-[#232D42]">{t.title}</td>
                            <td className="py-1.5 text-gray-500">{t.reason || "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AggTable({ rows, view }: { rows: AggRow[] | null; view: "week" | "month" }) {
  const s = useMemo(() => {
    const rs = (rows || []).filter((r) => r.daysPresent > 0);
    return { active: rs.length, days: rs.reduce((a, r) => a + r.daysPresent, 0), worked: rs.reduce((a, r) => a + r.workedMin, 0), done: rs.reduce((a, r) => a + r.doneCount, 0) };
  }, [rows]);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Active people", s.active, "#232D42"], [`Days present · ${view}`, s.days, "#232D42"], ["Total hours", fmtDur(s.worked), "#3A57E8"], ["Tasks done", s.done, "#1AA053"]].map(([lbl, val, col]) => (
          <div key={lbl as string} className="bg-white border border-gray-100 rounded-xl px-4 py-3"><div className="text-[12px] text-gray-500">{lbl}</div><div className="text-[22px] font-semibold" style={{ color: col as string }}>{val}</div></div>
        ))}
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mt-3">
        <div className="grid grid-cols-[minmax(0,2fr)_1fr_1.2fr_1fr_1fr] items-center gap-x-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
          <span>Person</span><span className="text-center">Days present</span><span>Total worked</span><span className="text-center">Tasks done</span><span>Last login</span>
        </div>
        {rows == null ? <div className="px-4 py-8 text-center text-[13px] text-gray-400">Loading…</div>
         : rows.map((r) => {
          const av = AV[r.key] || { bg: "#EEF1F5", fg: "#46505F" };
          return (
            <div key={r.key} className="grid grid-cols-[minmax(0,2fr)_1fr_1.2fr_1fr_1fr] items-center gap-x-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0" style={{ background: av.bg, color: av.fg }}>{r.name[0]}</span>
                <span className="min-w-0"><span className="block text-[13.5px] font-medium text-[#232D42] truncate">{r.name}</span><span className="block text-[11px] text-gray-400 truncate">{r.role}</span></span>
              </span>
              <span className="text-[13px] text-center text-[#232D42]">{r.daysPresent}</span>
              <span className="text-[13px] font-medium text-[#232D42]">{r.workedMin ? fmtDur(r.workedMin) : <span className="text-gray-300 font-normal">—</span>}</span>
              <span className="text-[13px] text-center text-[#232D42]">{r.doneCount}</span>
              <span className="text-[13px] text-gray-500">{r.lastLoginAt || <span className="text-gray-300">—</span>}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
