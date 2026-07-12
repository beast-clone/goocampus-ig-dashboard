"use client";
import { useEffect, useState } from "react";

// Brand-profile mode (Facebook-Pages-style switcher in the sidebar).
//   null  → main dashboard (everything, cross-brand — the admin home)
//   "<accountId>" → profile mode: the whole dashboard is locked to that brand
//                   and the sidebar slims to Overview/Analytics/Audience/Ads.
// Stored in localStorage so it survives navigation; a window event keeps the
// Sidebar and DashboardShell (and anything else) in sync within the tab.

const KEY = "gc-dash:profile";
const EVENT = "gc-profile-changed";

export function getProfile(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setProfile(id: string | null) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch { /* ignore */ }
}

export function useProfile(): string | null {
  const [profile, setState] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setState(getProfile());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return profile;
}
