"use client";
import { useEffect, useState } from "react";
import { applySettings } from "@/lib/app-settings";

// Loads the Rules-page settings (lib/app-settings.ts) once per page and re-renders the
// screens that use them when they arrive or change.
let shared: Promise<void> | null = null;
const listeners = new Set<() => void>();
export function loadAppSettings(force = false): Promise<void> {
  if (!shared || force) {
    shared = fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.settings) applySettings(d.settings); listeners.forEach((f) => f()); })
      .catch(() => {});
  }
  return shared;
}
export function useAppSettings(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const f = () => setV((x) => x + 1);
    listeners.add(f);
    void loadAppSettings();
    return () => { listeners.delete(f); };
  }, []);
  return v;
}
