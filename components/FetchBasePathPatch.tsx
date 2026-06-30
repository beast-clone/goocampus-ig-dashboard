"use client";

// Next.js basePath ("/gc-dashboard") prefixes routes, links, and assets — but NOT
// raw window.fetch() calls. So fetch("/api/login") from a page at
// goocampusevents.com/gc-dashboard/login resolves to goocampusevents.com/api/login
// (which 404s on the hub) instead of goocampusevents.com/gc-dashboard/api/login.
//
// Rather than touch ~30 fetch sites across the app, we patch window.fetch once at
// boot so any /api/* path is auto-prefixed with the basePath. Runs ONCE per session,
// idempotent, and only when basePath is non-empty.

import { useEffect } from "react";

export function FetchBasePathPatch() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & { __fetchBasePathPatched?: boolean };
    if (w.__fetchBasePathPatched) return;

    const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
    if (!BASE) return;          // no-op when running at root (local dev with BASE_PATH=)

    w.__fetchBasePathPatched = true;
    const orig = window.fetch.bind(window);

    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      try {
        if (typeof input === "string") {
          if (input.startsWith("/api/") && !input.startsWith(BASE + "/api/")) {
            input = BASE + input;
          }
        } else if (input instanceof URL) {
          if (input.pathname.startsWith("/api/") && !input.pathname.startsWith(BASE + "/api/")) {
            input.pathname = BASE + input.pathname;
          }
        } else if (input instanceof Request) {
          const u = new URL(input.url);
          if (u.pathname.startsWith("/api/") && !u.pathname.startsWith(BASE + "/api/")) {
            u.pathname = BASE + u.pathname;
            input = new Request(u.toString(), input);
          }
        }
      } catch { /* fall through to original fetch */ }
      return orig(input, init);
    };
  }, []);

  return null;
}
