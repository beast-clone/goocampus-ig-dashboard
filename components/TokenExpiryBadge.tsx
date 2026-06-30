"use client";
import { useEffect, useState } from "react";

type Status = {
  valid: boolean;
  expiresAt: number | null;
  daysRemaining: number | null;
  scopesCount: number;
  appId?: string;
  error?: string;
};

export function TokenExpiryBadge() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/token-status")
      .then((r) => r.json())
      .then((d: Status) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  if (!status) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium rounded-full border border-gray-200 text-gray-400 px-3 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        Token …
      </div>
    );
  }

  if (status.error || !status.valid) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium rounded-full border border-red-200 bg-red-50 text-red-700 px-3 py-1" title={status.error || "Token invalid"}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Token invalid
      </div>
    );
  }

  // Never-expiring (Page Access Tokens, or system-user tokens after approval)
  if (status.daysRemaining === null) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-medium rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1" title="Token does not expire">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Token · never expires
      </div>
    );
  }

  const days = status.daysRemaining;
  let color: "green" | "amber" | "red" | "critical";
  if (days >= 30) color = "green";
  else if (days >= 15) color = "amber";
  else if (days >= 7) color = "red";
  else color = "critical";

  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    critical: "border-red-300 bg-red-100 text-red-800",
  }[color];
  const dot = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    critical: "bg-red-600",
  }[color];
  const expiryDate = status.expiresAt
    ? new Date(status.expiresAt * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-[11px] font-medium rounded-full border px-3 py-1 transition hover:shadow-sm ${styles}`}
        title={`Meta token expires ${expiryDate}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot} ${color === "critical" ? "animate-pulse" : ""}`} />
        Token · {days}d left
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-50 text-xs">
          <div className="font-medium text-gray-900 mb-2">Meta long-lived user token</div>
          <div className="space-y-1 text-gray-600">
            <div>Expires on <span className="font-medium text-gray-900">{expiryDate}</span></div>
            <div>{days} days remaining</div>
            <div>{status.scopesCount} scopes granted</div>
            <div>App ID <code className="bg-gray-50 px-1 rounded text-[10px]">{status.appId || "—"}</code></div>
          </div>
          {days < 30 && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-amber-700">
              Refresh soon: open <a href="https://developers.facebook.com/tools/explorer/1325868559684543/" target="_blank" rel="noreferrer" className="underline">Graph API Explorer</a> → Generate Access Token → exchange short→long → update <code>META_LONG_LIVED_USER_TOKEN</code> in env.
            </div>
          )}
          <button onClick={() => setOpen(false)} className="absolute top-2 right-3 text-gray-400 hover:text-gray-900">×</button>
        </div>
      )}
    </div>
  );
}
