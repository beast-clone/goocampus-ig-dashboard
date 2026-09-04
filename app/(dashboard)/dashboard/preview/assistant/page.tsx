"use client";
import { useState } from "react";
import Link from "next/link";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import {
  IconSearch, IconReportAnalytics, IconPhoto, IconExternalLink, IconArrowRight, IconLock, IconUser,
} from "@tabler/icons-react";

type Result = {
  id: string; kind: "post" | "report" | "lead"; group: string; title: string; meta: string;
  openHref: string | null; openLabel: string; tabHref: string; tabLabel: string;
};

const EXAMPLES = [
  "July monthly report",
  "NEET carousel",
  "AMC reel",
  "instagram report",
];

export default function AssistantPage() {
  return (
    <PreviewDashboardShell
      active="assistant"
      title="Ask GooCampus"
      subtitle="Search everything in your dashboard — posts, tasks, reports. Open it directly, or jump to its tab. No internet, just your data."
      hideRange
      hideAccountPicker
    >
      {() => <SearchTool />}
    </PreviewDashboardShell>
  );
}

type Scope = "all" | "post" | "lead" | "report";
const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "post", label: "Tasks" },
  { key: "lead", label: "Leads" },
  { key: "report", label: "Reports" },
];

function SearchTool() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");        // the query that produced current results
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");

  const run = async (q: string) => {
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true); setError(null); setQuery(query); setInput(query);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResults((d.results || []) as Result[]);
    } catch (e) {
      setError((e as Error).message); setResults(null);
    } finally {
      setLoading(false);
    }
  };

  // Counts cover everything returned, so a chip still reads "Leads 12" while you
  // are filtered to Tasks — you can see what you are excluding.
  const counts = {
    all: results?.length ?? 0,
    post: results?.filter((r) => r.kind === "post").length ?? 0,
    lead: results?.filter((r) => r.kind === "lead").length ?? 0,
    report: results?.filter((r) => r.kind === "report").length ?? 0,
  };
  const shown = (results || []).filter((r) => scope === "all" || r.kind === scope);

  // group results in stable order
  const groups: { name: string; items: Result[] }[] = [];
  for (const r of shown) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) { g = { name: r.group, items: [] }; groups.push(g); }
    g.items.push(r);
  }

  return (
    <div className="max-w-[880px] mx-auto">
      {/* Search bar */}
      <form onSubmit={(e) => { e.preventDefault(); run(input); }}
        className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 focus-within:border-brand transition">
        <IconSearch size={18} className="text-[#8A92A6] shrink-0" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search a post, task, report… (e.g. “July monthly report”)"
          className="flex-1 bg-transparent outline-none text-[14px] text-[#232D42] placeholder:text-[#B4BAC6]"
        />
        <button type="submit" disabled={!input.trim() || loading}
          className="rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-1.5 disabled:opacity-40 hover:bg-brand-dark transition">
          {loading ? "…" : "Search"}
        </button>
      </form>

      <div className="flex items-center gap-2 text-[11.5px] text-[#8A92A6] mt-2 px-1">
        <IconLock size={12} className="text-brand shrink-0" />
        Searches only your dashboard&rsquo;s data — never the internet.
      </div>

      {/* Empty state */}
      {results === null && !loading && !error && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 text-center">
          <div className="text-[#232D42] font-medium">What are you looking for?</div>
          <div className="text-[#8A92A6] text-sm mt-1.5 mb-4">Try one of these:</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => run(e)}
                className="text-[12.5px] px-3 py-1.5 rounded-full border border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand transition">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="mt-6 animate-pulse h-24 bg-gray-100 rounded-2xl" />}
      {error && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-5 py-4 text-sm">Couldn&rsquo;t search — {error}</div>}

      {/* Results */}
      {results !== null && !loading && (
        <div className="mt-5">
          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
              <div className="text-[#232D42] font-medium">Nothing found for “{query}”</div>
              <div className="text-[#8A92A6] text-sm mt-1.5">Try a topic, a brand, or a format like carousel / reel — or a month like “July”.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {SCOPES.map((sc) => {
                  const n = counts[sc.key];
                  const active = scope === sc.key;
                  return (
                    <button
                      key={sc.key}
                      onClick={() => setScope(sc.key)}
                      className={`text-[12px] font-medium px-3 py-1 rounded-full border transition ${
                        active ? "bg-brand text-white border-brand" : "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand"
                      } ${n === 0 && !active ? "opacity-40" : ""}`}
                    >
                      {sc.label} <span className={active ? "opacity-80" : "text-[#A6ACBE]"}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px] text-[#8A92A6] mb-3">
                {shown.length} result{shown.length === 1 ? "" : "s"} for “{query}”
                {scope !== "all" && counts.all !== shown.length && (
                  <> · <button onClick={() => setScope("all")} className="text-brand font-medium hover:underline">show all {counts.all}</button></>
                )}
              </div>
              {groups.map((g) => (
                <div key={g.name} className="mb-6">
                  <div className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold mb-2">{g.name}</div>
                  <div className="space-y-2">
                    {g.items.map((r) => <ResultCard key={r.id} r={r} />)}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const ICONS = { report: IconReportAnalytics, lead: IconUser, post: IconPhoto } as const;

function ResultCard({ r }: { r: Result }) {
  const Icon = ICONS[r.kind];
  const noOpen = r.kind === "lead" ? "no phone" : "no link yet";
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-light text-brand shrink-0">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-[#232D42] truncate">{r.title}</div>
          <div className="text-[12px] text-[#8A92A6] truncate">{r.meta}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {r.openHref
          ? <ActionBtn href={r.openHref} label={r.openLabel} primary />
          : <span className="text-[11px] text-[#B4BAC6]">{noOpen}</span>}
        <ActionBtn href={r.tabHref} label={r.tabLabel} />
      </div>
    </div>
  );
}

// Renders a route link (internal) or an anchor (external http / tel: / mailto:).
function ActionBtn({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  const isHttp = /^https?:/.test(href);
  const external = isHttp || /^(tel|mailto):/.test(href);
  const cls = primary
    ? "inline-flex items-center gap-1 text-[12.5px] font-medium px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-dark transition whitespace-nowrap"
    : "inline-flex items-center gap-1 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand transition whitespace-nowrap";
  const icon = isHttp ? <IconExternalLink size={13} /> : <IconArrowRight size={13} />;
  if (external) {
    return <a href={href} target={isHttp ? "_blank" : undefined} rel={isHttp ? "noopener noreferrer" : undefined} className={cls}>{label} {icon}</a>;
  }
  return <Link href={href} className={cls}>{label} <IconArrowRight size={13} /></Link>;
}
