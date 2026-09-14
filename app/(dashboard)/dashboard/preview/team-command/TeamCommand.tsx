"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { estimateTaskMinutes } from "@/lib/task-estimate";
import { IconUsersGroup, IconRefresh, IconAlertTriangle, IconArrowRight, IconClock, IconChecks, IconLayoutList, IconExternalLink, IconCalendarDue } from "@tabler/icons-react";
import { LoadingBlock } from "@/components/LoadingBlock";

// Team Command — the admin's cockpit. A master–detail report: pick a person on the
// left rail, see their full day on the right — attendance, workload, and their whole
// task list (each row opens that task). All data reused from existing endpoints:
// /api/my-day/attendance (day view → attendance + done count) and /api/my-day
// (whole-team tasks with ids, owner, status, duration, startAt → workload, run-long,
// and the clickable task list). No new backend.

type AttRow = { key: string; name: string; role: string; loginAt: string | null; logoutAt: string | null; doneToday: number };
type MyDayTask = { id: string; title: string; status: string; due: string; detail: { typeLine: string; owner: string; priority: string; brand: string; startAt: string; endAt: string; duration?: number } };
type DateReq = { postId: string; title: string; type?: string; owner?: string; createdAt?: string; creator?: string; from: string | null; to: string | null; reason?: string; requestedBy: string };

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
const fmtDue = (d: string) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); };
const fmtFull = (d?: string | null) => (d ? new Date(String(d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");
const fmtWeekday = (d?: string | null) => (d ? new Date(String(d)).toLocaleDateString("en-GB", { weekday: "short" }) : "");
const nameCap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");
const avatarFor = (key?: string): { av: string; color: string } => {
  const p = ROSTER.find((x) => x.key === (key || "").toLowerCase());
  return p ? { av: p.av, color: p.color } : { av: (key || "?").charAt(0).toUpperCase(), color: "#8A92A6" };
};

function runLong(t: MyDayTask, today: string): { over: number; stuck: boolean } | null {
  if (!t.detail.startAt || t.status !== IN_PROGRESS) return null;
  const stuck = String(t.detail.startAt).slice(0, 10) < today;
  const el = elapsedMin(t.detail.startAt), planned = plannedFor(t);
  if (stuck) return { over: Math.max(0, el - planned), stuck: true };
  if (el > planned * 1.25) return { over: el - planned, stuck: false };
  return null;
}
// Status → pill colour. Keeps the same vocabulary as the Master sheet.
function statusStyle(s: string): { bg: string; fg: string } {
  const t = s.toLowerCase();
  if (t.includes("in progress")) return { bg: "#E9ECFB", fg: "#2138B0" };
  if (t.includes("approved")) return { bg: "#E4F6EC", fg: "#127A43" };
  if (t.includes("pending")) return { bg: "#FBEEDD", fg: "#9A5B10" };
  if (t.includes("feedback")) return { bg: "#FDECEC", fg: "#B0203A" };
  if (t.includes("ready")) return { bg: "#E7F0FF", fg: "#1B4FA0" };
  return { bg: "#F1EFE8", fg: "#6B6350" };
}
// Sort a person's tasks: in-progress first, then overdue, then by due date.
function orderTasks(list: MyDayTask[], today: string): MyDayTask[] {
  const rank = (t: MyDayTask) => (t.status === IN_PROGRESS ? 0 : t.due && t.due < today ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.due || "9999").localeCompare(b.due || "9999"));
}

// ── Today's plan timeline ──────────────────────────────────────────────────────
// Lay a person's pending work into the 9 AM–6 PM day (minutes from 9 AM) around the
// pinned 1–2 PM lunch — the same model as the Marketing Hub Workload timeline. Work
// past 6 PM "spills over" to another day. Mirrors buildDayPlan (MarketingHub.tsx).
const SPAN = 540, DAY_END = 540, LUNCH_AT = 240, LUNCH_DUR = 60; // 9AM–6PM · lunch 1–2PM
const TICKS = ["9 AM", "10", "11", "12", "1 PM", "2", "3", "4", "5"];
type Blk = { kind: "task" | "lunch" | "free"; label: string; dur: number; start: number; type?: string };
function typeColor(type?: string): string {
  const t = (type || "").toLowerCase();
  if (/thumbnail|poster|design|graphic/.test(t)) return "#E0791F";
  if (/carousel/.test(t)) return "#2F6DE0";
  if (/reel|short|story|video|youtube|long-form/.test(t)) return "#7C5CE6";
  return "#3A57E8";
}
function buildPlan(tasks: MyDayTask[]): { blocks: Blk[]; overflow: number; freeMin: number } {
  const queue = [...tasks].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const blocks: Blk[] = [];
  const LUNCH_END = LUNCH_AT + LUNCH_DUR;
  let cur = 0, lunchDone = false, overflow = 0;
  const pushLunch = () => { blocks.push({ kind: "lunch", label: "Lunch", dur: LUNCH_DUR, start: LUNCH_AT }); cur = LUNCH_END; lunchDone = true; };
  for (const t of queue) {
    if (cur >= DAY_END) { overflow++; continue; }
    let remaining = plannedFor(t);
    const label = t.title, type = t.detail.typeLine;
    if (!lunchDone && cur >= LUNCH_AT && cur < LUNCH_END) pushLunch();
    if (!lunchDone && cur < LUNCH_AT) {
      const before = Math.min(remaining, LUNCH_AT - cur);
      if (before > 0) { blocks.push({ kind: "task", label, dur: before, start: cur, type }); cur += before; remaining -= before; }
      if (remaining > 0) pushLunch();
    }
    if (remaining > 0) {
      if (cur >= DAY_END) { overflow++; continue; }
      const fit = Math.min(remaining, DAY_END - cur);
      blocks.push({ kind: "task", label, dur: fit, start: cur, type }); cur += fit;
      if (fit < remaining) overflow++;
    }
  }
  if (!lunchDone) {
    if (cur < LUNCH_AT) { blocks.push({ kind: "free", label: "Free", dur: LUNCH_AT - cur, start: cur }); cur = LUNCH_AT; }
    pushLunch();
  }
  if (cur < DAY_END) blocks.push({ kind: "free", label: "Free", dur: DAY_END - cur, start: cur });
  const freeMin = blocks.reduce((s, b) => s + (b.kind === "free" ? b.dur : 0), 0);
  return { blocks, overflow, freeMin };
}

export function TeamCommand() {
  const [att, setAtt] = useState<AttRow[] | null>(null);
  const [tasks, setTasks] = useState<MyDayTask[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState("manya");
  const [dateStr, setDateStr] = useState("");
  const [view, setView] = useState<"team" | "approvals">("team");
  const [approvals, setApprovals] = useState<DateReq[]>([]);
  const [apprBusy, setApprBusy] = useState<string | null>(null);
  const [apprNotes, setApprNotes] = useState<Record<string, string>>({}); // approver's note per request
  useEffect(() => { setDateStr(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })); }, []);

  const load = useCallback(async () => {
    try {
      const [a, m, ap] = await Promise.all([
        fetch("/api/my-day/attendance?view=day", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { rows: [] })),
        fetch("/api/my-day", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { tasks: [] })),
        fetch("/api/marketing-hub/date-change", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { requests: [] })),
      ]);
      setAtt((a.rows || []) as AttRow[]);
      setTasks((m.tasks || []) as MyDayTask[]);
      setApprovals((ap.requests || []) as DateReq[]);
      setFetchedAt(new Date());
    } catch { /* keep last */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  // Approve → the new publish date is written to the task; reject → the old date stays.
  // The optional note (a reason on reject, or an instruction on approve) rides along
  // and is sent to the team on both paths.
  const resolveApproval = async (postId: string, action: "approve" | "reject") => {
    setApprBusy(postId + action);
    try {
      await fetch("/api/marketing-hub/date-change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, action, actor: "maheen", note: apprNotes[postId] || "" }) });
      setApprovals((a) => a.filter((r) => r.postId !== postId));
      setApprNotes((n) => { const c = { ...n }; delete c[postId]; return c; });
      load();
    } finally { setApprBusy(null); }
  };

  const today = todayYMD();
  const people = useMemo(() => ROSTER.map((p) => {
    const a = (att || []).find((r) => r.key === p.key);
    const mine = orderTasks((tasks || []).filter((t) => (t.detail.owner || "").toLowerCase() === p.name.toLowerCase()), today);
    const plannedMin = mine.reduce((s, t) => s + plannedFor(t), 0);
    const current = mine.find((t) => t.status === IN_PROGRESS && t.detail.startAt) || null;
    const longs = mine.map((t) => ({ t, rl: runLong(t, today) })).filter((x) => x.rl) as { t: MyDayTask; rl: { over: number; stuck: boolean } }[];
    const overdue = mine.filter((t) => t.due && t.due < today).length;
    const present = !!a?.loginAt && !a?.logoutAt;
    return {
      ...p, loginAt: a?.loginAt || null, logoutAt: a?.logoutAt || null, present, absent: !a?.loginAt,
      pending: mine.length, done: a?.doneToday ?? 0, plannedMin,
      pct: Math.min(100, Math.round((plannedMin / CAP_MIN) * 100)), over: plannedMin > CAP_MIN,
      current, longs, overdue, tasks: mine,
    };
  }), [att, tasks, today]);

  const team = useMemo(() => ({
    present: people.filter((p) => p.present).length,
    pending: people.reduce((s, p) => s + p.pending, 0),
    overdue: people.reduce((s, p) => s + p.overdue, 0),
    longs: people.reduce((s, p) => s + p.longs.length, 0),
  }), [people]);

  const cur = people.find((p) => p.key === sel) || people[0];
  const attLabel = (p: typeof cur) => (p.present ? `In since ${p.loginAt}` : p.absent ? "Not in yet today" : `Left at ${p.logoutAt}`);
  const plan = useMemo(() => buildPlan(cur.tasks), [cur]);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes() - 9 * 60; // minutes since 9 AM
  const nowPct = nowM >= 0 && nowM <= SPAN ? (nowM / SPAN) * 100 : null;

  return (
    <main className="tcmd">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* HERO */}
      <div className="tc-hero">
        <div>
          <div className="tc-h1"><IconUsersGroup size={22} stroke={1.7} /> Team Command</div>
          <div className="tc-sub">{dateStr}{dateStr ? " · " : ""}<span className="tc-live">● live</span>{fetchedAt ? ` · updated ${fetchedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
        </div>
        <div className="tc-hstats">
          <div className="tc-stat"><div className="n">{team.present}<span className="of">/{ROSTER.length}</span></div><div className="k">In now</div></div>
          <div className="tc-stat"><div className="n">{team.pending}</div><div className="k">Pending</div></div>
          <div className={`tc-stat ${team.overdue ? "warn" : ""}`}><div className="n">{team.overdue}</div><div className="k">Overdue</div></div>
          <div className={`tc-stat ${team.longs ? "danger" : ""}`}><div className="n">{team.longs}</div><div className="k">Running long</div></div>
          <button className="tc-refresh" onClick={load} title="Refresh"><IconRefresh size={16} stroke={1.8} className={loading ? "spin" : ""} /></button>
        </div>
      </div>

      {/* In-page tabs: the team cockpit, and the approvals queue (with a badge). */}
      <div className="tc-tabs">
        <button className={`tc-tab ${view === "team" ? "on" : ""}`} onClick={() => setView("team")}>Team</button>
        <button className={`tc-tab ${view === "approvals" ? "on" : ""}`} onClick={() => setView("approvals")}>
          Approvals{approvals.length > 0 && <span className="tc-tab-n">{approvals.length}</span>}
        </button>
      </div>

      {view === "approvals" ? (
        /* APPROVALS — publish-date changes waiting for Maheen */
        approvals.length === 0 ? (
          <div className="tc-appr-empty"><div className="tc-appr-check">✓</div>No approvals needed right now.</div>
        ) : (
          <div className="tc-appr-list">
            {approvals.map((r) => {
              const req = avatarFor(r.requestedBy), own = avatarFor(r.owner);
              return (
              <div key={r.postId} className="tc-appr-card">
                <div className="tc-appr-top">
                  <div className="tc-appr-ico"><IconCalendarDue size={18} stroke={1.8} /></div>
                  <div className="tc-appr-hd">
                    <a className="tc-appr-title" href={`/dashboard/preview/marketing-hub?open=${r.postId}`}>{r.title}</a>
                    <div className="tc-appr-sub">{r.type || "Task"}{r.createdAt ? ` · created ${fmtFull(r.createdAt)}` : ""}</div>
                  </div>
                  <span className="tc-appr-flag">Awaiting you</span>
                </div>

                <div className="tc-appr-dates">
                  <div className="tc-dchip old"><span className="lbl">Currently</span><span className="val">{fmtFull(r.from)}</span><span className="wd">{fmtWeekday(r.from)}</span></div>
                  <div className="tc-dchip-arw"><IconArrowRight size={17} stroke={2} /></div>
                  <div className="tc-dchip new"><span className="lbl">Move to</span><span className="val">{fmtFull(r.to)}</span><span className="wd">{fmtWeekday(r.to)}</span></div>
                </div>

                <div className="tc-appr-people">
                  <div className="tc-ppl"><span className="tc-ppl-av" style={{ background: req.color }}>{req.av}</span><div className="tc-ppl-t"><span className="r">Requested by</span><span className="n">{nameCap(r.requestedBy)}</span></div></div>
                  <div className="tc-ppl"><span className="tc-ppl-av" style={{ background: own.color }}>{own.av}</span><div className="tc-ppl-t"><span className="r">Assigned to</span><span className="n">{nameCap(r.owner)}</span></div></div>
                </div>

                <div className="tc-appr-reason"><span className="rl">Reason</span>{r.reason?.trim() ? r.reason : <span className="muted">not given</span>}</div>

                <div className="tc-appr-note">
                  <label>Your note <span className="opt">— reason if rejecting, or an instruction (optional)</span></label>
                  <textarea rows={2} value={apprNotes[r.postId] || ""} onChange={(e) => setApprNotes((n) => ({ ...n, [r.postId]: e.target.value }))} placeholder="e.g. Fine, but sync the caption with the new date · or: Keep 20th — the campaign can't slip." />
                </div>

                <div className="tc-appr-foot">
                  <button className="tc-btn ghost" disabled={!!apprBusy} onClick={() => resolveApproval(r.postId, "reject")}>{apprBusy === r.postId + "reject" ? "Rejecting…" : "Reject"}</button>
                  <button className="tc-btn primary" disabled={!!apprBusy} onClick={() => resolveApproval(r.postId, "approve")}>{apprBusy === r.postId + "approve" ? "Approving…" : "Approve"}</button>
                </div>
              </div>
            ); })}
          </div>
        )
      ) : (
      /* MASTER–DETAIL */
      <div className="tc-layout">
        {/* Rail — choose a person */}
        <aside className="tc-rail">
          <div className="tc-rail-h">Team</div>
          {people.map((p) => (
            <button key={p.key} className={`tc-railitem ${p.key === sel ? "on" : ""}`} onClick={() => setSel(p.key)}>
              <span className="tc-av sm" style={{ background: p.color }}>{p.av}</span>
              <span className="tc-rail-who">
                <span className="tc-rail-name">{p.name}{p.longs.length > 0 && <IconAlertTriangle size={13} stroke={2} className="tc-flagicon" />}</span>
                <span className="tc-rail-sub">{p.pending} pending{p.overdue ? ` · ${p.overdue} overdue` : ""}</span>
              </span>
              <span className={`tc-dot ${p.present ? "in" : p.absent ? "off" : "out"}`} title={attLabel(p)} />
            </button>
          ))}
        </aside>

        {/* Detail — the selected person's full day */}
        <section className="tc-detail">
          <div className="tc-d-head">
            <span className="tc-av lg" style={{ background: cur.color }}>{cur.av}</span>
            <div className="tc-d-id">
              <div className="tc-d-name">{cur.name}</div>
              <div className="tc-d-role">{cur.role}</div>
            </div>
            <div className={`tc-attend ${cur.present ? "in" : cur.absent ? "off" : "out"}`}>
              <span className="tc-attend-dot" /> {attLabel(cur)}
            </div>
            <Link className="tc-openday" href={`/dashboard/preview/my-day?person=${cur.key}`}>Open full My Day <IconExternalLink size={14} stroke={1.8} /></Link>
          </div>

          {/* Stat strip */}
          <div className="tc-d-stats">
            <div className="tc-ds"><div className="v">{fmtDur(cur.plannedMin)}<span className="cap"> / 7h</span></div><div className="l">Workload</div><div className="tc-bar"><div className={`tc-fill ${cur.over ? "over" : cur.pct > 80 ? "high" : ""}`} style={{ width: `${Math.max(3, cur.pct)}%` }} /></div></div>
            <div className="tc-ds"><div className="v">{cur.pending}</div><div className="l">Pending</div></div>
            <div className="tc-ds"><div className="v">{cur.done}</div><div className="l">Done today</div></div>
            <div className={`tc-ds ${cur.overdue ? "warn" : ""}`}><div className="v">{cur.overdue}</div><div className="l">Overdue</div></div>
            <div className={`tc-ds ${cur.longs.length ? "danger" : ""}`}><div className="v">{cur.longs.length}</div><div className="l">Running long</div></div>
          </div>

          {/* Working now */}
          <div className="tc-nowbar">
            {cur.current ? (() => { const rl = runLong(cur.current!, today); return (
              <>
                <span className="tc-now-lbl"><IconClock size={13} stroke={1.9} /> Now</span>
                {/* Plain <a> (full nav) — the Marketing Hub opens the task modal from
                    ?open= on load; a client-side Link doesn't re-trigger that fetch. */}
                <a href={`/dashboard/preview/marketing-hub?open=${cur.current!.id}`} className="tc-now-task">{cur.current!.title}</a>
                {rl
                  ? <span className="tc-long">{rl.stuck ? "Stuck since a previous day" : `${fmtDur(rl.over)} over the ${fmtDur(plannedFor(cur.current!))} estimate`}</span>
                  : <span className="tc-ok">{fmtDur(elapsedMin(cur.current!.detail.startAt))} in · on track</span>}
              </>
            ); })() : <span className="tc-idle"><IconClock size={13} stroke={1.9} /> {cur.present ? "No task in progress right now" : cur.absent ? "Not in yet today" : "Day ended"}</span>}
          </div>

          {/* Today's plan — how their pending work fills the 9–6 day */}
          <div className="tc-plan-h">
            <span><IconCalendarDue size={14} stroke={1.8} /> Today&apos;s plan</span>
            <span className="tc-plan-sum">{fmtDur(cur.plannedMin)} of 8h{plan.overflow > 0 ? ` · ${plan.overflow} spill over` : plan.freeMin > 0 ? ` · ${fmtDur(plan.freeMin)} free` : " · full"}</span>
          </div>
          <div className="tc-ticks">{TICKS.map((t, i) => <span key={i}>{t}</span>)}</div>
          <div className="tc-track">
            {plan.blocks.map((b, i) => {
              const style = { left: `${(b.start / SPAN) * 100}%`, width: `${(b.dur / SPAN) * 100}%` };
              if (b.kind === "lunch") return <div key={i} className="tc-blk lunch" style={style} title="Lunch · 1–2 PM" />;
              if (b.kind === "free") return <div key={i} className="tc-blk free" style={style} title={`Free · ${fmtDur(b.dur)}`} />;
              return <div key={i} className="tc-blk task" style={{ ...style, background: typeColor(b.type) }} title={`${b.label} · ${b.type} · ${fmtDur(b.dur)}`}><span>{b.label}</span></div>;
            })}
            {nowPct != null && <div className="tc-nowline" style={{ left: `${nowPct}%` }} />}
          </div>

          {/* Task list — clickable */}
          <div className="tc-tasks-h"><IconLayoutList size={15} stroke={1.8} /> Tasks <span className="tc-count">{cur.tasks.length}</span></div>
          {cur.tasks.length === 0 ? (
            loading ? <LoadingBlock className="!py-4" size={22} /> : <div className="tc-empty">No open tasks right now ✓</div>
          ) : (
            <div className="tc-tasklist">
              {cur.tasks.map((t) => {
                const st = statusStyle(t.status); const overdue = !!t.due && t.due < today; const rl = runLong(t, today);
                return (
                  <a key={t.id} href={`/dashboard/preview/marketing-hub?open=${t.id}`} className="tc-taskrow">
                    <span className="tc-t-main">
                      <span className="tc-t-title">{t.title}</span>
                      <span className="tc-t-meta">{t.detail.typeLine} · {t.detail.brand}</span>
                    </span>
                    <span className="tc-t-right">
                      {rl && <span className="tc-t-flag" title={rl.stuck ? "Stuck since a previous day" : `${fmtDur(rl.over)} over estimate`}><IconAlertTriangle size={12} stroke={2} /></span>}
                      {t.due && <span className={`tc-t-due ${overdue ? "od" : ""}`}><IconCalendarDue size={12} stroke={1.9} /> {fmtDue(t.due)}</span>}
                      <span className="tc-t-status" style={{ background: st.bg, color: st.fg }}>{t.status.replace(/^Output - |^Content - /, "")}</span>
                      <IconArrowRight size={14} stroke={1.8} className="tc-t-go" />
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </div>
      )}
    </main>
  );
}

const CSS = `
.tcmd{--brand:#3A57E8;--brand-ink:#2138B0;--brand-soft:#E9ECFB;--ink:#232D42;--soft:#8A92A6;--line:#EEF0F4;--panel:#fff;--canvas:#F6F7FB;
  flex:1;min-width:0;height:100vh;overflow-y:auto;background:var(--canvas);padding:22px 26px 60px;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.tcmd *{box-sizing:border-box}
.tcmd .tc-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 20px;flex-wrap:wrap}
.tcmd .tc-h1{display:flex;align-items:center;gap:9px;font-size:1.35rem;font-weight:600}
.tcmd .tc-h1 svg{color:var(--brand)}
.tcmd .tc-sub{font-size:.82rem;color:var(--soft);margin-top:3px}
.tcmd .tc-live{color:#1AA053}
.tcmd .tc-hstats{display:flex;align-items:center;gap:20px}
.tcmd .tc-stat{text-align:center;min-width:50px}
.tcmd .tc-stat .n{font-size:1.5rem;font-weight:600;line-height:1}
.tcmd .tc-stat .of{font-size:.9rem;color:var(--soft);font-weight:500}
.tcmd .tc-stat .k{font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--soft);margin-top:4px;font-weight:600}
.tcmd .tc-stat.warn .n{color:#B0203A}.tcmd .tc-stat.danger .n{color:#C0392B}
.tcmd .tc-refresh{border:1px solid var(--line);background:var(--panel);border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--soft);cursor:pointer}
.tcmd .tc-refresh:hover{color:var(--brand);border-color:var(--brand-soft)}
.tcmd .spin{animation:tcspin 1s linear infinite}@keyframes tcspin{to{transform:rotate(360deg)}}

.tcmd .tc-tabs{display:flex;gap:4px;margin-top:16px;border-bottom:1px solid var(--line)}
.tcmd .tc-tab{border:none;background:none;font-family:inherit;font-size:.86rem;font-weight:600;color:var(--soft);padding:9px 14px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:inline-flex;align-items:center;gap:7px}
.tcmd .tc-tab:hover{color:var(--ink)}
.tcmd .tc-tab.on{color:var(--brand);border-bottom-color:var(--brand)}
.tcmd .tc-tab-n{background:#E24B4A;color:#fff;font-size:.62rem;font-weight:700;border-radius:99px;min-width:17px;height:17px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center}
.tcmd .tc-appr-empty{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:44px;text-align:center;color:var(--soft);font-size:.9rem;margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px}
.tcmd .tc-appr-check{width:40px;height:40px;border-radius:50%;background:#E4F6EC;color:#127A43;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700}
.tcmd .tc-appr-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px;margin-top:16px;max-width:1120px}
.tcmd .tc-appr-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px 14px;display:flex;flex-direction:column}
/* header */
.tcmd .tc-appr-top{display:flex;align-items:flex-start;gap:11px}
.tcmd .tc-appr-ico{width:34px;height:34px;border-radius:10px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.tcmd .tc-appr-hd{flex:1;min-width:0}
.tcmd .tc-appr-title{font-size:.95rem;font-weight:600;color:var(--ink);text-decoration:none;display:inline-block}
.tcmd .tc-appr-title:hover{color:var(--brand)}
.tcmd .tc-appr-sub{font-size:.72rem;color:var(--soft);margin-top:1px}
.tcmd .tc-appr-flag{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9A5B10;background:#FBEEDD;border-radius:99px;padding:3px 9px;flex-shrink:0;white-space:nowrap}
/* date change strip */
.tcmd .tc-appr-dates{display:flex;align-items:stretch;gap:0;margin-top:13px;background:var(--canvas);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.tcmd .tc-dchip{flex:1;padding:9px 13px;display:flex;flex-direction:column;gap:1px;min-width:0}
.tcmd .tc-dchip .lbl{font-size:.6rem;text-transform:uppercase;letter-spacing:.05em;color:var(--soft);font-weight:700}
.tcmd .tc-dchip .val{font-size:.9rem;font-weight:600;color:var(--ink);white-space:nowrap}
.tcmd .tc-dchip .wd{font-size:.66rem;color:var(--soft)}
.tcmd .tc-dchip.old .val{color:var(--soft)}
.tcmd .tc-dchip.new{background:#EEF1FE}
.tcmd .tc-dchip.new .val{color:var(--brand-ink)}
.tcmd .tc-dchip.new .lbl{color:var(--brand)}
.tcmd .tc-dchip-arw{display:flex;align-items:center;justify-content:center;padding:0 3px;color:var(--brand);background:linear-gradient(90deg,var(--canvas),#EEF1FE)}
/* people */
.tcmd .tc-appr-people{display:flex;gap:20px;margin-top:12px;flex-wrap:wrap}
.tcmd .tc-ppl{display:flex;align-items:center;gap:8px}
.tcmd .tc-ppl-av{width:26px;height:26px;border-radius:50%;color:#fff;font-size:.66rem;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.tcmd .tc-ppl-t{display:flex;flex-direction:column;line-height:1.25}
.tcmd .tc-ppl-t .r{font-size:.62rem;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);font-weight:600}
.tcmd .tc-ppl-t .n{font-size:.8rem;font-weight:600;color:var(--ink)}
/* reason */
.tcmd .tc-appr-reason{margin-top:13px;background:#FAFBFF;border:1px solid #EEF1FD;border-left:3px solid #C7D0F5;border-radius:0 10px 10px 0;padding:9px 12px;font-size:.8rem;color:#3B4457;line-height:1.5}
.tcmd .tc-appr-reason .rl{display:block;font-size:.6rem;text-transform:uppercase;letter-spacing:.05em;color:var(--brand);font-weight:700;margin-bottom:3px}
.tcmd .tc-appr-reason .muted{color:var(--soft)}
/* approver note */
.tcmd .tc-appr-note{margin-top:12px}
.tcmd .tc-appr-note label{display:block;font-size:.7rem;font-weight:600;color:#3B4457;margin-bottom:5px}
.tcmd .tc-appr-note .opt{font-weight:400;color:var(--soft)}
.tcmd .tc-appr-note textarea{width:100%;resize:vertical;min-height:38px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-family:inherit;font-size:.79rem;color:var(--ink);background:#fff}
.tcmd .tc-appr-note textarea:focus{outline:none;border-color:var(--brand)}
.tcmd .tc-appr-note textarea::placeholder{color:#AEB6C6}
/* footer actions */
.tcmd .tc-appr-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:13px;padding-top:13px;border-top:1px solid var(--line)}
.tcmd .tc-btn{border-radius:9px;padding:8px 18px;font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:inherit;transition:all .12s}
.tcmd .tc-btn.primary{background:var(--brand);color:#fff;box-shadow:0 4px 12px rgba(58,87,232,.22)}
.tcmd .tc-btn.primary:hover{background:var(--brand-ink)}
.tcmd .tc-btn.ghost{background:#fff;color:#647089;border-color:var(--line)}
.tcmd .tc-btn.ghost:hover{color:#C0392B;border-color:#F0D0CE;background:#FDF6F5}
.tcmd .tc-btn:disabled{opacity:.6;cursor:default;box-shadow:none}
.tcmd .tc-layout{display:grid;grid-template-columns:250px 1fr;gap:16px;margin-top:16px;align-items:start}
.tcmd .tc-rail{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:8px}
.tcmd .tc-rail-h{font-size:.6rem;text-transform:uppercase;letter-spacing:.08em;color:var(--soft);font-weight:700;padding:8px 10px 6px}
.tcmd .tc-railitem{display:flex;align-items:center;gap:10px;width:100%;border:none;background:none;text-align:left;padding:9px 10px;border-radius:10px;cursor:pointer;font-family:inherit;margin-bottom:2px}
.tcmd .tc-railitem:hover{background:var(--canvas)}
.tcmd .tc-railitem.on{background:var(--brand-soft)}
.tcmd .tc-railitem.on .tc-rail-name{color:var(--brand-ink)}
.tcmd .tc-rail-who{flex:1;min-width:0;display:flex;flex-direction:column}
.tcmd .tc-rail-name{font-size:.86rem;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:5px}
.tcmd .tc-flagicon{color:#C0392B}
.tcmd .tc-rail-sub{font-size:.7rem;color:var(--soft)}
.tcmd .tc-dot{width:9px;height:9px;border-radius:50%;flex:0 0 9px}
.tcmd .tc-dot.in{background:#22B06B}.tcmd .tc-dot.out{background:#C9A227}.tcmd .tc-dot.off{background:#CDD2DD}

.tcmd .tc-av{color:#fff;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:10px}
.tcmd .tc-av.sm{width:30px;height:30px;font-size:.76rem;border-radius:9px}
.tcmd .tc-av.lg{width:52px;height:52px;font-size:1.15rem;border-radius:13px}

.tcmd .tc-detail{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px;min-width:0}
.tcmd .tc-d-head{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.tcmd .tc-d-id{flex:1;min-width:0}
.tcmd .tc-d-name{font-size:1.15rem;font-weight:600}
.tcmd .tc-d-role{font-size:.8rem;color:var(--soft)}
.tcmd .tc-attend{display:flex;align-items:center;gap:6px;font-size:.78rem;font-weight:600;padding:5px 11px;border-radius:99px}
.tcmd .tc-attend.in{background:#E4F6EC;color:#127A43}
.tcmd .tc-attend.out{background:#FBF4DE;color:#7A6410}
.tcmd .tc-attend.off{background:#F3F4F7;color:#8A92A6}
.tcmd .tc-attend-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.tcmd .tc-openday{display:inline-flex;align-items:center;gap:5px;font-size:.78rem;font-weight:600;color:var(--brand);text-decoration:none;white-space:nowrap}
.tcmd .tc-openday:hover{color:var(--brand-ink)}

.tcmd .tc-d-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:16px}
.tcmd .tc-ds{background:var(--canvas);border-radius:11px;padding:11px 12px}
.tcmd .tc-ds .v{font-size:1.15rem;font-weight:600;color:var(--ink)}
.tcmd .tc-ds .v .cap{font-size:.8rem;color:var(--soft);font-weight:500}
.tcmd .tc-ds .l{font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);font-weight:600;margin-top:2px}
.tcmd .tc-ds.warn .v{color:#B0203A}.tcmd .tc-ds.danger .v{color:#C0392B}
.tcmd .tc-bar{height:5px;border-radius:99px;background:#E7EAF1;overflow:hidden;margin-top:7px}
.tcmd .tc-fill{height:100%;border-radius:99px;background:var(--brand)}
.tcmd .tc-fill.high{background:#E0791F}.tcmd .tc-fill.over{background:#C0392B}

.tcmd .tc-nowbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;background:#F7F9FF;border:1px solid #E7ECFB;border-radius:11px;padding:10px 13px}
.tcmd .tc-now-lbl{display:inline-flex;align-items:center;gap:5px;font-size:.64rem;text-transform:uppercase;letter-spacing:.05em;color:var(--brand);font-weight:700}
.tcmd .tc-now-task{font-size:.9rem;font-weight:600;color:var(--ink);text-decoration:none}
.tcmd .tc-now-task:hover{color:var(--brand)}
.tcmd .tc-long{font-size:.75rem;color:#C0392B;font-weight:600;margin-left:auto}
.tcmd .tc-ok{font-size:.75rem;color:#127A43;margin-left:auto}
.tcmd .tc-idle{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;color:var(--soft)}

.tcmd .tc-plan-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:18px 0 7px}
.tcmd .tc-plan-h>span:first-child{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:600;color:var(--ink)}
.tcmd .tc-plan-h svg{color:var(--soft)}
.tcmd .tc-plan-sum{font-size:.74rem;color:var(--soft);font-weight:500}
.tcmd .tc-ticks{display:flex;font-family:ui-monospace,Menlo,monospace;font-size:.62rem;color:#B4BAC7;margin-bottom:4px;padding:0 1px}
.tcmd .tc-ticks span{flex:1;text-align:left}
.tcmd .tc-track{position:relative;height:76px;border:1px solid #E4E7EF;border-radius:11px;overflow:hidden;background:#F7F8FC}
.tcmd .tc-blk{position:absolute;top:0;bottom:0;border-right:1px solid rgba(255,255,255,.35)}
.tcmd .tc-blk.task{display:flex;align-items:center;padding:0 7px;min-width:0}
.tcmd .tc-blk.task span{font-size:.7rem;font-weight:500;color:#fff;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tcmd .tc-blk.lunch{background:repeating-linear-gradient(45deg,#EAEDF5,#EAEDF5 5px,#DFE3EE 5px,#DFE3EE 10px)}
.tcmd .tc-blk.free{background:repeating-linear-gradient(45deg,#F1F3F8,#F1F3F8 5px,#E7EAF2 5px,#E7EAF2 10px)}
.tcmd .tc-nowline{position:absolute;top:0;bottom:0;width:2px;background:#DC2E2E;z-index:5}
.tcmd .tc-tasks-h{display:flex;align-items:center;gap:7px;font-size:.82rem;font-weight:600;color:var(--ink);margin:18px 0 9px}
.tcmd .tc-tasks-h svg{color:var(--soft)}
.tcmd .tc-count{background:var(--canvas);color:var(--soft);border-radius:99px;padding:1px 8px;font-size:.72rem;font-weight:600}
.tcmd .tc-empty{color:var(--soft);font-size:.85rem;padding:20px 4px}
.tcmd .tc-tasklist{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.tcmd .tc-taskrow{display:flex;align-items:center;gap:12px;padding:11px 13px;text-decoration:none;border-bottom:1px solid var(--line);transition:background .1s}
.tcmd .tc-taskrow:last-child{border-bottom:none}
.tcmd .tc-taskrow:hover{background:var(--canvas)}
.tcmd .tc-t-main{flex:1;min-width:0;display:flex;flex-direction:column}
.tcmd .tc-t-title{font-size:.86rem;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tcmd .tc-t-meta{font-size:.72rem;color:var(--soft)}
.tcmd .tc-t-right{display:flex;align-items:center;gap:9px;flex-shrink:0}
.tcmd .tc-t-flag{color:#C0392B;display:inline-flex}
.tcmd .tc-t-due{display:inline-flex;align-items:center;gap:3px;font-size:.72rem;color:var(--soft);white-space:nowrap}
.tcmd .tc-t-due.od{color:#C0392B;font-weight:600}
.tcmd .tc-t-status{font-size:.68rem;font-weight:600;padding:3px 9px;border-radius:99px;white-space:nowrap}
.tcmd .tc-t-go{color:#C4CAD6;flex-shrink:0}
.tcmd .tc-taskrow:hover .tc-t-go{color:var(--brand)}

@media(max-width:820px){.tcmd .tc-layout{grid-template-columns:1fr}.tcmd .tc-d-stats{grid-template-columns:repeat(3,1fr)}}
@media(max-width:600px){.tcmd{padding:16px 14px 40px}.tcmd .tc-hstats{gap:14px}}
`;
