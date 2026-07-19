"use client";
import { useEffect, useState } from "react";

export function LiveIndicator({
  fetchedAt = null,
  latencyMs = null,
  loading,
  onRefresh,
}: {
  fetchedAt?: number | null;
  latencyMs?: number | null;
  loading: boolean;
  onRefresh: () => void;
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

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-3 py-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        <span className="text-[11px] font-medium text-green-800">Live · fetched {ageLabel}</span>
        {latencyMs !== null && (
          <span className="text-[10px] text-green-700/70">({latencyMs}ms)</span>
        )}
      </div>
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
