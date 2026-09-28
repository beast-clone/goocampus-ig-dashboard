"use client";
import { useEffect, useState } from "react";
import { ALL_TYPES, registerTypes, type TypeRow, type TypeKind } from "@/lib/mh-content-types";

// Types of work for a picker in the browser. Starts with the built-ins, then adds
// the live ones from /api/content-types (sql/028) — into ALL_TYPES and VIDEO_TYPES
// as well, so a screen's existing isVideoType()/VIDEO_TYPES checks see them.
// One fetch per page load, shared by every picker.

let shared: Promise<TypeRow[]> | null = null;
const listeners = new Set<(t: string[]) => void>();

function load(): Promise<TypeRow[]> {
  if (!shared) {
    shared = fetch("/api/content-types", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && Array.isArray(d.types) ? (d.types as TypeRow[]) : []))
      .catch(() => []);
  }
  return shared;
}

export function useContentTypes(): string[] {
  const [types, setTypes] = useState<string[]>([...ALL_TYPES]);
  useEffect(() => {
    let alive = true;
    load().then((rows) => { registerTypes(rows); if (alive) setTypes([...ALL_TYPES]); });
    listeners.add(setTypes);
    return () => { alive = false; listeners.delete(setTypes); };
  }, []);
  return types;
}

/** Add a type (admin only — the API refuses anyone else). Every picker on the page updates. */
export async function addType(name: string, kind: TypeKind): Promise<string> {
  const r = await fetch("/api/content-types", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  registerTypes(d.types as TypeRow[]);
  shared = Promise.resolve(d.types as TypeRow[]);
  listeners.forEach((fn) => fn([...ALL_TYPES]));
  return (d.added as TypeRow).name;
}
