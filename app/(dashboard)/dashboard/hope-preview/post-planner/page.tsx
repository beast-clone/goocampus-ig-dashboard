"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";

type Planned = {
  id: string; title: string; type: string; interest: string; thumbnailUrl: string | null;
  status: string; owner: string; publishingDate: string | null; suggestedTime: string; reason: string; tags: string[];
  mediaUrls: string[]; caption: string; airtableRecordId: string | null; assetLink: string | null;
};
type CalendarPost = {
  id: string; title: string; type: string; status: string; owner: string;
  publishingDate: string | null; thumbnailUrl: string | null; instagramUrl: string | null; note: string | null;
  mediaUrls: string[]; caption: string; airtableRecordId: string | null; assetLink: string | null;
};
type Payload = {
  account: string; minGapHours: number;
  last: { title: string; type: string; interest: string; at: string | null } | null;
  summary: string; insight: string;
  plan: Planned[];
  calendar: CalendarPost[];
  hold: { id: string; title: string; reason: string }[];
  bestHours: number[];
  rankedBy?: string;
  generatedAt: string;
};

// A post the calendar can place on a day. eff = the date it sits on.
type CalCard = {
  id: string; title: string; type: string; owner: string; status: string;
  eff: string; note: string | null; reason: string; tags: string[]; beingWorkedOn: boolean;
  thumbnailUrl: string | null; mediaUrls: string[]; caption: string; airtableRecordId: string | null; assetLink: string | null;
};

// The team starts working a post ~this many days before its publish date, so an
// approved post due within this window counts as "being worked on" (guarded on move).
const WORK_LEAD_DAYS = 1;
// @12thplus daily post cap — accepting/moving a post onto a day already at this many
// posts asks first (min 2 / max 2 for this account).
const LIMIT_PER_DAY = 2;

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
  const [detail, setDetail] = useState<CalCard | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [limitWarn, setLimitWarn] = useState<{ card: CalCard; targetISO: string; existing: number } | null>(null);
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
      // Carry the AI's rationale (matched by post id) onto the real calendar so clicking
      // a post shows "why the AI suggests this" here too, not just on the planner tab.
      const planById = new Map(data.plan.map((pp) => [pp.id, pp]));
      return data.calendar
        .map((p) => {
          const eff = pubOverride[p.id] || p.publishingDate;
          if (!eff) return null;
          const ai = planById.get(p.id);
          return {
            id: p.id, title: p.title, type: p.type, owner: p.owner, status: p.status,
            eff, note: p.note, reason: ai?.reason || "", tags: ai?.tags || [], thumbnailUrl: p.thumbnailUrl,
            mediaUrls: p.mediaUrls, caption: p.caption, airtableRecordId: p.airtableRecordId, assetLink: p.assetLink,
            beingWorkedOn: beingWorkedOn(p.status, pubOverride[p.id] || p.publishingDate),
          } as CalCard;
        })
        .filter(Boolean) as CalCard[];
    }
    return data.plan.map((p) => ({
      id: p.id, title: p.title, type: p.type, owner: p.owner, status: p.status,
      eff: planOverride[p.id] || p.suggestedTime, note: null, reason: p.reason, tags: p.tags,
      beingWorkedOn: false, thumbnailUrl: p.thumbnailUrl,
      mediaUrls: p.mediaUrls, caption: p.caption, airtableRecordId: p.airtableRecordId, assetLink: p.assetLink,
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

  // The AI's recommended publish order (1 = publish first) — shown as a number on each
  // planner card so the summary's "publish X first" maps to a visible card.
  const rankById = useMemo(
    () => (tab === "plan" && data ? new Map(data.plan.map((p, i) => [p.id, i + 1])) : new Map<string, number>()),
    [tab, data],
  );

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

  // Accept one AI suggestion — write that post's suggested date to publishing_date,
  // guarded by the @12thplus daily cap.
  function acceptPost(card: CalCard) {
    if (!data) return;
    const targetISO = card.eff;
    const dayKey = ymd(new Date(targetISO));
    const existing = data.calendar.filter((p) => {
      if (p.id === card.id) return false;
      const eff = pubOverride[p.id] || p.publishingDate;
      return !!eff && ymd(new Date(eff)) === dayKey;
    }).length;
    if (existing >= LIMIT_PER_DAY) { setLimitWarn({ card, targetISO, existing }); return; }
    doAccept(card, targetISO);
  }
  async function doAccept(card: CalCard, targetISO: string) {
    setBusy(true);
    setPubOverride((o) => ({ ...o, [card.id]: targetISO }));
    setAccepted((s) => new Set(s).add(card.id));
    try {
      const r = await fetch("/api/post-planner/move", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, dateISO: targetISO, note: "Added from AI plan" }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { alert(`Couldn't add: ${d.error || r.status}`); setAccepted((s) => { const n = new Set(s); n.delete(card.id); return n; }); }
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
    <div className="max-w-[1500px]">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex bg-white border border-gray-200 rounded-lg p-1 gap-1">
          <button onClick={() => setTab("plan")} className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${tab === "plan" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}>✨ AI post planner</button>
          <button onClick={() => setTab("pub")} className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${tab === "pub" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}>📅 Publishing calendar</button>
        </div>
        <span className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-700">@12thplus.com</span>
        <div className="ml-auto flex items-center gap-2">
          {data && <span className="text-xs text-gray-400">Updated {new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
          <button onClick={() => load(true)} disabled={loading} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-brand text-gray-700 disabled:opacity-50">{loading ? "Thinking…" : "↻ Re-plan"}</button>
        </div>
      </div>

      {loading && !data && <div className="animate-pulse space-y-3"><div className="h-16 bg-gray-100 rounded-2xl" /><div className="h-72 bg-gray-100 rounded-2xl" /></div>}
      {err && !data && <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">Couldn&rsquo;t build the plan — {err}</div>}

      {data && (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 w-full">
          {tab === "plan" ? (
            <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 mb-4 flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                {data.rankedBy && /perplexity|search/.test(data.rankedBy) && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 mb-1.5">
                    🔎 Ranked with live web search{/perplexity/.test(data.rankedBy) ? " · Perplexity" : ""}
                  </span>
                )}
                <p className="text-[14px] text-gray-800 leading-relaxed">{data.summary}</p>
                {data.insight && <p className="text-[12.5px] text-gray-600 mt-1.5 leading-relaxed"><b className="text-brand">What works here:</b> {data.insight}</p>}
                <p className="text-xs text-gray-500 mt-1.5"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-brand text-white text-xs font-semibold align-middle mr-1">1</span>on each card = the AI&rsquo;s recommended publish order. Click a card to see it highlighted with its full details. Drag to tweak, then apply.</p>
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
              onOpen={setDetail} rankById={rankById} selectedId={detail?.id || null}
            />
          )}

          {/* Hold (AI tab only) */}
          {tab === "plan" && data.hold.length > 0 && (
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-amber-600 font-semibold mb-2">⏸ Hold for later — would clash if posted next</div>
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
          <div className="flex gap-4 mt-4 flex-wrap text-xs text-gray-400">
            <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#639922" }} />Ready — free to move</span>
            <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#BA7517" }} />Being worked on — asks first</span>
            <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#888780" }} />Not started</span>
          </div>
          </div>
          <DetailSidebar card={detail} isPlan={tab === "plan"} onClose={() => setDetail(null)}
            onAccept={acceptPost} accepted={detail ? accepted.has(detail.id) : false} busy={busy} />
        </div>
      )}

      {/* Ownership guard modal */}
      {guard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setGuard(null)}>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-amber-50">
              <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">!</span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-amber-600 leading-tight">Already being worked on</div>
                <div className="text-[12px] text-gray-500 truncate">{guard.card.title || "(untitled)"}</div>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[13px] text-gray-600 leading-relaxed">
                <span className="inline-flex items-center gap-1.5 align-middle">
                  <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center" style={{ background: ownerColor(guard.card.owner).bg, color: ownerColor(guard.card.owner).fg }}>{(guard.card.owner || "?")[0].toUpperCase()}</span>
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

      {/* Daily-limit guard — accepting/moving onto a day already at the @12thplus cap */}
      {limitWarn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setLimitWarn(null)}>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-amber-50">
              <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">!</span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-amber-600 leading-tight">Daily limit reached</div>
                <div className="text-[12px] text-gray-500">@12thplus · limit {LIMIT_PER_DAY}/day</div>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[13px] text-gray-600 leading-relaxed">
                <b className="text-gray-900">{new Date(limitWarn.targetISO).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</b> already has <b className="text-gray-900">{limitWarn.existing}</b> post{limitWarn.existing === 1 ? "" : "s"} scheduled — its daily limit of {LIMIT_PER_DAY}. Adding this makes it {limitWarn.existing + 1}.
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setLimitWarn(null)} className="text-xs font-medium px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">Pick another day</button>
                <button onClick={() => { const w = limitWarn; setLimitWarn(null); doAccept(w.card, w.targetISO); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-brand text-white hover:bg-brand-dark">Add anyway</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Right-hand detail panel — shows the selected post's creative, caption and details
// (and "why the AI put it here" on the planner tab). Captions live in the Airtable
// Content field, so we fetch them on demand by airtable_record_id.
function DetailSidebar({ card, isPlan, onClose, onAccept, accepted, busy }: { card: CalCard | null; isPlan: boolean; onClose: () => void; onAccept: (card: CalCard) => void; accepted: boolean; busy: boolean }) {
  const [caption, setCaption] = useState("");
  const [capLoading, setCapLoading] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
    if (!card) { setCaption(""); return; }
    if (card.caption) { setCaption(card.caption); return; }
    if (!card.airtableRecordId) { setCaption(""); return; }
    setCapLoading(true); setCaption("");
    const ctrl = new AbortController();
    fetch(`/api/scheduler/caption?recordId=${encodeURIComponent(card.airtableRecordId)}`, { signal: ctrl.signal })
      .then((r) => r.json()).then((d) => setCaption(d.caption || "")).catch(() => {}).finally(() => setCapLoading(false));
    return () => ctrl.abort();
  }, [card]);

  if (!card) {
    return (
      <aside className="w-full lg:w-[360px] shrink-0 lg:sticky lg:top-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
          <div className="text-3xl text-gray-200 mb-2">▢</div>
          <div className="text-[13px] text-gray-500">Click any post to see its creative, caption and details here.</div>
        </div>
      </aside>
    );
  }

  const chip = typeChip(card.type);
  const oc = ownerColor(card.owner);
  const when = new Date(card.eff).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  const slides = card.mediaUrls || [];
  const cur = slides[Math.min(idx, Math.max(0, slides.length - 1))] || null;
  const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);

  return (
    <aside className="w-full lg:w-[360px] shrink-0 lg:sticky lg:top-4">
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
            <div className="text-base font-medium text-[#232D42] leading-snug mt-1.5">{card.title || "(untitled)"}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none flex-shrink-0" aria-label="Close">×</button>
        </div>

        <div className="max-h-[calc(100vh-140px)] overflow-y-auto">
          {/* Creative */}
          <div className="bg-gray-900 relative aspect-square flex items-center justify-center">
            {cur ? (
              isVideo(cur)
                ? <video key={cur} src={cur} controls playsInline className="max-w-full max-h-full" />
                : /* eslint-disable-next-line @next/next/no-img-element */ <img src={cur} alt="" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-center px-4">
                <div className="text-gray-600 text-4xl mb-2">🖼️</div>
                <div className="text-xs text-gray-400">Creative isn&rsquo;t uploaded to the dashboard yet.</div>
                {card.assetLink && <a href={card.assetLink} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs text-brand-light hover:underline">View creative in Slack ↗</a>}
              </div>
            )}
            {slides.length > 1 && cur && (
              <>
                <button onClick={() => setIdx((i) => (Math.min(i, slides.length - 1) - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center">‹</button>
                <button onClick={() => setIdx((i) => (Math.min(i, slides.length - 1) + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center">›</button>
                <div className="absolute top-2 right-2 text-xs text-white bg-black/50 rounded-full px-1.5 py-0.5 tabular-nums">{Math.min(idx, slides.length - 1) + 1}/{slides.length}</div>
              </>
            )}
          </div>

          <div className="p-4 space-y-3">
            {isPlan && (
              <button onClick={() => onAccept(card)} disabled={busy || accepted}
                className={`w-full text-[13px] font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-60 ${accepted ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-brand text-white hover:bg-brand-dark"}`}>
                {accepted ? "✓ Added to the calendar" : `Add to ${new Date(card.eff).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`}
              </button>
            )}
            {isPlan && card.reason && (
              <div className="bg-brand/5 border border-brand/15 rounded-xl p-3">
                <div className="text-xs uppercase tracking-widest text-brand font-semibold mb-1">Why the AI put it here</div>
                <div className="text-[12.5px] text-gray-700 leading-relaxed">{card.reason}</div>
                {card.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {card.tags.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-light/60 text-brand">{t}</span>)}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px]">
              <div><div className="text-gray-400 text-xs mb-0.5">{isPlan ? "Suggested for" : "Publishing on"}</div><div className="text-gray-800 font-medium">{when}</div></div>
              <div><div className="text-gray-400 text-xs mb-0.5">Owner</div><div className="text-gray-800 font-medium flex items-center gap-1.5">{card.owner ? <><span className="w-4 h-4 rounded-full text-xs flex items-center justify-center" style={{ background: oc.bg, color: oc.fg }}>{card.owner[0].toUpperCase()}</span>{card.owner}</> : "—"}</div></div>
              <div><div className="text-gray-400 text-xs mb-0.5">Status</div><div className="text-gray-800 font-medium">{card.status || "—"}</div></div>
              {card.note && <div><div className="text-gray-400 text-xs mb-0.5">Last change</div><div className="text-amber-700 font-medium">{card.note}</div></div>}
            </div>

            <div>
              <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">Caption</div>
              {capLoading ? <div className="text-[12px] text-gray-400">Loading caption…</div>
                : caption ? <div className="text-[12.5px] text-gray-700 whitespace-pre-wrap leading-relaxed">{caption}</div>
                : <div className="text-[12px] text-gray-400 italic">No caption yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MonthGrid({ view, byDay, mode, dragId, onDragStart, onDrop, busy, onOpen, rankById, selectedId }: {
  view: { y: number; m: number };
  byDay: Record<string, CalCard[]>;
  mode: "plan" | "pub";
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (dayKey: string) => void;
  busy: boolean;
  onOpen: (card: CalCard) => void;
  rankById: Map<string, number>;
  selectedId: string | null;
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
        {dows.map((d) => <div key={d} className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center py-2">{d}</div>)}
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
              <div className={`text-xs font-medium mb-1 px-1 ${isToday ? "text-brand" : "text-gray-400"}`}>{dayNum}{isToday && " · today"}</div>
              <div className="space-y-1">
                {posts.map((c) => {
                  const chip = typeChip(c.type);
                  const oc = ownerColor(c.owner);
                  return (
                    <div key={c.id} draggable onDragStart={() => onDragStart(c.id)} onDragEnd={() => onDragStart("")}
                      onClick={() => onOpen(c)} title="Click for details · drag to reschedule"
                      className={`rounded-lg p-1.5 cursor-grab active:cursor-grabbing transition border ${selectedId === c.id ? "border-brand ring-2 ring-brand/30 bg-brand-light/20" : "bg-white border-gray-200 hover:border-brand"}`}>
                      <div className="flex items-center gap-1">
                        {mode === "plan" && rankById.get(c.id) != null && (
                          <span className="w-4 h-4 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 tabular-nums" title={`AI recommended order #${rankById.get(c.id)}`}>{rankById.get(c.id)}</span>
                        )}
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                        {mode === "pub" && <span className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0" style={{ background: statusDot(c) }} />}
                      </div>
                      <div className="text-xs text-gray-800 leading-tight mt-1 line-clamp-2">{c.title || "(untitled)"}</div>
                      {mode === "pub" ? (
                        <div className="flex items-center gap-1 mt-1">
                          {c.owner && <span className="w-4 h-4 rounded-full text-xs flex items-center justify-center flex-shrink-0" style={{ background: oc.bg, color: oc.fg }}>{c.owner[0].toUpperCase()}</span>}
                          {c.note && <span className="text-xs text-amber-700 bg-amber-50 rounded px-1 py-0.5 truncate" title={c.note}>moved</span>}
                        </div>
                      ) : (
                        c.tags[0] && <div className="mt-1"><span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-light/50 text-brand">{c.tags[0]}</span></div>
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
