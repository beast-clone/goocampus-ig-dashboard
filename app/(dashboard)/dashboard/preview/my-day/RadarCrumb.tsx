"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Yesterday's radar, in one line at the top of My Day.
//
// The Radar clears itself at 11:59 PM whether anybody looked or not, so a deadline story
// could pass with nobody ever knowing it had been there. This says so the next morning —
// once. Tomorrow it is about today, and yesterday's misses live only in the report, which
// is why there is no dismiss button: there is nothing to dismiss, it leaves on its own.
//
// One line high until it is asked to open (approved as "option C" — the bordered banner
// was rejected for carrying more weight than a single line of information deserves).

type Missed = { itemKey: string; kind: string; title: string; source: string | null; url: string | null };
type Resp = { day: string; missed: Missed[]; more: number; shown: number; written: number };

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default function RadarCrumb() {
  const [data, setData] = useState<Resp | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/radar/missed", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && !d.error) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Nothing logged for yesterday means the roll-off did not run. Saying "nothing was
  // missed" then would be a guess dressed as a fact, so the line stays away entirely.
  if (!data || data.shown === 0) return null;

  const missed = data.missed.length;

  // Clean day. Worth one quiet line: an absent warning and a warning that failed to load
  // look the same, and the second one teaches people to stop reading the first.
  if (missed === 0) {
    return (
      <div className="rcrumb">
        <span className="rcrumb-dot ok" />
        <span className="rcrumb-txt">Yesterday&apos;s radar was cleared — <b>nothing left hanging</b></span>
        <span className="rcrumb-sep">·</span>
        <span className="rcrumb-when">{data.shown} shown · {data.written} written</span>
      </div>
    );
  }

  return (
    <div className="rcrumb-wrap">
      <button type="button" className={`rcrumb btn-reset ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="rcrumb-dot" />
        <span className="rcrumb-txt">
          <b>{missed} time-sensitive</b> went past yesterday with no action
        </span>
        <span className="rcrumb-sep">·</span>
        <span className="rcrumb-when">{dayLabel(data.day)}</span>
        <span className="rcrumb-chev" aria-hidden="true">▶</span>
      </button>
      {open && (
        <div className="rcrumb-drop">
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
            Already saved in <Link href="/dashboard/preview/radar/report">yesterday&apos;s report</Link> — this line goes away on its own tomorrow.
          </div>
        </div>
      )}
    </div>
  );
}
