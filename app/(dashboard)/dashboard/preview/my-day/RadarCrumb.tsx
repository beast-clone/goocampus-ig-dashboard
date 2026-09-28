"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Yesterday's radar, as one row of My Day's Reminders strip.
//
// The Radar clears itself at 11:59 PM whether anybody looked or not, so a deadline story
// could pass with nobody ever knowing it had been there. This says so the next morning.
//
// It used to be its own line above the Reminders strip — two strips saying "look at
// this" one above the other (Praveen, 28 Sep: "can we just club it into one"). It is now
// a row in that strip: View opens the list below, Dismiss files it in Notifications.
// Left alone, it still goes away on its own the next day.

export type Missed = { itemKey: string; kind: string; title: string; source: string | null; url: string | null };
export type RadarMissed = { day: string; missed: Missed[]; more: number; shown: number; written: number };

export const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Yesterday's misses, or null when there were none (or the roll-off did not run —
 *  "nothing was missed" would then be a guess dressed as a fact). */
export function useRadarMissed(): RadarMissed | null {
  const [data, setData] = useState<RadarMissed | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/radar/missed", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && !d.error && d.shown > 0 && Array.isArray(d.missed) && d.missed.length > 0) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return data;
}

/** The missed items, each with a way to write it now. */
export function RadarMissedList({ data }: { data: RadarMissed }) {
  return (
    <div className="rcrumb-list">
      {data.missed.map((m) => (
        <div key={m.itemKey} className="rcrumb-item">
          <span className="rcrumb-t" title={m.title}>{m.title}</span>
          <span className="rcrumb-src">{m.source || m.kind}</span>
          {/* Straight to the Radar's own draft link, so the miss can be fixed from
              here instead of being read here and hunted for there. */}
          <Link className="rcrumb-write" href={`/dashboard/scheduler?draft=${encodeURIComponent(
            new URLSearchParams({ title: m.title, brief: `Missed on the radar ${data.day}\n${m.source || ""}\n${m.url || ""}` }).toString())}`}>
            Write this
          </Link>
        </div>
      ))}
      {data.more > 0 && <div className="rcrumb-item"><span className="rcrumb-t">+{data.more} more in the report</span></div>}
      <div className="rcrumb-foot">
        Already saved in <Link href="/dashboard/preview/radar/report">yesterday&apos;s report</Link>.
      </div>
    </div>
  );
}
