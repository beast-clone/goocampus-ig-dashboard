"use client";

import { useCallback, useEffect, useState } from "react";
import { IconThumbUp, IconThumbDown } from "@tabler/icons-react";

// The one-tap answer on a radar row.
//
// Before this, the only way to clear something off the Radar was to write the post —
// so anything you'd looked at and decided against stayed on the list looking undone,
// and the list only ever grew. "Not useful" is a real answer and it takes one tap.
// The answers are what the nightly report is made of; see sql/022_radar_report.sql.

// Shared with the Watchers tab, which answers its notices the same way — see
// lib/radar-actions.ts.
export type RadarItemKind = "news" | "mention" | "search" | "review" | "notice";
export type RadarAction = "written" | "useful" | "not_useful";

type ActionsMap = Record<string, { action: RadarAction; reason?: string | null }>;

export type RadarActionsState = {
  /** Answers already given, so a thumb stays pressed across a reload. */
  actions: ActionsMap;
  /** Items written into a past day's report — the Radar hides these. */
  logged: Set<string>;
  /** Record an answer. Tapping the same thumb again clears it. */
  set: (kind: RadarItemKind, rawKey: string, action: RadarAction) => void;
  /** Attach a reason to an answer already given. Never blocks the thumb. */
  setReason: (kind: RadarItemKind, rawKey: string, reason: string) => void;
  key: (kind: RadarItemKind, rawKey: string) => string;
};

/** Same shape as lib/radar-actions.ts — the two must agree or a thumb tapped on the
 *  page and the row the report writes would not be the same item. */
export function radarItemKey(kind: RadarItemKind, raw: string): string {
  return kind === "search" ? `search:${raw.trim().toLowerCase()}` : `${kind}:${raw.trim()}`;
}

export function useRadarActions(): RadarActionsState {
  const [actions, setActions] = useState<ActionsMap>({});
  const [logged, setLogged] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    fetch("/api/radar/action", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setActions(d.actions || {});
        setLogged(new Set<string>(d.logged || []));
      })
      .catch(() => {});   // a failed load means no thumbs shown as pressed, not a broken page
    return () => { alive = false; };
  }, []);

  const set = useCallback((kind: RadarItemKind, rawKey: string, action: RadarAction) => {
    const key = radarItemKey(kind, rawKey);
    const before = actions[key];
    const same = before?.action === action;

    // Painted immediately — a tap that waits on the network reads as a dead button and
    // people tap it twice.
    setActions((prev) => {
      const next = { ...prev };
      if (same) delete next[key];
      else next[key] = { action };
      return next;
    });

    fetch("/api/radar/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      // Un-tapping sends the answer back to nothing by clearing it server-side.
      body: JSON.stringify(same ? { itemKey: key, itemKind: kind, action: null } : { itemKey: key, itemKind: kind, action }),
    })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); })
      // Put it back the way it was. An optimistic paint that survives a failed save is
      // worse than no paint at all: the answer looks recorded, the report never sees it,
      // and the first anyone knows is that the thumb is gone after a reload.
      .catch(() => setActions((prev) => {
        const next = { ...prev };
        if (before) next[key] = before; else delete next[key];
        return next;
      }));
  }, [actions]);

  // Sent after the thumb, never before it. The thumb is already saved by this point,
  // so a failed reason leaves the rejection intact — which is the right way round.
  const setReason = useCallback((kind: RadarItemKind, rawKey: string, reason: string) => {
    const key = radarItemKey(kind, rawKey);
    const cur = actions[key];
    if (!cur) return;
    setActions((prev) => ({ ...prev, [key]: { ...prev[key], reason } }));
    fetch("/api/radar/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ itemKey: key, itemKind: kind, action: cur.action, reason }),
    }).catch(() => {});
  }, [actions]);

  return { actions, logged, set, setReason, key: radarItemKey };
}

// The reasons people actually give, as one-tap chips. Free text was considered and
// rejected: the value of the thumb is that it costs one tap, and anything that turns
// rejecting into writing a sentence means people stop rejecting — which is the exact
// problem the thumbs were built to solve.
const REASONS = ["Not our audience", "Too old", "Competitor news", "Already covered", "Not accurate"];

/** The approved pair, drawn as line icons rather than emoji — emoji are somebody else's
 *  artwork at somebody else's weight, and they sat in a row of Tabler outline icons
 *  looking like clip art. Filled on the pressed state so an answer is legible at a glance
 *  without relying on the background tint alone. */
export function Thumbs({ state, kind, rawKey }: { state: RadarActionsState; kind: RadarItemKind; rawKey: string }) {
  const key = radarItemKey(kind, rawKey);
  const entry = state.actions[key];
  const current = entry?.action;
  const base = "w-[30px] h-[26px] grid place-items-center rounded-lg border transition";
  const up = current === "useful";
  const down = current === "not_useful";
  // Offered only after a thumbs-down, and only until a reason is given.
  const [asking, setAsking] = useState(false);
  // Their own words, for the times none of the five chips is the real reason.
  const [typing, setTyping] = useState(false);
  const [own, setOwn] = useState("");
  useEffect(() => { if (!down) { setAsking(false); setTyping(false); setOwn(""); } }, [down]);

  return (
    <div className="flex gap-1 relative">
      <button type="button" title="Useful — worth writing, just not now"
        onClick={() => state.set(kind, rawKey, "useful")}
        className={`${base} ${up
          ? "bg-[#E3F5EA] border-[#BFE6CD] text-[#0F6E3C]"
          : "bg-white border-gray-100 text-[#A6ACBE] hover:border-gray-200 hover:text-[#4A5468]"}`}>
        <IconThumbUp size={15} stroke={1.8} fill={up ? "currentColor" : "none"} />
      </button>
      <button type="button" title={entry?.reason ? `Not useful — ${entry.reason}` : "Not useful — nothing for us here"}
        onClick={() => { state.set(kind, rawKey, "not_useful"); setAsking(!down); }}
        className={`${base} ${down
          ? "bg-[#FBE7E4] border-[#F1C4BD] text-[#C03221]"
          : "bg-white border-gray-100 text-[#A6ACBE] hover:border-gray-200 hover:text-[#4A5468]"}`}>
        <IconThumbDown size={15} stroke={1.8} fill={down ? "currentColor" : "none"} />
      </button>

      {/* Already rejected and already saved — this is a bonus, not a gate. */}
      {asking && down && !entry?.reason && (
        <div className="absolute top-full right-0 mt-1.5 z-20 bg-white border border-gray-200 rounded-xl p-2.5 w-[230px]">
          <div className="text-[11px] text-[#8A92A6] mb-1.5">Why not? <span className="text-[#C7CEDD]">optional</span></div>
          {typing ? (
            <>
              <textarea autoFocus value={own} onChange={(e) => setOwn(e.target.value)}
                onKeyDown={(e) => {
                  // Enter saves; Shift+Enter is a newline, in case the reason runs long.
                  if (e.key === "Enter" && !e.shiftKey && own.trim()) {
                    e.preventDefault(); state.setReason(kind, rawKey, own.trim()); setAsking(false);
                  }
                  if (e.key === "Escape") setTyping(false);
                }}
                rows={2} placeholder="In your own words…"
                className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 text-[#232D42] outline-none focus:border-brand resize-none" />
              <div className="flex items-center gap-2 mt-1.5">
                <button type="button" disabled={!own.trim()}
                  onClick={() => { state.setReason(kind, rawKey, own.trim()); setAsking(false); }}
                  className="text-[11.5px] font-medium bg-brand text-white rounded-lg px-2.5 py-1 disabled:opacity-40 hover:bg-brand-dark">
                  Save
                </button>
                <button type="button" onClick={() => setTyping(false)}
                  className="text-[11px] text-[#A6ACBE] hover:text-[#232D42]">Back</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {REASONS.map((r) => (
                  <button key={r} type="button"
                    onClick={() => { state.setReason(kind, rawKey, r); setAsking(false); }}
                    className="text-[11.5px] border border-gray-200 rounded-lg px-2 py-1 text-[#4A5468] hover:border-brand hover:text-brand">
                    {r}
                  </button>
                ))}
                <button type="button" onClick={() => setTyping(true)}
                  className="text-[11.5px] border border-dashed border-gray-300 rounded-lg px-2 py-1 text-[#8A92A6] hover:border-brand hover:text-brand">
                  Something else…
                </button>
              </div>
              <button type="button" onClick={() => setAsking(false)}
                className="text-[11px] text-[#A6ACBE] hover:text-[#232D42] mt-1.5">Skip</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
