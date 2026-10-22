"use client";
import { useEffect, useRef, useState } from "react";

// Unsaved text survives a closed tab or a crashed browser (Praveen, 22 Oct): what
// you were typing is kept in this browser and put back when you return, with a
// "Restored your unsaved draft · Discard" line. Cleared once you save or send, and
// dropped after 3 days so old text doesn't pile up.
const MAX_AGE = 3 * 86_400_000;
const k = (key: string) => `gc-draft:${key}`;

export function useDraft(key: string | null, value: string, setValue: (v: string) => void) {
  const [restored, setRestored] = useState(false);
  const loaded = useRef<string | null>(null);
  // Restore once per key, only into an empty box.
  useEffect(() => {
    if (!key || loaded.current === key) return;
    loaded.current = key;
    setRestored(false);
    try {
      const raw = localStorage.getItem(k(key));
      if (!raw) return;
      const { v, at } = JSON.parse(raw) as { v: string; at: number };
      if (!v || Date.now() - at > MAX_AGE) { localStorage.removeItem(k(key)); return; }
      if (!value) { setValue(v); setRestored(true); }
    } catch { /* private mode */ }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep it as you type.
  useEffect(() => {
    if (!key || loaded.current !== key) return;
    try {
      if (value.trim()) localStorage.setItem(k(key), JSON.stringify({ v: value, at: Date.now() }));
      else localStorage.removeItem(k(key));
    } catch { /* private mode */ }
  }, [key, value]);
  const clear = () => { setRestored(false); if (key) try { localStorage.removeItem(k(key)); } catch { /* */ } };
  const discard = () => { clear(); setValue(""); };
  return { restored, clear, discard };
}
