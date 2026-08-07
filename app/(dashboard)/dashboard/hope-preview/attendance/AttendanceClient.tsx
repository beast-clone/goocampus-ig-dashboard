"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { IconLogin, IconLogout, IconClock, IconChevronRight, IconRefresh, IconLock, IconCalendar } from "@tabler/icons-react";

type Row = {
  key: string; name: string; role: string;
  loginMin: number | null; loginAt: string | null;
  logoutMin: number | null; logoutAt: string | null;
  rolled: { title: string; reason: string }[];
  doneToday: number; pending: number;
};

const AV: Record<string, { bg: string; fg: string }> = {
  manya: { bg: "#F4E4D6", fg: "#993C1D" }, praveen: { bg: "#F7D9CE", fg: "#993C1D" },
  nikhil: { bg: "#B5D4F4", fg: "#0C447C" }, nandu: { bg: "#CECBF6", fg: "#3C3489" },
  maheen: { bg: "#C0DD97", fg: "#27500A" },
};
const LUNCH_START = 240, LUNCH_END = 300, DAY_MINS = 600;
const nowMin = () => { const d = new Date(); return Math.max(0, Math.min(d.getHours() * 60 + d.getMinutes() - 540, DAY_MINS)); };
const fmtDur = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`; };
// Worked time NET of the protected 1–2 PM lunch.
function workedNet(loginMin: number | null, logoutMin: number | null): number | null {
  if (loginMin == null) return null;
  const end = logoutMin ?? nowMin();
  if (end <= loginMin) return 0;
  const overlap = Math.max(0, Math.min(end, LUNCH_END) - Math.max(loginMin, LUNCH_START));
  return Math.max(0, end - loginMin - overlap);
}
const statusOf = (r: Row): "working" | "out" | "absent" =>
  r.loginMin == null ? "absent" : r.logoutMin != null ? "out" : "working";
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function AttendanceClient({ isAdmin }: { isAdmin: boolean }) {
  return (
    <HopeDashboardShell active="my-workspace" title="Attendance" hideAccountPicker hideRange
      subtitle="Who logged in, when they left, and what they did today — admin only.">
      {() => (isAdmin ? <Board /> : (
        <div className="hope-scope">
          <div className="bg-white border border-gray-100 rounded-2xl px-6 py-12 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-400 mb-3"><IconLock size={20} /></div>
            <div className="text-[15px] font-semibold text-[#232D42]">Admins only</div>
            <div className="text-[13px] text-gray-500 mt-1">This attendance board is visible to admins.</div>
          </div>
        </div>
      ))}
    </HopeDashboardShell>
  );
}

function Board() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const load = useCallback(() => {
    fetch(`/api/my-day/attendance?date=${date}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => { setRows(d.rows || []); setFetchedAt(new Date()); })
      .catch(() => setRows([]));
  }, [date]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const summary = useMemo(() => {
    const rs = rows || [];
    return {
      in: rs.filter((r) => r.loginMin != null).length,
      working: rs.filter((r) => statusOf(r) === "working").length,
      out: rs.filter((r) => statusOf(r) === "out").length,
      absent: rs.filter((r) => statusOf(r) === "absent").length,
      total: rs.length,
    };
  }, [rows]);

  const isToday = date === todayStr();
  return (
    <div className="hope-scope space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[15px] font-medium text-[#232D42]">
          {new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {isToday && <span className="text-[13px] text-gray-400 font-normal"> · today</span>}
        </div>
        <label className="relative inline-flex items-center gap-1 text-[12px] text-brand border border-brand/40 rounded-lg px-2.5 py-1.5 hover:bg-brand-light cursor-pointer">
          <IconCalendar size={13} /> Change date
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        {isToday && <span className="text-[11px] font-medium rounded-full px-2.5 py-1 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Live{fetchedAt ? ` · updated ${fetchedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</span>}
        <button onClick={load} className="ml-auto text-[12px] text-brand inline-flex items-center gap-1 border border-brand/40 rounded-lg px-2.5 py-1.5 hover:bg-brand-light"><IconRefresh size={13} /> Refresh</button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Logged in", `${summary.in}/${summary.total}`, "#232D42"], ["Working now", summary.working, "#1AA053"], ["Logged out", summary.out, "#232D42"], ["Not in yet", summary.absent, "#D97706"]].map(([lbl, val, col]) => (
          <div key={lbl as string} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
            <div className="text-[12px] text-gray-500">{lbl}</div>
            <div className="text-[22px] font-semibold" style={{ color: col as string }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_0.8fr_0.9fr_1.1fr] items-center gap-x-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
          <span>Person</span><span>In</span><span>Out</span><span>Worked</span><span className="text-center">Done</span><span className="text-center">Pending</span><span>Status</span>
        </div>
        {rows == null ? (
          <div className="px-4 py-8 text-center text-[13px] text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-gray-400">No attendance recorded for this day.</div>
        ) : rows.map((r) => {
          const st = statusOf(r);
          const worked = workedNet(r.loginMin, r.logoutMin);
          const av = AV[r.key] || { bg: "#EEF1F5", fg: "#46505F" };
          const open = expanded === r.key;
          const hasDetail = r.rolled.length > 0;
          return (
            <div key={r.key} className="border-b border-gray-50 last:border-0">
              <button onClick={() => hasDetail && setExpanded(open ? null : r.key)}
                className={`w-full text-left grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_0.8fr_0.9fr_1.1fr] items-center gap-x-3 px-4 py-3 ${hasDetail ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}>
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0" style={{ background: av.bg, color: av.fg }}>{r.name[0]}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-[#232D42] truncate">{r.name}</span>
                    <span className="block text-[11px] text-gray-400 truncate">{r.role}</span>
                  </span>
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
                <div className="px-4 pb-3 pt-0">
                  <div className="bg-gray-50 rounded-lg px-3.5 py-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Rolled to tomorrow · {r.rolled.length}</div>
                    <div className="flex flex-col gap-1.5">
                      {r.rolled.map((t, i) => (
                        <div key={i} className="text-[12.5px] text-[#232D42] flex items-baseline gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <span>{t.title}{t.reason ? <span className="text-gray-400"> — {t.reason}</span> : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[11px] text-gray-400 flex items-center gap-1.5"><IconLogin size={12} /> Login = when a teammate opens their My Day · <IconClock size={12} /> Worked is net of the 1-hour lunch.</div>
    </div>
  );
}
