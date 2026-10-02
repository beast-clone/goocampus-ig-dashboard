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

// Netlify's own meter — what actually gets charged. Null when we cannot read it.
type Bill = {
  account: string; plan: string | null;
  creditsIncluded: number | null; alertAtPercent: number | null;
  bandwidthBytes: number | null;
  periodStart: string | null; periodEnd: string | null;
  billingUrl: string;
};

type Usage = {
  connected: boolean; needsKey?: boolean; error?: string;
  quietHours?: { from: number; to: number };
  netlifyScheduledFunctions?: number;
  jobs: UsageJob[];
  totals: { jobs: number; callsPerDay: number; callsInQuietHours: number; secondsPerDay: number; measured: number } | null;
  bill?: Bill | null;
};

const mins = (sec: number) => (sec < 90 ? `${sec}s` : `${(sec / 60).toFixed(1)} min`);
const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

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

      {/* The real bill, straight from Netlify's meter. Kept above and visually
          apart from our own arithmetic, because only this one is money. */}
      <Bill bill={u.bill} />

      {!u.connected ? (
        <div className="px-5 py-4 text-[12.5px] text-gray-500">
          {u.needsKey
            ? "Add N8N_API_KEY to the environment to see what the scheduled jobs are costing."
            : u.error || "Could not read the schedules just now."}
        </div>
      ) : (
        <>
          <div className="px-5 pt-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Our estimate, from the schedules
          </div>
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

/**
 * What Netlify says it has charged this billing period. Not our maths — their
 * meter, read live from their API. If the token is missing or the call fails,
 * this says so plainly rather than showing a number that looks real and isn't.
 */
function Bill({ bill }: { bill?: Bill | null }) {
  if (!bill) {
    return (
      <div className="px-5 py-3 bg-gray-50/70 border-b border-gray-100 text-[12px] text-gray-500">
        Netlify&apos;s own usage figures are unavailable — <code className="text-[11px]">NETLIFY_AUTH_TOKEN</code> is
        not set here. Everything below is our own estimate from the schedules, not a bill.
      </div>
    );
  }

  return (
    <div className="px-5 py-3.5 bg-gray-50/70 border-b border-gray-100">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">From Netlify</span>
        <span className="text-[11px] text-gray-400">
          · {bill.account}{bill.plan ? ` · ${bill.plan}` : ""}
          {bill.periodStart && bill.periodEnd ? ` · ${day(bill.periodStart)} – ${day(bill.periodEnd)}` : ""}
        </span>
      </div>

      <div className="flex items-end gap-7 mt-2 flex-wrap">
        {bill.bandwidthBytes != null && (
          <div>
            <div className="text-[22px] font-medium text-[#232D42] leading-none">{gb(bill.bandwidthBytes)}</div>
            <div className="text-[11px] text-gray-400 mt-1">bandwidth used this period</div>
          </div>
        )}
        {bill.creditsIncluded != null && (
          <div>
            <div className="text-[22px] font-medium text-[#232D42] leading-none">{bill.creditsIncluded.toLocaleString()}</div>
            <div className="text-[11px] text-gray-400 mt-1">
              credits in the plan{bill.alertAtPercent ? ` · alerts at ${bill.alertAtPercent}%` : ""}
            </div>
          </div>
        )}
      </div>

      {/* Netlify's API does not report how many credits have actually been spent
          — the field exists and reads zero while the billing page says otherwise.
          Rather than print a confident wrong number, say so and link out. */}
      <div className="text-[11.5px] text-gray-500 mt-2.5">
        Credits spent so far aren&apos;t available through Netlify&apos;s API — only the plan size is.{" "}
        <a href={bill.billingUrl} target="_blank" rel="noreferrer" className="text-brand font-medium hover:underline">
          Check the billing page
        </a>{" "}
        for the live balance.
      </div>
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
