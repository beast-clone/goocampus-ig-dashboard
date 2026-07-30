"use client";
import { useState } from "react";
import { IconSparkles, IconRefresh } from "@tabler/icons-react";
import { useApi } from "@/lib/use-api";

type Resp = { text: string; citations?: string[]; error?: string };

// Reusable "Analyze with AI" panel. Point it at a GET endpoint that returns
// { text, citations }. Renders a button; on click it fetches and shows the
// Perplexity output with a light markdown renderer.
export function AiInsights({ endpoint, accent = "#3A57E8", label = "Analyze with AI" }: { endpoint: string; accent?: string; label?: string }) {
  const [on, setOn] = useState(false);
  // Regenerate must actually re-run the model. The server caches by (account,from,to)
  // for 30 min and SWR dedupes, so plain revalidate returned the identical text. Bump a
  // nonce → a fresh key carrying force=1, which the routes honour to bypass their cache.
  const [nonce, setNonce] = useState(0);
  const key = on ? `${endpoint}${nonce ? `${endpoint.includes("?") ? "&" : "?"}force=1&n=${nonce}` : ""}` : null;
  const { data, error, isLoading } = useApi<Resp>(key, { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, errorRetryCount: 0 });

  if (!on) {
    return (
      <button
        onClick={() => setOn(true)}
        className="inline-flex items-center gap-2 text-[13px] font-medium text-white rounded-lg px-3.5 py-2 shadow-sm hover:opacity-90 transition"
        style={{ background: accent }}
      >
        <IconSparkles size={15} stroke={1.9} /> {label}
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50" style={{ background: `${accent}0D` }}>
        <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: accent }}>
          <IconSparkles size={15} stroke={1.9} /> AI insights
          <span className="text-[10px] font-normal text-gray-400">· Perplexity</span>
        </div>
        <button onClick={() => setNonce((n) => n + 1)} disabled={isLoading} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 disabled:opacity-40">
          <IconRefresh size={13} className={isLoading ? "animate-spin" : ""} /> {isLoading ? "Thinking…" : "Regenerate"}
        </button>
      </div>
      <div className="p-4 text-[13px] text-gray-700 leading-relaxed">
        {isLoading && !data && <div className="text-gray-400 py-6 text-center">Reading your latest numbers…</div>}
        {error && <div className="text-rose-600">{error.message}</div>}
        {data?.text && <Markdown text={data.text} accent={accent} />}
        {data?.citations && data.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Sources</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {data.citations.slice(0, 8).map((c, i) => (
                <a key={i} href={c} target="_blank" rel="noreferrer" className="text-[11px] truncate max-w-[220px]" style={{ color: accent }}>[{i + 1}] {new URL(c).hostname}</a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function inline(s: string, key: number) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return <span key={key}>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</span>;
}

function Markdown({ text, accent }: { text: string; accent: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(<ul key={out.length} className="list-disc pl-5 space-y-1 my-2">{bullets.map((b, i) => <li key={i}>{inline(b, i)}</li>)}</ul>);
      bullets = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) { flush(); out.push(<div key={out.length} className="font-semibold mt-3 mb-1" style={{ color: accent }}>{inline(line.replace(/^#{1,6}\s/, ""), 0)}</div>); }
    else if (/^\s*[-*]\s+/.test(line)) bullets.push(line.replace(/^\s*[-*]\s+/, ""));
    else if (/^\s*\d+\.\s+/.test(line)) bullets.push(line.replace(/^\s*\d+\.\s+/, ""));
    else if (line.trim() === "") flush();
    else { flush(); out.push(<p key={out.length} className="my-1.5">{inline(line, 0)}</p>); }
  }
  flush();
  return <>{out}</>;
}
