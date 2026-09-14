"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { estimateTaskMinutes } from "@/lib/task-estimate";
import { IconUsersGroup, IconRefresh, IconAlertTriangle, IconArrowRight, IconClock, IconChecks, IconLayoutList } from "@tabler/icons-react";

// Team Command — the admin's cockpit. One glance at the whole team: who's in, what
// each person's workload + plan is, and anything running long. All data is reused
// from existing endpoints (no new backend): /api/my-day/attendance (day view) for
// attendance + per-person task lists + done/pending, and /api/my-day for the
// whole-team task set that powers workload (estimateTaskMinutes) and run-long timing.

type AttTask = { title: string; status: string; type: string; note: string; publishingDate: string };
type AttRow = { key: string; name: string; role: string; loginAt: string | null; loginMin: number | null; logoutAt: string | null; logoutMin: number | null; doneToday: number; pending: number; tasks: AttTask[] };
type MyDayTask = { id: string; title: string; status: string; due: string; detail: { typeLine: string; owner: string; priority: string; startAt: string; endAt: string; duration?: number } };

const ROSTER = [
  { key: "manya", name: "Manya", role: "Content writer", color: "#E0791F", av: "M" },
  { key: "praveen", name: "Praveen", role: "Designer", color: "#C2410C", av: "P" },
  { key: "nikhil", name: "Nikhil", role: "Video editor", color: "#2F6DE0", av: "N" },
  { key: "nandu", name: "Nandu", role: "Video editor", color: "#0F9D58", av: "Nd" },
];
const CAP_MIN = 420; // 7h net working capacity per person per day
const IN_PROGRESS = "Output - In Progress";

const todayYMD = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const plannedFor = (t: MyDayTask) => (t.detail.duration && t.detail.duration > 0 ? t.detail.duration : estimateTaskMinutes(t.detail.typeLine));
const elapsedMin = (startAt: string) => Math.max(0, Math.round((Date.now() - new Date(startAt).getTime()) / 60000));
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);

// A task is "running long" if it's actively in progress and has eaten >25% past its
// estimate, or it was started on an earlier day and still isn't done ("stuck").
function runLong(t: MyDayTask, today: string): { over: number; stuck: boolean } | null {
  if (!t.detail.startAt || t.status !== IN_PROGRESS) return null;
  const startDay = String(t.detail.startAt).slice(0, 10);
  const stuck = startDay < today;
  const el = elapsedMin(t.detail.startAt);
  const planned = plannedFor(t);
  if (stuck) return { over: Math.max(0, el - planned), stuck: true };
  if (el > planned * 1.25) return { over: el - planned, stuck: false };
  return null;
}

export function TeamCommand() {
  const [att, setAtt] = useState<AttRow[] | null>(null);
  const [tasks, setTasks] = useState<MyDayTask[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  // Date is formatted client-side only — server vs browser en-GB output differs
  // (comma placement), which would trip a hydration mismatch if SSR'd.
  const [dateStr, setDateStr] = useState("");
  useEffect(() => { setDateStr(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })); }, []);

  const load = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([
        fetch("/api/my-day/attendance?view=day", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { rows: [] })),
        fetch("/api/my-day", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { tasks: [] })),
      ]);
      setAtt((a.rows || []) as AttRow[]);
      setTasks((m.tasks || []) as MyDayTask[]);
      setFetchedAt(new Date());
    } catch { /* keep last */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const today = todayYMD();
  const people = useMemo(() => ROSTER.map((p) => {
    const a = (att || []).find((r) => r.key === p.key);
    const mine = (tasks || []).filter((t) => (t.detail.owner || "").toLowerCase() === p.name.toLowerCase());
    const plannedMin = mine.reduce((s, t) => s + plannedFor(t), 0);
    const current = mine.find((t) => t.status === IN_PROGRESS && t.detail.startAt) || null;
    const longs = mine.map((t) => ({ t, rl: runLong(t, today) })).filter((x) => x.rl) as { t: MyDayTask; rl: { over: number; stuck: boolean } }[];
    const overdue = mine.filter((t) => t.due && t.due < today).length;
    const present = !!a?.loginAt && !a?.logoutAt;
    return {
      ...p,
      loginAt: a?.loginAt || null, logoutAt: a?.logoutAt || null, present, absent: !a?.loginAt,
      pending: a?.pending ?? mine.length, done: a?.doneToday ?? 0,
      plannedMin, pct: Math.min(100, Math.round((plannedMin / CAP_MIN) * 100)), over: plannedMin > CAP_MIN,
      current, longs, overdue, taskList: a?.tasks || [],
    };
  }), [att, tasks, today]);

  const team = useMemo(() => ({
    present: people.filter((p) => p.present).length,
    pending: people.reduce((s, p) => s + p.pending, 0),
    overdue: people.reduce((s, p) => s + p.overdue, 0),
    longs: people.reduce((s, p) => s + p.longs.length, 0),
  }), [people]);

  return (
    <main className="tcmd">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* HERO */}
      <div className="tc-hero">
        <div>
          <div className="tc-h1"><IconUsersGroup size={22} stroke={1.7} /> Team Command</div>
          <div className="tc-sub">{dateStr} · <span className="tc-live">● live</span>{fetchedAt ? ` · updated ${fetchedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
        </div>
        <div className="tc-hstats">
          <div className="tc-stat"><div className="n">{team.present}<span className="of">/{ROSTER.length}</span></div><div className="k">In now</div></div>
          <div className="tc-stat"><div className="n">{team.pending}</div><div className="k">Pending</div></div>
          <div className={`tc-stat ${team.overdue ? "warn" : ""}`}><div className="n">{team.overdue}</div><div className="k">Overdue</div></div>
          <div className={`tc-stat ${team.longs ? "danger" : ""}`}><div className="n">{team.longs}</div><div className="k">Running long</div></div>
          <button className="tc-refresh" onClick={load} title="Refresh"><IconRefresh size={16} stroke={1.8} className={loading ? "spin" : ""} /></button>
        </div>
      </div>

      {/* RUNNING-LONG BANNER */}
      {team.longs > 0 && (
        <div className="tc-alert">
          <IconAlertTriangle size={16} stroke={1.9} />
          <span><b>{team.longs}</b> task{team.longs > 1 ? "s are" : " is"} running longer than planned — {people.filter((p) => p.longs.length).map((p) => p.name).join(", ")}.</span>
        </div>
      )}

      {/* PEOPLE */}
      <div className="tc-grid">
        {people.map((p) => (
          <div key={p.key} className={`tc-card ${p.longs.length ? "flag" : ""}`}>
            <div className="tc-top">
              <div className="tc-av" style={{ background: p.color }}>{p.av}</div>
              <div className="tc-who">
                <div className="tc-name">{p.name}</div>
                <div className="tc-role">{p.role}</div>
              </div>
              <div className={`tc-pill ${p.present ? "in" : p.absent ? "off" : "out"}`}>
                {p.present ? `In · ${p.loginAt}` : p.absent ? "Not in yet" : `Left · ${p.logoutAt}`}
              </div>
            </div>

            {/* Workload */}
            <div className="tc-wl">
              <div className="tc-wl-top"><span>Workload today</span><span className={p.over ? "over" : ""}>{fmtDur(p.plannedMin)} / 7h{p.over ? " · over" : ""}</span></div>
              <div className="tc-bar"><div className={`tc-fill ${p.over ? "over" : p.pct > 80 ? "high" : ""}`} style={{ width: `${Math.max(3, p.pct)}%` }} /></div>
            </div>

            {/* Counts */}
            <div className="tc-counts">
              <div className="tc-c"><IconLayoutList size={14} stroke={1.8} /> {p.pending} pending</div>
              <div className="tc-c"><IconChecks size={14} stroke={1.8} /> {p.done} done today</div>
              {p.overdue > 0 && <div className="tc-c warn"><IconAlertTriangle size={14} stroke={1.8} /> {p.overdue} overdue</div>}
            </div>

            {/* Now working */}
            <div className="tc-now">
              {p.current ? (
                <>
                  <div className="tc-now-lbl"><IconClock size={13} stroke={1.9} /> Working on now</div>
                  <div className="tc-now-task">{p.current.title}</div>
                  {(() => { const rl = runLong(p.current, today); return rl ? (
                    <div className="tc-long">{rl.stuck ? "⚠ Stuck since a previous day" : `⚠ ${fmtDur(rl.over)} over the ${fmtDur(plannedFor(p.current))} estimate`}</div>
                  ) : (
                    <div className="tc-ok">On track · {fmtDur(elapsedMin(p.current.detail.startAt))} in</div>
                  ); })()}
                </>
              ) : (
                <div className="tc-idle">{p.present ? "No task in progress right now" : p.absent ? "—" : "Day ended"}</div>
              )}
            </div>

            {/* Extra running-long tasks beyond the current one */}
            {p.longs.filter((x) => x.t.id !== p.current?.id).length > 0 && (
              <div className="tc-longlist">
                {p.longs.filter((x) => x.t.id !== p.current?.id).map((x) => (
                  <div key={x.t.id} className="tc-longitem">⚠ {x.t.title} — {x.rl.stuck ? "stuck" : `${fmtDur(x.rl.over)} over`}</div>
                ))}
              </div>
            )}

            <Link className="tc-view" href={`/dashboard/preview/my-day?person=${p.key}`}>View their day <IconArrowRight size={14} stroke={1.9} /></Link>
          </div>
        ))}
      </div>

      {loading && !att && <div className="tc-loading">Loading the team…</div>}
    </main>
  );
}

const CSS = `
.tcmd{--brand:#3A57E8;--brand-ink:#2138B0;--brand-soft:#E9ECFB;--ink:#232D42;--soft:#8A92A6;--line:#EEF0F4;--panel:#fff;--canvas:#F6F7FB;
  flex:1;min-width:0;height:100vh;overflow-y:auto;background:var(--canvas);padding:22px 26px 60px;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.tcmd *{box-sizing:border-box}
.tcmd .tc-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 20px;flex-wrap:wrap}
.tcmd .tc-h1{display:flex;align-items:center;gap:9px;font-size:1.35rem;font-weight:600;color:var(--ink)}
.tcmd .tc-h1 svg{color:var(--brand)}
.tcmd .tc-sub{font-size:.82rem;color:var(--soft);margin-top:3px}
.tcmd .tc-live{color:#1AA053}
.tcmd .tc-hstats{display:flex;align-items:center;gap:20px}
.tcmd .tc-stat{text-align:center;min-width:52px}
.tcmd .tc-stat .n{font-size:1.5rem;font-weight:600;color:var(--ink);line-height:1}
.tcmd .tc-stat .of{font-size:.9rem;color:var(--soft);font-weight:500}
.tcmd .tc-stat .k{font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--soft);margin-top:4px;font-weight:600}
.tcmd .tc-stat.warn .n{color:#B0203A}
.tcmd .tc-stat.danger .n{color:#C0392B}
.tcmd .tc-refresh{border:1px solid var(--line);background:var(--panel);border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--soft);cursor:pointer}
.tcmd .tc-refresh:hover{color:var(--brand);border-color:var(--brand-soft)}
.tcmd .spin{animation:tcspin 1s linear infinite}
@keyframes tcspin{to{transform:rotate(360deg)}}
.tcmd .tc-alert{display:flex;align-items:center;gap:9px;margin-top:14px;background:#FFF4F3;border:1px solid #F6D6D2;border-left:3px solid #C0392B;border-radius:12px;padding:10px 14px;font-size:.84rem;color:#8A2B22}
.tcmd .tc-alert svg{color:#C0392B;flex-shrink:0}
.tcmd .tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;margin-top:16px}
.tcmd .tc-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px;display:flex;flex-direction:column;gap:12px}
.tcmd .tc-card.flag{border-color:#F1C9C4}
.tcmd .tc-top{display:flex;align-items:center;gap:11px}
.tcmd .tc-av{width:40px;height:40px;border-radius:11px;color:#fff;font-weight:600;font-size:.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.tcmd .tc-who{flex:1;min-width:0}
.tcmd .tc-name{font-size:.98rem;font-weight:600;color:var(--ink)}
.tcmd .tc-role{font-size:.74rem;color:var(--soft)}
.tcmd .tc-pill{font-size:.68rem;font-weight:600;padding:4px 9px;border-radius:99px;white-space:nowrap}
.tcmd .tc-pill.in{background:#E4F6EC;color:#127A43}
.tcmd .tc-pill.out{background:#F1EFE8;color:#7A6C48}
.tcmd .tc-pill.off{background:#F5F1F1;color:#9A6763}
.tcmd .tc-wl-top{display:flex;justify-content:space-between;font-size:.74rem;color:var(--soft);margin-bottom:5px}
.tcmd .tc-wl-top .over{color:#C0392B;font-weight:600}
.tcmd .tc-bar{height:7px;border-radius:99px;background:#EFF1F6;overflow:hidden}
.tcmd .tc-fill{height:100%;border-radius:99px;background:var(--brand);transition:width .3s}
.tcmd .tc-fill.high{background:#E0791F}
.tcmd .tc-fill.over{background:#C0392B}
.tcmd .tc-counts{display:flex;flex-wrap:wrap;gap:12px;font-size:.76rem;color:var(--ink)}
.tcmd .tc-c{display:flex;align-items:center;gap:4px;color:#4A5468}
.tcmd .tc-c svg{color:var(--soft)}
.tcmd .tc-c.warn{color:#B0203A}
.tcmd .tc-c.warn svg{color:#B0203A}
.tcmd .tc-now{background:var(--canvas);border:1px solid var(--line);border-radius:10px;padding:9px 11px}
.tcmd .tc-now-lbl{display:flex;align-items:center;gap:5px;font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);font-weight:600;margin-bottom:4px}
.tcmd .tc-now-task{font-size:.85rem;font-weight:500;color:var(--ink)}
.tcmd .tc-long{font-size:.74rem;color:#C0392B;font-weight:600;margin-top:4px}
.tcmd .tc-ok{font-size:.74rem;color:#127A43;margin-top:4px}
.tcmd .tc-idle{font-size:.8rem;color:var(--soft)}
.tcmd .tc-longlist{display:flex;flex-direction:column;gap:3px}
.tcmd .tc-longitem{font-size:.73rem;color:#8A2B22}
.tcmd .tc-view{display:inline-flex;align-items:center;gap:5px;font-size:.8rem;font-weight:600;color:var(--brand);text-decoration:none;margin-top:2px}
.tcmd .tc-view:hover{color:var(--brand-ink)}
.tcmd .tc-loading{text-align:center;color:var(--soft);padding:40px;font-size:.9rem}
@media(max-width:600px){.tcmd{padding:16px 14px 40px}.tcmd .tc-hstats{gap:14px}}
`;
