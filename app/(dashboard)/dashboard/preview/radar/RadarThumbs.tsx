"use client";

import { useCallback, useEffect, useState } from "react";

// The one-tap answer on a radar row.
//
// Before this, the only way to clear something off the Radar was to write the post —
// so anything you'd looked at and decided against stayed on the list looking undone,
// and the list only ever grew. "Not useful" is a real answer and it takes one tap.
// The answers are what the nightly report is made of; see sql/022_radar_report.sql.

export type RadarItemKind = "news" | "mention" | "search";
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
    // Painted immediately — a tap that waits on the network reads as a dead button, and
    // people tap it again. The row is unchanged if the save fails, so nothing is claimed
    // that was not recorded.
    setActions((prev) => {
      const next = { ...prev };
      if (prev[key]?.action === action) delete next[key];
      else next[key] = { action };
      return next;
    });
    const same = actions[key]?.action === action;
    fetch("/api/radar/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Un-tapping sends the answer back to nothing by clearing it server-side.
      body: JSON.stringify(same ? { itemKey: key, itemKind: kind, action: null } : { itemKey: key, itemKind: kind, action }),
    }).catch(() => {});
  }, [actions]);

  return { actions, logged, set, key: radarItemKey };
}

/** 👍 / 👎 as they were approved: a small pair, quiet until pressed. */
export function Thumbs({ state, kind, rawKey }: { state: RadarActionsState; kind: RadarItemKind; rawKey: string }) {
  const key = radarItemKey(kind, rawKey);
  const current = state.actions[key]?.action;
  const base = "w-[30px] h-[26px] grid place-items-center rounded-lg border text-[13px] leading-none transition";
  return (
    <div className="flex gap-1">
      <button type="button" title="Useful — worth writing, just not now"
        onClick={() => state.set(kind, rawKey, "useful")}
        className={`${base} ${current === "useful"
          ? "bg-[#E3F5EA] border-[#BFE6CD] text-[#0F6E3C]"
          : "bg-white border-gray-100 text-[#A6ACBE] hover:border-gray-200"}`}>👍</button>
      <button type="button" title="Not useful — nothing for us here"
        onClick={() => state.set(kind, rawKey, "not_useful")}
        className={`${base} ${current === "not_useful"
          ? "bg-[#FBE7E4] border-[#F1C4BD] text-[#C03221]"
          : "bg-white border-gray-100 text-[#A6ACBE] hover:border-gray-200"}`}>👎</button>
    </div>
  );
}
