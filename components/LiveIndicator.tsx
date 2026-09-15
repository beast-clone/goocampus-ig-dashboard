"use client";
import { useEffect, useState } from "react";

export function LiveIndicator({
  fetchedAt = null,
  latencyMs = null,
  loading,
  onRefresh,
  // Set when the last fetch failed. A green "Live" badge sitting directly above
  // a red error is the dashboard asserting it is live at the exact moment it is
  // not — the same failure as mock Instagram numbers under a "Live" badge, and a
  // dead server reported as "No matches". If it could not reach the data, it has
  // to stop claiming to be showing it.
  error = null,
}: {
  fetchedAt?: number | null;
  latencyMs?: number | null;
  loading: boolean;
  onRefresh: () => void;
  error?: string | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const ageSecs = fetchedAt ? Math.floor((Date.now() - fetchedAt) / 1000) : null;
  const ageLabel =
    ageSecs === null ? "…" :
    ageSecs < 2 ? "just now" :
    ageSecs < 60 ? `${ageSecs}s ago` :
    ageSecs < 3600 ? `${Math.floor(ageSecs / 60)}m ago` :
    `${Math.floor(ageSecs / 3600)}h ago`;

  // Stale, but not failed: the numbers on screen came from a fetch that worked,
  // they are just old. Worth saying so rather than implying they are current.
  const stale = !error && ageSecs !== null && ageSecs > 3 * 3600;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {error ? (
        <div className="flex items-center gap-2 bg-[#FDECEA] border border-[#F5C6C0] rounded-full px-3 py-1" title={error}>
          <span className="inline-flex rounded-full h-2 w-2 bg-[#C0392B]" />
          <span className="text-[11px] font-medium text-[#C0392B]">
            Not live · {fetchedAt ? `last good data ${ageLabel}` : "couldn’t load"}
          </span>
        </div>
      ) : (
        <div className={`flex items-center gap-2 rounded-full px-3 py-1 border ${
          stale ? "bg-[#FDF6E7] border-[#F0DFB8]" : "bg-green-50 border-green-200"
        }`}>
          <span className="relative flex h-2 w-2">
            {!stale && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${stale ? "bg-[#B7791F]" : "bg-green-500"}`}></span>
          </span>
          <span className={`text-[11px] font-medium ${stale ? "text-[#B7791F]" : "text-green-800"}`}>
            {stale ? "Cached" : "Live"} · fetched {ageLabel}
          </span>
          {latencyMs !== null && (
            <span className={`text-[10px] ${stale ? "text-[#B7791F]/70" : "text-green-700/70"}`}>({latencyMs}ms)</span>
          )}
        </div>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-[11px] font-medium border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
      >
        {loading ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin"></span>
            Fetching…
          </>
        ) : (
          <>↻ Refresh now</>
        )}
      </button>
    </div>
  );
}
