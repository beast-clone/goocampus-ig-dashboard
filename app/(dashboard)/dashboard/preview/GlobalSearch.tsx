"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";
import { DICTATE_HOTKEY, MicButton, useVoiceInput } from "@/components/VoiceInput";

// Global "Ask GooCampus" search — a trigger that sits at the top of the sidebar
// (so it's always visible) plus a ⌘K / Ctrl-K command palette that opens from any
// page. Reuses the internal /api/assistant search (posts + reports + CRM leads);
// no internet. Clicking a result opens it or jumps to its tab.

// Ctrl+Space is the headline shortcut — the Spotlight-style one that was asked
// for. ⌘Space itself is impossible: macOS binds it to Spotlight at the OS level
// and the keystroke never reaches a browser tab (confirmed against this Mac's
// com.apple.symbolichotkeys — id 64 Spotlight enabled, while id 60 "select
// previous input source" (⌃Space) is disabled, which is what frees Ctrl+Space).
//
// ⌘K stays wired as well: Ctrl+Space is only free while input-source switching
// is off, and on a Mac with two keyboard layouts macOS takes it back. ⌘K is never
// captured by the OS, so there is always a shortcut that works.
const SEARCH_HOTKEY = "⌃Space";

type Result = {
  id: string; kind: "post" | "report" | "lead"; group: string; title: string; meta: string;
  openHref: string | null; openLabel: string; tabHref: string; tabLabel: string;
};

// Which slice of the dashboard a search is aimed at. "praveen" is a teammate
// AND a dozen leads called Praveen — without a scope the palette answers a
// question you did not ask, and the tasks you wanted sit below twelve phone
// numbers. `kind` already comes back on every result, so this is a filter over
// what the API returned, not a second request.
type Scope = "all" | "post" | "lead" | "report";
const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "post", label: "Tasks" },
  { key: "lead", label: "Leads" },
  { key: "report", label: "Reports" },
];

// Typed (or dictated) prefixes — "task: praveen". Kept short and spoken-friendly
// because these fields are dictated as often as typed.
const PREFIX: Record<string, Scope> = {
  task: "post", tasks: "post", post: "post", posts: "post", content: "post",
  lead: "lead", leads: "lead", contact: "lead",
  report: "report", reports: "report",
};

// The section you are standing in is the best guess at what you meant. Looking at
// someone's task board and typing their name should find tasks, not the sales
// pipeline. Only ever a DEFAULT — the chips still show every count, so nothing
// is hidden, and one click widens it back out.
function scopeForPath(path: string): Scope {
  const p = path.toLowerCase();
  if (/\/(my-day|briefing|attendance|marketing-hub|content-studio|content-review|scheduler|calendar|radar)(\/|$|\?)/.test(p)) return "post";
  if (/\/(inbox|leads|sales-ops|organic-sales)(\/|$|\?)/.test(p)) return "lead";
  if (/\/(ai-reports|reports)(\/|$|\?)/.test(p)) return "report";
  return "all";
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname() || "";
  // document.body only exists after mount — guard so SSR/hydration match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ⌘K / Ctrl-K opens it from any page, Esc closes. The header comment has
  // claimed ⌘K since this was written but the handler was never actually here.
  //
  // ⌘Space is not an option however much it is the mental model — macOS keeps it
  // for Spotlight and a web page never receives the event. ⌘K is what Slack,
  // Linear and Notion use for exactly this, so the muscle memory already exists.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      // Ctrl+Space (the Spotlight-alike) or ⌘K (the always-available fallback).
      // `code` not `key` for Space: with a modifier held some layouts report an
      // odd key value, but the physical code is stable.
      const ctrlSpace = e.ctrlKey && !e.metaKey && !e.altKey && e.code === "Space";
      const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K");
      if (ctrlSpace || cmdK) {
        e.preventDefault();      // Chrome would otherwise focus the address bar
        setOpen((v) => !v);
        return;
      }
      // ⌘1..⌘4 jump between scopes without leaving the keyboard. Only while the
      // palette is up, so the digits stay free for the browser's tab switching
      // everywhere else.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && /^[1-4]$/.test(e.key)) {
        setOpen((isOpen) => {
          if (isOpen) { e.preventDefault(); setScope(SCOPES[Number(e.key) - 1].key); }
          return isOpen;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  // Re-seed on every open, not just the first — you move between sections and
  // the guess should follow you rather than stick to wherever you started.
  useEffect(() => { if (open) setScope(scopeForPath(pathname)); }, [open, pathname]);

  // Dictation. Spoken words append to whatever is already typed, so you can mix
  // the two, and the debounced search below fires off the result exactly as if
  // it had been typed.
  const voice = useVoiceInput({
    onFinalText: (text) => setQ((prev) => (prev ? `${prev.trimEnd()} ${text}` : text)),
    hotkey: open,   // the palette is modal, so it owns the key while it is up
  });
  useEffect(() => { if (!open) voice.stop(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!open) { setQ(""); setResults(null); } }, [open]);

  // A leading "task:" / "lead:" sets the scope and is not itself searched —
  // otherwise the word would be matched as a keyword and drag in noise.
  const prefixed = /^\s*([a-z]+)\s*:\s*(.*)$/i.exec(q);
  const prefixScope = prefixed ? PREFIX[prefixed[1].toLowerCase()] : undefined;
  const effectiveScope: Scope = prefixScope || scope;
  const searchText = prefixScope ? prefixed![2] : q;

  // Debounced search while the palette is open.
  useEffect(() => {
    if (!open) return;
    const query = searchText.trim();
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
  }, [searchText, open]);

  // Counts are of everything that came back, so a chip can say "Leads 12" even
  // while you are looking at Tasks — that is the whole point: you can SEE what
  // you are not looking at, instead of a question box asking you to guess.
  const counts = {
    all: results?.length ?? 0,
    post: results?.filter((r) => r.kind === "post").length ?? 0,
    lead: results?.filter((r) => r.kind === "lead").length ?? 0,
    report: results?.filter((r) => r.kind === "report").length ?? 0,
  };
  const shown = (results || []).filter((r) => effectiveScope === "all" || r.kind === effectiveScope);
  // Section headers only in "All" — inside a single scope every row is the same
  // kind and a header would just be a line of noise repeated once.
  const grouped: { name: string; items: Result[] }[] = [];
  if (effectiveScope === "all") {
    for (const r of shown) {
      let g = grouped.find((x) => x.name === r.group);
      if (!g) { g = { name: r.group, items: [] }; grouped.push(g); }
      g.items.push(r);
    }
  }

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
        {/* Nobody finds a shortcut that is never shown. */}
        <kbd className="text-[10px] text-[#A6ACBE] border border-gray-200 rounded px-1.5 py-0.5 shrink-0">{SEARCH_HOTKEY}</kbd>
      </button>

      {/* Rendered into <body>, not in place. This component lives inside the
          sidebar <aside>, which is position:sticky — and sticky always creates a
          stacking context, so z-[200] only ranked the overlay WITHIN the sidebar.
          The main column comes later in the DOM and painted straight over the top
          of the palette, hiding its search row behind the page header. A portal
          takes it out of the sidebar's stacking context entirely. */}
      {open && mounted && createPortal((
        <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[1px] flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[640px] bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
              <IconSearch size={18} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={voice.listening ? "Listening — just speak…" : "Search posts, tasks, reports, or a lead's name / phone…"}
                  className="w-full outline-none text-[14px] text-[#232D42] placeholder:text-[#B4BAC6]"
                />
                {/* Words still being heard, shown faint until they settle. */}
                {voice.interim && <div className="text-[12.5px] text-[#B4BAC6] truncate">{voice.interim}…</div>}
              </div>
              {voice.supported && <MicButton listening={voice.listening} onClick={voice.toggle} title={`Dictate (${DICTATE_HOTKEY})`} />}
              <kbd className="text-[10px] text-[#A6ACBE] border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
            </div>
            {voice.error && (
              <div className="px-4 py-2 text-[12px] text-[#C0392B] bg-[#FDECEA] border-b border-gray-100">{voice.error}</div>
            )}
            {/* Scope chips. Shown once something has come back — before that the
                counts would all read 0 and the row would be four dead buttons. */}
            {results && results.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-[#FbFbFd]">
                {SCOPES.map((sc, i) => {
                  const n = counts[sc.key];
                  const active = effectiveScope === sc.key;
                  return (
                    <button
                      key={sc.key}
                      onClick={() => setScope(sc.key)}
                      className={`text-[11.5px] font-medium px-2.5 py-1 rounded-full border transition ${
                        active
                          ? "bg-brand text-white border-brand"
                          : "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand"
                      } ${n === 0 && !active ? "opacity-40" : ""}`}
                      title={`${sc.label} (⌘${i + 1})`}
                    >
                      {sc.label} <span className={active ? "opacity-80" : "text-[#A6ACBE]"}>{n}</span>
                    </button>
                  );
                })}
                {prefixScope && (
                  <span className="ml-auto text-[11px] text-[#A6ACBE]">from “{prefixed![1]}:”</span>
                )}
              </div>
            )}
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {!q.trim() && (
                <div className="px-3 py-4 text-[12.5px] text-[#8A92A6]">
                  Type to search across posts, tasks, reports, and leads — your data only, never the internet.
                  <div className="mt-1.5 text-[11.5px] text-[#A6ACBE]">
                    Narrow it with the chips, ⌘1–⌘4, or by starting with “task:” or “lead:”.
                  </div>
                </div>
              )}
              {searchText.trim() && loading && <div className="px-3 py-4 text-[13px] text-[#8A92A6]">Searching…</div>}
              {searchText.trim() && !loading && results && results.length === 0 && (
                <div className="px-3 py-4 text-[13px] text-[#8A92A6]">No matches. Try a topic, a report, or a name.</div>
              )}
              {/* Something matched, but not in the scope being looked at. Say where
                  it actually is rather than the flat "No matches", which would be
                  a lie — and let one click go there. */}
              {!loading && results && results.length > 0 && shown.length === 0 && (
                <div className="px-3 py-4 text-[13px] text-[#8A92A6]">
                  No {SCOPES.find((x) => x.key === effectiveScope)?.label.toLowerCase()} match “{searchText.trim()}”.{" "}
                  {SCOPES.filter((x) => x.key !== "all" && counts[x.key] > 0).map((x) => (
                    <button key={x.key} onClick={() => setScope(x.key)} className="text-brand font-medium hover:underline mr-2">
                      {counts[x.key]} in {x.label}
                    </button>
                  ))}
                </div>
              )}
              {!loading && results && (effectiveScope === "all"
                ? grouped.map((g) => (
                    <div key={g.name}>
                      <div className="px-3 pt-3 pb-1 text-[10.5px] font-semibold tracking-wide uppercase text-[#A6ACBE]">
                        {g.name} <span className="font-normal">· {g.items.length}</span>
                      </div>
                      {g.items.map((r) => <Row key={r.id} r={r} go={go} />)}
                    </div>
                  ))
                : shown.map((r) => <Row key={r.id} r={r} go={go} />)
              )}
            </div>
            <div className="px-4 py-2 border-t border-gray-100 bg-[#FbFbFd] text-[11px] text-[#A6ACBE] flex items-center justify-between">
              <span>Ask GooCampus · internal search</span>
              <button onClick={() => go("/dashboard/preview/assistant")} className="text-brand font-medium hover:underline">Open full search →</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}

// One result line. Pulled out of GlobalSearch so the grouped ("All") and the
// flat (single-scope) renderings cannot drift apart.
function Row({ r, go }: { r: Result; go: (href: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[#F7F8FC]">
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
  );
}
