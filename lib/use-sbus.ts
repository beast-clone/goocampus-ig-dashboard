"use client";
import { useEffect, useState } from "react";
import { SBU_OPTIONS } from "@/lib/sbus";

// The brand list for a picker in the browser. Starts with the built-in list so the
// picker is never empty, then swaps in the live one from /api/sbus (sql/027), so a
// brand added in the dashboard appears without a deploy.
//
// One fetch per page load, shared by every picker on the page.

let shared: Promise<string[]> | null = null;
const listeners = new Set<(s: string[]) => void>();

function load(): Promise<string[]> {
  if (!shared) {
    shared = fetch("/api/sbus", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && Array.isArray(d.sbus) && d.sbus.length ? (d.sbus as string[]) : [...SBU_OPTIONS]))
      .catch(() => [...SBU_OPTIONS]);
  }
  return shared;
}

export function useSbus(): string[] {
  const [sbus, setSbus] = useState<string[]>([...SBU_OPTIONS]);
  useEffect(() => {
    let alive = true;
    load().then((s) => { if (alive) setSbus(s); });
    listeners.add(setSbus);
    return () => { alive = false; listeners.delete(setSbus); };
  }, []);
  return sbus;
}

/** Add a brand (admin only — the API refuses anyone else). Every picker on the page updates. */
export async function addBrand(name: string): Promise<string> {
  const r = await fetch("/api/sbus", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  shared = Promise.resolve(d.sbus as string[]);
  listeners.forEach((fn) => fn(d.sbus));
  return d.name as string;
}
