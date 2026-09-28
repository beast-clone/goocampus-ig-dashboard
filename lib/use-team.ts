"use client";
import { useEffect, useState } from "react";

// The team roster for browser screens, from /api/team (the admin Team page's
// people). One fetch per page load, shared by every component that asks.
//
// Screens keep their own small map of today's team for colours, aliases and
// Marketing Hub roles — the roster doesn't carry those — and use mergeTeam()
// to add anyone the map doesn't know yet, with neutral defaults. That way a new
// teammate appears everywhere without anyone editing a list.

export type TeamPerson = {
  id: string; first: string; name: string; initials: string;
  role: string; active: boolean; photoUrl: string | null;
};

let shared: Promise<TeamPerson[]> | null = null;

export function loadTeam(): Promise<TeamPerson[]> {
  if (!shared) {
    shared = fetch("/api/team", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && Array.isArray(d.team) ? (d.team as TeamPerson[]) : []))
      .catch(() => []);
  }
  return shared;
}

export function useTeam(): TeamPerson[] {
  const [team, setTeam] = useState<TeamPerson[]>([]);
  useEffect(() => {
    let alive = true;
    loadTeam().then((t) => { if (alive) setTeam(t); });
    return () => { alive = false; };
  }, []);
  return team;
}

/** Neutral avatar colour for someone a screen has no colour for (Hope UI muted text). */
export const NEWCOMER_COLOR = "#8A92A6";

/**
 * Append active roster people missing from `list` (matched by `keyOf`), built
 * with `make`. Mutates and returns `list` — screens that keep a module-level
 * team array need every helper reading it to see the newcomer too. Returns
 * whether anything was added, so the caller can re-render. `skip` leaves out ids a
 * screen deliberately omits (the Hub's workload cards leave out Maheen).
 */
export function mergeTeam<T>(
  list: T[], team: TeamPerson[], keyOf: (t: T) => string, make: (p: TeamPerson) => T, skip: string[] = [],
): boolean {
  const have = new Set([...list.map(keyOf), ...skip]);
  let added = false;
  for (const p of team) {
    if (!p.active || have.has(p.id)) continue;
    list.push(make(p));
    added = true;
  }
  return added;
}
