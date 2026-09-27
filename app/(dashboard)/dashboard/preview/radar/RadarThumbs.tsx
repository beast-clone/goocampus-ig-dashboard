"use client";

import { useCallback, useEffect, useState } from "react";
import { IconThumbUp, IconThumbDown } from "@tabler/icons-react";

// The one-tap answer on a radar row.
//
// Before this, the only way to clear something off the Radar was to write the post —
// so anything you'd looked at and decided against stayed on the list looking undone,
// and the list only ever grew. "Not useful" is a real answer and it takes one tap.
// The answers are what the nightly report is made of; see sql/022_radar_report.sql.

export type RadarItemKind = "news" | "mention" | "search" | "review";
export type RadarAction = "written" | "useful" | "not_useful";

type ActionsMap = Record<string, { action: RadarAction }>;

export type RadarActionsState = {
  /** Answers already given, so a thumb stays pressed across a reload. */
  actions: ActionsMap;
  /** Items written into a past day's report — the Radar hides these. */
  logged: Set<string>;
  /** Record an answer. Tapping the same thumb again clears it. */
  set: (kind: RadarItemKind, rawKey: string, action: RadarAction) => void;
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

  return { actions, logged, set, key: radarItemKey };
}

/** The approved pair, drawn as line icons rather than emoji — emoji are somebody else's
 *  artwork at somebody else's weight, and they sat in a row of Tabler outline icons
 *  looking like clip art. Filled on the pressed state so an answer is legible at a glance
 *  without relying on the background tint alone. */
export function Thumbs({ state, kind, rawKey }: { state: RadarActionsState; kind: RadarItemKind; rawKey: string }) {
  const key = radarItemKey(kind, rawKey);
  const current = state.actions[key]?.action;
  const base = "w-[30px] h-[26px] grid place-items-center rounded-lg border transition";
  const up = current === "useful";
  const down = current === "not_useful";
  return (
    <div className="flex gap-1">
      <button type="button" title="Useful — worth writing, just not now"
        onClick={() => state.set(kind, rawKey, "useful")}
        className={`${base} ${up
          ? "bg-[#E3F5EA] border-[#BFE6CD] text-[#0F6E3C]"
          : "bg-white border-gray-100 text-[#A6ACBE] hover:border-gray-200 hover:text-[#4A5468]"}`}>
        <IconThumbUp size={15} stroke={1.8} fill={up ? "currentColor" : "none"} />
      </button>
      <button type="button" title="Not useful — nothing for us here"
        onClick={() => state.set(kind, rawKey, "not_useful")}
        className={`${base} ${down
          ? "bg-[#FBE7E4] border-[#F1C4BD] text-[#C03221]"
          : "bg-white border-gray-100 text-[#A6ACBE] hover:border-gray-200 hover:text-[#4A5468]"}`}>
        <IconThumbDown size={15} stroke={1.8} fill={down ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
