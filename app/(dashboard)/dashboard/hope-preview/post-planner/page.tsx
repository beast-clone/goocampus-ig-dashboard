"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";

type Planned = {
  id: string; title: string; type: string; interest: string; thumbnailUrl: string | null;
  status: string; owner: string; publishingDate: string | null; suggestedTime: string; reason: string; tags: string[];
};
type CalendarPost = {
  id: string; title: string; type: string; status: string; owner: string;
  publishingDate: string | null; thumbnailUrl: string | null; instagramUrl: string | null; note: string | null;
};
type Payload = {
  account: string; minGapHours: number;
  last: { title: string; type: string; interest: string; at: string | null } | null;
  summary: string; insight: string;
  plan: Planned[];
  calendar: CalendarPost[];
  hold: { id: string; title: string; reason: string }[];
  bestHours: number[];
  generatedAt: string;
};

// A post the calendar can place on a day. eff = the date it sits on.
type CalCard = {
  id: string; title: string; type: string; owner: string; status: string;
  eff: string; note: string | null; reason: string; tags: string[]; beingWorkedOn: boolean;
};

// The team starts working a post ~this many days before its publish date, so an
// approved post due within this window counts as "being worked on" (guarded on move).
const WORK_LEAD_DAYS = 1;

const OWNER_COLORS: Record<string, { bg: string; fg: string }> = {
  nikhil: { bg: "#E6F1FB", fg: "#0C447C" },
  manya: { bg: "#FBEAF0", fg: "#72243E" },
  nandu: { bg: "#E1F5EE", fg: "#085041" },
  praveen: { bg: "#FAEEDA", fg: "#633806" },
};
const ownerColor = (o: string) => OWNER_COLORS[o?.toLowerCase()] || { bg: "#F1EFE8", fg: "#5F5E5A" };

function typeChip(t: string) {
  const s = (t || "").toLowerCase();
  if (s.includes("reel")) return { bg: "#FBEAF0", fg: "#993556", label: "Reel" };
  if (s.includes("carousel")) return { bg: "#F0ECFF", fg: "#5142C4", label: "Carousel" };
  return { bg: "#E6F1FF", fg: "#2B6AB0", label: t || "Post" };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function beingWorkedOn(status: string, publishingDate: string | null): boolean {
  if (status !== "Content - Approved") return false;
  if (!publishingDate) return false;
  const days = Math.round((startOfDay(new Date(publishingDate)) - startOfDay(new Date())) / 86400000);
  return days <= WORK_LEAD_DAYS;
}
// Ready statuses = work done, free to drag. Everything else that isn't "being worked on" = not started.
function statusDot(c: CalCard): string {
  if (c.beingWorkedOn) return "#BA7517";                        // amber — asks first
  if (c.status === "Output - Ready" || c.status === "Ready to Publish") return "#639922"; // green — ready
  return "#888780";                                             // gray — not started
}

export default function PostPlannerPage() {
  return (
    <HopeDashboardShell active="post-planner"
      title="Post Planner"
      subtitle="Plan @12thplus posts on a calendar — AI suggests the order, the team sets the real dates."
      hideAccountPicker
    >
      {() => <Planner />}
    </HopeDashboardShell>
  );
}

function Planner() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"plan" | "pub">("pub");
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [guard, setGuard] = useState<{ card: CalCard; targetISO: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  // Optimistic local date overrides so drags feel instant.
  const [pubOverride, setPubOverride] = useState<Record<string, string>>({});
  const [planOverride, setPlanOverride] = useState<Record<string, string>>({});

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/post-planner${force ? "?force=1" : ""}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d as Payload);
      setPubOverride({}); setPlanOverride({});
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Switching tabs jumps the calendar to where that tab's posts live (AI dates and the
  // team's real dates can be in different months).
  useEffect(() => { setView(null); }, [tab]);

  // Build the cards for the active tab.
  const cards: CalCard[] = useMemo(() => {
    if (!data) return [];
    if (tab === "pub") {
      return data.calendar
        .map((p) => {
          const eff = pubOverride[p.id] || p.publishingDate;
          if (!eff) return null;
          return {
            id: p.id, title: p.title, type: p.type, owner: p.owner, status: p.status,
            eff, note: p.note, reason: "", tags: [],
            beingWorkedOn: beingWorkedOn(p.status, pubOverride[p.id] || p.publishingDate),
          } as CalCard;
        })
        .filter(Boolean) as CalCard[];
    }
    return data.plan.map((p) => ({
      id: p.id, title: p.title, type: p.type, owner: p.owner, status: p.status,
      eff: planOverride[p.id] || p.suggestedTime, note: null, reason: p.reason, tags: p.tags,
      beingWorkedOn: false,
    }));
  }, [data, tab, pubOverride, planOverride]);

  // Default the calendar to the month of the earliest card.
  useEffect(() => {
    if (view || cards.length === 0) return;
    const earliest = cards.map((c) => new Date(c.eff).getTime()).sort((a, b) => a - b)[0];
    const d = new Date(earliest);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }, [cards, view]);

  const byDay = useMemo(() => {
    const map: Record<string, CalCard[]> = {};
    for (const c of cards) {
      const k = ymd(new Date(c.eff));
      (map[k] ||= []).push(c);
    }
    return map;
  }, [cards]);

  async function doMove(card: CalCard, targetISO: string) {
    setBusy(true);
    setPubOverride((o) => ({ ...o, [card.id]: targetISO }));
    try {
      const r = await fetch("/api/post-planner/move", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, dateISO: targetISO }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { alert(`Move failed: ${d.error || r.status}`); setPubOverride((o) => { const n = { ...o }; delete n[card.id]; return n; }); }
    } finally { setBusy(false); }
  }

  function onDropDay(dayKey: string) {
    const card = cards.find((c) => c.id === dragId);
    setDragId(null);
    if (!card) return;
    // Keep the post's time-of-day, just change the date.
    const cur = new Date(card.eff);
    const [Y, M, D] = dayKey.split("-").map(Number);
    const target = new Date(Y, M - 1, D, cur.getHours() || 9, cur.getMinutes() || 0).toISOString();
    if (ymd(new Date(target)) === ymd(cur)) return; // same day, no-op

    if (tab === "plan") { setPlanOverride((o) => ({ ...o, [card.id]: target })); return; }
    // Publishing tab — guard posts that are actively being worked on.
    if (card.beingWorkedOn) { setGuard({ card, targetISO: target }); return; }
    doMove(card, target);
  }

  async function applyPlan() {
    if (!data) return;
    setApplying(true);
    try {
      const items = data.plan.map((p) => ({ id: p.id, dateISO: planOverride[p.id] || p.suggestedTime }));
      const r = await fetch("/api/post-planner/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { alert(`Apply failed: ${d.error || r.status}`); }
      else { await load(); setTab("pub"); }
    } finally { setApplying(false); }
  }

  const monthLabel = view ? new Date(view.y, view.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "";

  return (
    <div className="max-w-[1100px]">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex bg-white border border-gray-200 rounded-lg p-1 gap-1">
          <button onClick={() => setTab("plan")} className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${tab === "plan" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}>✨ AI post planner</button>
          <button onClick={() => setTab("pub")} className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${tab === "pub" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}>📅 Publishing calendar</button>
        </div>
        <span className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-700">@12thplus.com</span>
        <div className="ml-auto flex items-center gap-2">
          {data && <span className="text-[11px] text-gray-400">Updated {new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
          <button onClick={() => load(true)} disabled={loading} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-brand text-gray-700 disabled:opacity-50">{loading ? "Thinking…" : "↻ Re-plan"}</button>
        </div>
      </div>

      {loading && !data && <div className="animate-pulse space-y-3"><div className="h-16 bg-gray-100 rounded-2xl" /><div className="h-72 bg-gray-100 rounded-2xl" /></div>}
      {err && !data && <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">Couldn&rsquo;t build the plan — {err}</div>}

      {data && (
        <>
          {tab === "plan" ? (
            <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 mb-4 flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-gray-800 leading-relaxed">{data.summary}</p>
                {data.insight && <p className="text-[12.5px] text-gray-600 mt-1.5 leading-relaxed"><b className="text-brand">What works here:</b> {data.insight}</p>}
                <p className="text-[11px] text-gray-500 mt-1.5">Drag cards to tweak the order, then apply — it writes these dates onto the Publishing calendar.</p>
              </div>
              <button onClick={applyPlan} disabled={applying || data.plan.length === 0} className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-50 whitespace-nowrap">{applying ? "Applying…" : "Apply plan →"}</button>
            </div>
          ) : (
            <div className="text-[12.5px] text-gray-600 mb-4">Drag any post to a new day to reschedule it — the change saves to the backend and shows up in the team&rsquo;s Marketing Hub. Posts being worked on ask first.</div>
          )}

          {/* Month nav */}
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setView((v) => v ? (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }) : v)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:border-brand text-gray-600">‹</button>
            <div className="text-sm font-semibold text-gray-900 w-40 text-center tabular-nums">{monthLabel}</div>
            <button onClick={() => setView((v) => v ? (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }) : v)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:border-brand text-gray-600">›</button>
          </div>

          {view && (
            <MonthGrid
              view={view} byDay={byDay} mode={tab}
              dragId={dragId} onDragStart={setDragId} onDrop={onDropDay} busy={busy}
            />
          )}

          {/* Hold (AI tab only) */}
          {tab === "plan" && data.hold.length > 0 && (
            <div className="mt-6">
              <div className="text-[10.5px] uppercase tracking-widest text-amber-600 font-semibold mb-2">⏸ Hold for later — would clash if posted next</div>
              <div className="space-y-2">
                {data.hold.map((h) => (
                  <div key={h.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <div className="text-[13px] font-medium text-amber-900">{h.title || "(untitled)"}</div>
                    <div className="text-[12px] text-amber-800 mt-0.5">{h.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-4 mt-4 flex-wrap text-[11px] text-gray-400">
            <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#639922" }} />Ready — free to move</span>
            <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#BA7517" }} />Being worked on — asks first</span>
            <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#888780" }} />Not started</span>
          </div>
        </>
      )}

      {/* Ownership guard modal */}
      {guard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setGuard(null)}>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-amber-50">
              <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">!</span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-amber-600 leading-tight">Already being worked on</div>
                <div className="text-[12px] text-gray-500 truncate">{guard.card.title || "(untitled)"}</div>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[13px] text-gray-600 leading-relaxed">
                <span className="inline-flex items-center gap-1.5 align-middle">
                  <span className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center" style={{ background: ownerColor(guard.card.owner).bg, color: ownerColor(guard.card.owner).fg }}>{(guard.card.owner || "?")[0].toUpperCase()}</span>
                  <b className="text-gray-900">{guard.card.owner || "someone"}</b>
                </span>{" "}
                is on this — status <b className="text-gray-900">{guard.card.status}</b>. Moving it to <b className="text-gray-900">{new Date(guard.targetISO).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</b> will notify them in their table.
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setGuard(null)} className="text-xs font-medium px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">Pick another</button>
                <button onClick={() => { const g = guard; setGuard(null); doMove(g.card, g.targetISO); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-brand text-white hover:bg-brand-dark">Move anyway + notify</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGrid({ view, byDay, mode, dragId, onDragStart, onDrop, busy }: {
  view: { y: number; m: number };
  byDay: Record<string, CalCard[]>;
  mode: "plan" | "pub";
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (dayKey: string) => void;
  busy: boolean;
}) {
  const first = new Date(view.y, view.m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const todayKey = ymd(new Date());
  const cells: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(view.y, view.m, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden ${busy ? "opacity-70" : ""}`}>
      <div className="grid grid-cols-7 border-b border-gray-100">
        {dows.map((d) => <div key={d} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-center py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((key, i) => {
          if (!key) return <div key={i} className="min-h-[112px] border-b border-r border-gray-50 bg-gray-50/40" />;
          const posts = byDay[key] || [];
          const isToday = key === todayKey;
          const dayNum = Number(key.split("-")[2]);
          return (
            <div key={i}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={() => onDrop(key)}
              className={`min-h-[112px] border-b border-r border-gray-50 p-1.5 align-top ${isToday ? "bg-brand-light/20" : ""} ${dragId ? "hover:bg-brand-light/30" : ""}`}
            >
              <div className={`text-[11px] font-medium mb-1 px-1 ${isToday ? "text-brand" : "text-gray-400"}`}>{dayNum}{isToday && " · today"}</div>
              <div className="space-y-1">
                {posts.map((c) => {
                  const chip = typeChip(c.type);
                  const oc = ownerColor(c.owner);
                  return (
                    <div key={c.id} draggable onDragStart={() => onDragStart(c.id)} onDragEnd={() => onDragStart("")}
                      className="bg-white border border-gray-200 rounded-lg p-1.5 cursor-grab active:cursor-grabbing hover:border-brand transition">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                        {mode === "pub" && <span className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0" style={{ background: statusDot(c) }} />}
                      </div>
                      <div className="text-[11px] text-gray-800 leading-tight mt-1 line-clamp-2">{c.title || "(untitled)"}</div>
                      {mode === "pub" ? (
                        <div className="flex items-center gap-1 mt-1">
                          {c.owner && <span className="w-4 h-4 rounded-full text-[8px] flex items-center justify-center flex-shrink-0" style={{ background: oc.bg, color: oc.fg }}>{c.owner[0].toUpperCase()}</span>}
                          {c.note && <span className="text-[9px] text-amber-700 bg-amber-50 rounded px-1 py-0.5 truncate" title={c.note}>moved</span>}
                        </div>
                      ) : (
                        c.tags[0] && <div className="mt-1"><span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-light/50 text-brand">{c.tags[0]}</span></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
