"use client";
import { useEffect, useState } from "react";
import { IconMoon, IconCloudDollar } from "@tabler/icons-react";

// What this dashboard costs Netlify, in plain numbers.
//
// This card exists because of 2 October 2026: one broken scheduled function ran
// every five minutes, timed out at the full 30 seconds and retried three times,
// and quietly ate most of a month's credits. Nothing on screen ever said so.
// Now it does — and the day something starts running that shouldn't, the number
// here moves.

type UsageJob = {
  id: string; name: string; active: boolean; endpoint: string | null;
  runsPerDay: number; runsInQuietHours: number; avgMs: number | null; secondsPerDay: number | null;
};

type Usage = {
  connected: boolean; needsKey?: boolean; error?: string;
  quietHours?: { from: number; to: number };
  netlifyScheduledFunctions?: number;
  jobs: UsageJob[];
  totals: { jobs: number; callsPerDay: number; callsInQuietHours: number; secondsPerDay: number; measured: number } | null;
};

const mins = (sec: number) => (sec < 90 ? `${sec}s` : `${(sec / 60).toFixed(1)} min`);

export function NetlifyUsage() {
  const [u, setU] = useState<Usage | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/netlify/usage", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (live) setU(d); })
      .catch(() => { if (live) setU({ connected: false, jobs: [], totals: null, error: "Could not load usage" }); });
    return () => { live = false; };
  }, []);

  if (!u) return null;

  const t = u.totals;
  const perDay = t?.secondsPerDay ?? 0;
  // Netlify's own meters are the billing truth; this is our arithmetic from the
  // live schedules, so it is labelled an estimate and never dressed up as a bill.
  const perMonth = perDay * 30;
  const heavy = perDay > 3600;              // more than an hour a day is a red flag
  const noisy = (t?.callsInQuietHours ?? 0) > 0;
  const stray = (u.netlifyScheduledFunctions ?? 0) > 0;
  const alarm = heavy || stray;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100">
        <span className={`w-7 h-7 rounded-lg grid place-items-center ${alarm ? "bg-rose-50 text-rose-600" : "bg-brand-light text-brand"}`}>
          <IconCloudDollar size={15} stroke={1.8} />
        </span>
        <h2 className="text-sm font-medium text-[#232D42]">Netlify usage</h2>
        <span className="text-[11px] text-gray-400">· what the scheduled jobs cost</span>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-[11.5px] font-medium text-brand hover:underline">
          {open ? "Hide the breakdown" : "Show the breakdown"}
        </button>
      </div>

      {!u.connected ? (
        <div className="px-5 py-4 text-[12.5px] text-gray-500">
          {u.needsKey
            ? "Add N8N_API_KEY to the environment to see what the scheduled jobs are costing."
            : u.error || "Could not read the schedules just now."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
            <UseStat label="Jobs on a timer" value={String(t?.jobs ?? 0)} sub="all of them in n8n" />
            <UseStat label="Calls a day" value={String(t?.callsPerDay ?? 0)} sub="into this site" />
            <UseStat
              label="Compute a day"
              value={mins(perDay)}
              tint={heavy ? "text-rose-600" : undefined}
              sub={`about ${mins(perMonth)} a month`}
            />
            <UseStat
              label="On Netlify's own timer"
              value={String(u.netlifyScheduledFunctions ?? 0)}
              tint={stray ? "text-rose-600" : "text-emerald-600"}
              sub={stray ? "something is scheduled again" : "nothing — this is the cheap way"}
            />
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex items-start gap-2.5">
            <span className={`mt-0.5 ${noisy ? "text-amber-600" : "text-emerald-600"}`}><IconMoon size={15} stroke={1.8} /></span>
            <div className="text-[12.5px] text-gray-600">
              {noisy ? (
                <>
                  <b className="text-amber-700">{t?.callsInQuietHours} calls still land between midnight and 6 am.</b>{" "}
                  The stop zone is meant to be silent — those schedules need moving.
                </>
              ) : (
                <>Nothing runs between midnight and 6 am. The dashboard sleeps when you do.</>
              )}
            </div>
          </div>

          {open && (
            <ul className="divide-y divide-gray-50 border-t border-gray-100">
              {u.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-[#232D42] truncate">{j.name}</div>
                    {j.endpoint && <code className="text-[11px] text-gray-400">{j.endpoint}</code>}
                  </div>
                  <div className="text-right shrink-0 text-[11.5px] text-gray-500">
                    {j.active ? (
                      <>
                        <div>
                          {j.runsPerDay}×/day
                          {j.avgMs != null ? ` · ${(j.avgMs / 1000).toFixed(1)}s each` : ""}
                        </div>
                        <div className={j.runsInQuietHours ? "text-amber-600" : "text-gray-400"}>
                          {j.secondsPerDay != null ? `${mins(j.secondsPerDay)}/day` : "not measured yet"}
                          {j.runsInQuietHours ? ` · ${j.runsInQuietHours} in the stop zone` : ""}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">off</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="px-5 py-2.5 border-t border-gray-100 text-[11px] text-gray-400">
            Worked out from the live n8n schedules and those jobs&apos; real run times — not from a Netlify bill.
            Treat it as a sense of scale and check Netlify itself for the actual credits.
          </div>
        </>
      )}
    </div>
  );
}

function UseStat({ label, value, sub, tint }: { label: string; value: string; sub: string; tint?: string }) {
  return (
    <div className="bg-white px-5 py-3.5">
      <div className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-[19px] font-medium mt-0.5 ${tint || "text-[#232D42]"}`}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}
