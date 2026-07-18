"use client";
import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconRefresh } from "@tabler/icons-react";
import {
  ScheduledPost, STATUS_STYLE, ACCOUNT_STYLE, accountKeyFor, makeSamplePosts,
  DAY_LABELS, DAY_FULL, MONTH_NAMES, MONTH_ABBR, ymd, timeShort,
} from "../calendar/HopeCalendar";

// Publishing Calendar — "full shell" Hope UI rebuild (Version 2 layout). Same data
// + logic as ../calendar/HopeCalendar (shared, imported), but rendered inside
// HopeDashboardShell / .hope-scope with the standard 24px title (no gradient hero),
// flat Panel cards, brand tokens, weight 500/600, 12px type floor. The original
// gradient-hero version is untouched at /calendar so the two can be compared.

type View = "month" | "week" | "day" | "list";

export function HopeCalendarV2() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    const anchorYear = now.getMonth() > 7 ? now.getFullYear() + 1 : now.getFullYear();
    return new Date(anchorYear, 7, 1);
  });
  const [selected, setSelected] = useState<ScheduledPost | null>(null);
  const [showDemo, setShowDemo] = useState(true);
  const samplePosts = useMemo(() => makeSamplePosts(), []);

  const load = () => {
    setLoading(true);
    fetch("/api/scheduler/queue")
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: { posts?: ScheduledPost[] }) => { setPosts(d.posts || []); setFetchedAt(Date.now()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const allPosts = useMemo(() => (showDemo ? [...posts, ...samplePosts] : posts), [posts, samplePosts, showDemo]);

  const postsByDate = useMemo(() => {
    const byDate = new Map<string, ScheduledPost[]>();
    for (const p of allPosts) {
      const ts = p.publishedAt || p.scheduleTime;
      if (!ts) continue;
      const key = ymd(new Date(ts));
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(p);
    }
    for (const [, arr] of byDate) arr.sort((a, b) => new Date(a.scheduleTime || a.publishedAt || 0).getTime() - new Date(b.scheduleTime || b.publishedAt || 0).getTime());
    return byDate;
  }, [allPosts]);

  const monthGrid = useMemo(() => {
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - firstOfMonth.getDay());
    const cells: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
    const today = ymd(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === anchor.getMonth(), isToday: ymd(d) === today });
    }
    return cells;
  }, [anchor]);

  const weekDays = useMemo(() => {
    const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [anchor]);

  const agenda = useMemo(() => {
    const days: { date: Date; items: ScheduledPost[] }[] = [];
    const y = anchor.getFullYear(), m = anchor.getMonth();
    for (let day = 1; day <= 31; day++) {
      const d = new Date(y, m, day); if (d.getMonth() !== m) break;
      const items = postsByDate.get(ymd(d)) || [];
      if (items.length) days.push({ date: d, items });
    }
    return days;
  }, [anchor, postsByDate]);

  const shift = (dir: number) => setAnchor((cur) => {
    const d = new Date(cur);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else if (view === "day") d.setDate(d.getDate() + dir);
    else d.setMonth(d.getMonth() + dir);
    return d;
  });
  const jumpToday = () => setAnchor(new Date());

  const title = useMemo(() => {
    if (view === "day") return `${DAY_FULL[anchor.getDay()]}, ${MONTH_ABBR[anchor.getMonth()]} ${anchor.getDate()}`;
    if (view === "week") {
      const s = weekDays[0], e = weekDays[6];
      const sM = MONTH_ABBR[s.getMonth()], eM = MONTH_ABBR[e.getMonth()];
      return sM === eM ? `${sM} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}` : `${sM} ${s.getDate()} – ${eM} ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [view, anchor, weekDays]);

  const navBtn = "w-9 h-9 rounded-lg bg-brand text-white grid place-items-center hover:bg-[#2f49c9] transition-colors";

  return (
    <div className="space-y-4">
      {/* Control row — no gradient hero; the shell renders the page title. */}
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-[13px] font-medium text-[#4A5468] cursor-pointer select-none">
          <span className={`relative w-8 h-[18px] rounded-full transition-colors ${showDemo ? "bg-brand" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 w-[14px] h-[14px] rounded-full bg-white transition-all ${showDemo ? "left-[16px]" : "left-0.5"}`} />
          </span>
          Sample data
          <input type="checkbox" className="sr-only" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} />
        </label>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-[13px] font-medium text-white bg-brand rounded-lg px-3.5 py-2 hover:bg-[#2f49c9] disabled:opacity-70"
        >
          <IconRefresh size={15} stroke={2} className={loading ? "animate-spin" : ""} />
          {loading ? "Syncing…" : fetchedAt ? "Live" : "Refresh"}
        </button>
      </div>

      {/* Calendar card */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 p-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button className={navBtn} onClick={() => shift(-1)} aria-label="Previous"><IconChevronLeft size={17} stroke={2.2} /></button>
            <button className={navBtn} onClick={() => shift(1)} aria-label="Next"><IconChevronRight size={17} stroke={2.2} /></button>
            <button className="bg-brand-light text-brand font-medium text-[13px] px-3.5 py-2 rounded-lg hover:bg-[#dfe3fa] ml-1" onClick={jumpToday}>Today</button>
          </div>
          <div className="flex-1 min-w-[180px] text-center text-[18px] font-medium text-[#232D42]">{title}</div>
          <div className="flex bg-[#F7F8FC] border border-gray-100 rounded-lg p-[3px] gap-0.5">
            {(["month", "week", "day", "list"] as View[]).map((v) => (
              <button
                key={v}
                className={`text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors ${view === v ? "bg-brand text-white" : "text-[#4A5468] hover:text-[#232D42]"}`}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {view === "month" && (
          <>
            <div className="grid grid-cols-7 border-t border-gray-100 bg-[#F7F8FC]">
              {DAY_LABELS.map((d) => (
                <span key={d} className="px-2.5 py-2 text-[11px] font-medium uppercase tracking-wide text-[#8A92A6] border-r border-gray-100 last:border-r-0">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 [grid-auto-rows:minmax(120px,1fr)]">
              {monthGrid.map((cell, i) => {
                const dayPosts = postsByDate.get(ymd(cell.date)) || [];
                return (
                  <div
                    key={i}
                    className={`border-r border-t border-gray-100 p-1.5 min-w-0 relative [&:nth-child(7n)]:border-r-0 ${!cell.inMonth ? "bg-[#F7F8FC]" : ""} ${cell.isToday ? "bg-brand/5" : ""}`}
                  >
                    {cell.isToday ? (
                      <div className="float-right inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand text-white text-[12px] font-medium tabular-nums">{cell.date.getDate()}</div>
                    ) : (
                      <div className={`text-right text-[12px] font-medium tabular-nums px-1 pb-0.5 ${cell.inMonth ? "text-[#4A5468]" : "text-[#A6ACBE]"}`}>{cell.date.getDate()}</div>
                    )}
                    <div className="flex flex-col gap-[3px] clear-both">
                      {dayPosts.slice(0, 3).map((p) => <EventChip key={p.id} post={p} onClick={() => setSelected(p)} />)}
                      {dayPosts.length > 3 && (
                        <button className="text-left text-[11px] text-[#8A92A6] hover:text-brand px-1" onClick={() => setSelected(dayPosts[3])}>+ {dayPosts.length - 3} more</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === "week" && (
          <div className="grid grid-cols-7 border-t border-gray-100">
            {weekDays.map((d, i) => {
              const dayPosts = postsByDate.get(ymd(d)) || [];
              const isToday = ymd(d) === ymd(new Date());
              return (
                <div key={i} className={`border-r border-gray-100 last:border-r-0 min-h-[360px] ${isToday ? "bg-brand/5" : ""}`}>
                  <div className="flex flex-col items-center gap-0.5 p-2 border-b border-gray-100">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[#8A92A6]">{DAY_LABELS[d.getDay()]}</span>
                    {isToday ? (
                      <span className="flex items-center justify-center w-[26px] h-[26px] rounded-full bg-brand text-white text-[15px] font-medium">{d.getDate()}</span>
                    ) : (
                      <span className="text-[15px] font-medium text-[#232D42]">{d.getDate()}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-1.5">
                    {dayPosts.length === 0
                      ? <span className="text-[#A6ACBE] text-[13px] text-center pt-2">—</span>
                      : dayPosts.map((p) => <EventChip key={p.id} post={p} onClick={() => setSelected(p)} block />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "day" && (
          <div className="border-t border-gray-100 px-4 pt-3 pb-4">
            {(() => {
              const dayPosts = postsByDate.get(ymd(anchor)) || [];
              if (dayPosts.length === 0) return <div className="py-10 text-center text-[#8A92A6] text-[14px]">No posts scheduled for this day.</div>;
              return dayPosts.map((p) => {
                const ts = p.publishedAt || p.scheduleTime;
                return (
                  <div key={p.id} className="flex items-center gap-3 w-full text-left border-b border-[#F3F5F9] py-2.5 px-0.5 cursor-pointer" onClick={() => setSelected(p)}>
                    <span className="font-mono text-[12px] font-medium text-[#8A92A6] flex-[0_0_62px]">{ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—"}</span>
                    <div className="flex-1 min-w-0 pointer-events-none"><EventChip post={p} onClick={() => setSelected(p)} block /></div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {view === "list" && (
          <div className="border-t border-gray-100 py-1">
            {agenda.length === 0 ? <div className="py-10 text-center text-[#8A92A6] text-[14px]">No posts this month.</div>
              : agenda.map(({ date, items }) => (
                <div key={ymd(date)} className="flex gap-4 px-4 py-2.5 border-b border-[#F3F5F9]">
                  <div className="flex flex-col items-center flex-[0_0_46px] pt-0.5">
                    <span className="text-[11px] font-medium uppercase text-[#8A92A6]">{DAY_LABELS[date.getDay()]}</span>
                    <span className="text-[20px] font-medium text-[#232D42] leading-tight">{date.getDate()}</span>
                    <span className="text-[11px] uppercase text-[#A6ACBE]">{MONTH_ABBR[date.getMonth()]}</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    {items.map((p) => {
                      const ts = p.publishedAt || p.scheduleTime;
                      const acct = ACCOUNT_STYLE[accountKeyFor(p.publishToPage)];
                      const st = STATUS_STYLE[p.effectiveStatus];
                      return (
                        <button key={p.id} className="flex items-center gap-2.5 w-full text-left rounded-lg py-1.5 px-1 hover:bg-[#F7F8FC]" onClick={() => setSelected(p)}>
                          <span className="font-mono text-[12px] font-medium text-[#4A5468] flex-[0_0_46px]">{ts ? timeShort(ts) : "—"}</span>
                          <span className="w-1 h-[26px] rounded-sm flex-[0_0_4px]" style={{ background: acct.color }} />
                          <span className="text-[14px] font-medium text-[#232D42] flex-1 truncate">{p.particulars || "(no title)"}</span>
                          <span className="text-[12px] font-medium px-2 py-0.5 rounded-full max-[640px]:hidden" style={{ background: acct.soft, color: acct.color }}>{acct.handle}</span>
                          <span className="text-[12px] font-medium px-2 py-0.5 rounded-full max-[640px]:hidden" style={{ background: st.bg, color: st.text }}>{st.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {selected && <DetailModal post={selected} onClose={() => setSelected(null)} onRetried={() => { setSelected(null); load(); }} />}
    </div>
  );
}

function EventChip({ post, onClick, block }: { post: ScheduledPost; onClick: () => void; block?: boolean }) {
  const acct = ACCOUNT_STYLE[accountKeyFor(post.publishToPage)];
  const st = STATUS_STYLE[post.effectiveStatus];
  const ts = post.publishedAt || post.scheduleTime;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 w-full text-left border rounded-md px-1.5 py-0.5 overflow-hidden hover:brightness-[.97]"
      style={{ background: st.bg, borderColor: st.dot }}
      title={`${post.particulars} — ${acct.handle} · ${st.label}`}
    >
      {ts && <span className="font-semibold text-[12px] flex-none" style={{ color: st.text }}>{timeShort(ts)}</span>}
      <span className={`text-[12px] font-medium flex-1 overflow-hidden text-ellipsis ${block ? "whitespace-normal" : "whitespace-nowrap"}`} style={{ color: st.text }}>{post.particulars || "(no title)"}</span>
    </button>
  );
}

function DetailModal({ post, onClose, onRetried }: { post: ScheduledPost; onClose: () => void; onRetried: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acct = ACCOUNT_STYLE[accountKeyFor(post.publishToPage)];
  const st = STATUS_STYLE[post.effectiveStatus];

  async function retry() {
    setRetrying(true); setError(null);
    try {
      const r = await fetch("/api/scheduler/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId: post.id }) });
      const d = await r.json();
      if (!r.ok || d.error) setError(d.error || `HTTP ${r.status}`); else onRetried();
    } catch (e) { setError((e as Error).message); } finally { setRetrying(false); }
  }

  const whenLabel = post.publishedAt
    ? `Published ${new Date(post.publishedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
    : post.scheduleTime
    ? `Scheduled for ${new Date(post.scheduleTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
    : "No schedule";

  const lbl = "text-[11px] uppercase tracking-wide text-[#A6ACBE] mb-1";

  return (
    <div className="fixed inset-0 z-[60] bg-[rgba(15,18,35,.42)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-gray-100 w-full max-w-[520px] max-h-[86vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-l-4" style={{ background: st.bg, borderLeftColor: acct.color }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm flex-none" style={{ background: st.dot }} />
            <span className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: st.text }}>{st.label}</span>
            <span className="text-[12px] font-medium px-2 py-0.5 rounded-full" style={{ background: acct.soft, color: acct.color }}>{acct.handle}</span>
          </div>
          <button className="text-[1.4rem] leading-none text-[#8A92A6] hover:text-[#232D42]" onClick={onClose}>×</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <div className={lbl}>Title</div>
            <div className="text-[17px] font-medium text-[#232D42]">{post.particulars || "(no title)"}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className={lbl}>Brand</div><div className="text-[14px] text-[#4A5468]">{post.publishToPage}</div></div>
            <div><div className={lbl}>Type</div><div className="text-[14px] text-[#4A5468]">{post.type || "—"}</div></div>
            <div><div className={lbl}>Interest</div><div className="text-[14px] text-[#4A5468]">{post.primaryInterest || "—"}</div></div>
            <div><div className={lbl}>Time</div><div className="text-[14px] text-[#4A5468]">{whenLabel}</div></div>
          </div>
          {post.caption && (
            <div>
              <div className={lbl}>Caption preview</div>
              <div className="text-[13px] text-[#4A5468] bg-[#F7F8FC] rounded-lg p-2.5 whitespace-pre-wrap max-h-[180px] overflow-auto">{post.caption}</div>
            </div>
          )}
          {post.effectiveStatus === "failed" && post.failureReason && (
            <div className="bg-[#FCE8EC] border border-[#F6C9D3] rounded-xl p-3">
              <div className="text-[13px] font-semibold text-[#9F1239] mb-1">Why it failed</div>
              <div className="text-[13px] text-[#BE123C]">{post.failureReason}</div>
              <button onClick={retry} disabled={retrying} className="mt-2.5 text-[13px] font-medium bg-[#E11D48] text-white px-3 py-1.5 rounded-lg disabled:opacity-60">{retrying ? "Retrying…" : "↻ Retry — bump back into the queue"}</button>
              {error && <div className="text-[13px] text-[#BE123C] mt-2">{error}</div>}
            </div>
          )}
          {(post.instagramUrl || post.facebookUrl) && (
            <div className="flex gap-4 text-[13px] pt-2.5 border-t border-gray-100">
              {post.instagramUrl && <a href={post.instagramUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">View on Instagram ↗</a>}
              {post.facebookUrl && <a href={post.facebookUrl.split("\n")[0]} target="_blank" rel="noreferrer" className="text-brand hover:underline">View on Facebook ↗</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
