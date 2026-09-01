"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";

// Global "Ask GooCampus" search — a trigger that sits at the top of the sidebar
// (so it's always visible) plus a ⌘K / Ctrl-K command palette that opens from any
// page. Reuses the internal /api/assistant search (posts + reports + CRM leads);
// no internet. Clicking a result opens it or jumps to its tab.

type Result = {
  id: string; kind: "post" | "report" | "lead"; group: string; title: string; meta: string;
  openHref: string | null; openLabel: string; tabHref: string; tabLabel: string;
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Esc closes the palette (opened by clicking the sidebar box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  useEffect(() => { if (!open) { setQ(""); setResults(null); } }, [open]);

  // Debounced search while the palette is open.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/assistant", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
        });
        const d = await r.json();
        setResults((d.results || []) as Result[]);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback((href: string) => {
    setOpen(false);
    if (/^https?:\/\//.test(href)) window.open(href, "_blank", "noopener");
    else if (/^(tel|mailto):/.test(href)) window.location.href = href;
    else router.push(href);
  }, [router]);

  return (
    <>
      {/* Trigger — lives at the top of the sidebar */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full rounded-lg border border-gray-200 bg-[#F7F8FC] hover:bg-white hover:border-brand/40 transition px-3 py-2 mb-1 text-left"
      >
        <IconSearch size={15} className="text-[#8A92A6] shrink-0" />
        <span className="text-[12.5px] text-[#8A92A6] flex-1">Ask / search…</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[1px] flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[640px] bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
              <IconSearch size={18} className="text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search posts, tasks, reports, or a lead's name / phone…"
                className="flex-1 outline-none text-[14px] text-[#232D42] placeholder:text-[#B4BAC6]"
              />
              <kbd className="text-[10px] text-[#A6ACBE] border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {!q.trim() && (
                <div className="px-3 py-4 text-[12.5px] text-[#8A92A6]">
                  Type to search across posts, tasks, reports, and leads — your data only, never the internet.
                </div>
              )}
              {q.trim() && loading && <div className="px-3 py-4 text-[13px] text-[#8A92A6]">Searching…</div>}
              {q.trim() && !loading && results && results.length === 0 && (
                <div className="px-3 py-4 text-[13px] text-[#8A92A6]">No matches. Try a topic, a report, or a name.</div>
              )}
              {!loading && results && results.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[#F7F8FC]">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[#232D42] truncate">{r.title}</div>
                    <div className="text-[11.5px] text-[#8A92A6] truncate">{r.meta}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.openHref && (
                      <button onClick={() => go(r.openHref!)} className="text-[11.5px] font-medium px-2.5 py-1 rounded-md bg-brand text-white hover:bg-brand-dark whitespace-nowrap">{r.openLabel}</button>
                    )}
                    <button onClick={() => go(r.tabHref)} className="text-[11.5px] font-medium px-2.5 py-1 rounded-md border border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand whitespace-nowrap">{r.tabLabel}</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-100 bg-[#FbFbFd] text-[11px] text-[#A6ACBE] flex items-center justify-between">
              <span>Ask GooCampus · internal search</span>
              <button onClick={() => go("/dashboard/preview/assistant")} className="text-brand font-medium hover:underline">Open full search →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
