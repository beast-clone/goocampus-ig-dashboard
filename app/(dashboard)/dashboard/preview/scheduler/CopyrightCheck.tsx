"use client";
import { useEffect, useRef, useState } from "react";
import { IconCheck, IconAlertTriangle, IconExclamationCircle, IconRefresh } from "@tabler/icons-react";
import type { CopyrightState } from "@/lib/copyright-check";

// The banner Meta shows while a reel is processing, shown here before we queue one.
//
// It runs itself: attach a video, and by the time the caption is written the answer
// is usually in. Nothing here blocks the Schedule button — a match is Meta's opinion
// about the audio, not a rejection, and the person writing the post is better placed
// to decide than a boolean is.
//
// Once there is a caption, a clear result shrinks to a tick you can hover. A green
// bar earns its space while you are waiting for it and stops earning it the moment
// it says yes. A warning does not shrink: "this may be copyrighted" reduced to an
// icon is a warning nobody reads.

type Result = { state: CopyrightState; message?: string };

const POLL_MS = 6000;
const GIVE_UP_MS = 4 * 60 * 1000;   // the check itself takes ~1 min; this is the long tail

export function CopyrightCheck({ videoUrl, page, collapseWhenClear }: {
  videoUrl: string;
  page: string;
  /** Set once the caption has been written — a settled "all clear" stops being news. */
  collapseWhenClear?: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The video a run belongs to, so a slow poll from the previous file can't paint
  // its answer over the new one.
  const runFor = useRef("");
  // Read, never depended on. Switching the target Page used to restart the check and
  // leave the old container behind — four of them for one video, each one Instagram
  // downloading and transcoding the file again. The rights match is the same whoever
  // publishes it, so a Page change is not a reason to ask twice.
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    if (!videoUrl) { setResult(null); setFailed(false); return; }
    runFor.current = videoUrl;
    setResult({ state: "processing" }); setFailed(false);

    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const run = async () => {
      try {
        const r = await fetch("/api/scheduler/copyright-check", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
          body: JSON.stringify({ videoUrl, page: pageRef.current }),
        });
        const d = await r.json();
        if (!alive || runFor.current !== videoUrl) return;
        if (!r.ok || !d.containerId) { setFailed(true); return; }

        const poll = async () => {
          if (!alive || runFor.current !== videoUrl) return;
          if (Date.now() - startedAt > GIVE_UP_MS) { setResult({ state: "unavailable" }); return; }
          try {
            const s = await fetch(
              `/api/scheduler/copyright-check?containerId=${encodeURIComponent(d.containerId)}&page=${encodeURIComponent(pageRef.current)}`,
              { credentials: "same-origin" });
            const sd = (await s.json()) as Result & { error?: string };
            if (!alive || runFor.current !== videoUrl) return;
            if (sd.error) { setFailed(true); return; }
            setResult(sd);
            if (sd.state === "processing" || sd.state === "checking") timer = setTimeout(poll, POLL_MS);
          } catch {
            if (alive && runFor.current === videoUrl) setFailed(true);
          }
        };
        timer = setTimeout(poll, 2000);
      } catch {
        if (alive && runFor.current === videoUrl) setFailed(true);
      }
    };
    run();

    return () => { alive = false; clearTimeout(timer); };
  }, [videoUrl, attempt]);

  if (!videoUrl) return null;

  if (failed) {
    return (
      <Strip tone="muted" icon={<IconExclamationCircle size={15} stroke={1.9} />}>
        <span>Couldn&apos;t reach Instagram for the copyright check.</span>
        <button type="button" onClick={() => setAttempt((a) => a + 1)}
          className="inline-flex items-center gap-1 ml-2 text-[#4A5468] hover:text-brand underline underline-offset-2">
          <IconRefresh size={12} stroke={2} /> Try again
        </button>
      </Strip>
    );
  }
  if (!result) return null;

  switch (result.state) {
    case "processing":
      return <Strip tone="muted" spinner>Instagram is processing the video…</Strip>;
    case "checking":
      return <Strip tone="muted" spinner>Checking for copyrighted content · optional</Strip>;
    case "clear":
      return collapseWhenClear ? (
        <span title="This video is ready to publish — no copyright issues were found."
          className="inline-flex items-center gap-1.5 rounded-md border border-[#BFE6D4] bg-[#E8F6F0] px-2 py-1 text-[11.5px] text-[#1F7A55] cursor-default">
          <IconCheck size={13} stroke={2.4} /> Copyright checked
        </span>
      ) : (
        <Strip tone="good" icon={<IconCheck size={15} stroke={2.4} />}>
          <b className="font-medium">Safe to publish</b> — no copyright match.
        </Strip>
      );
    case "flagged":
      return (
        <Strip tone="warn" icon={<IconAlertTriangle size={15} stroke={1.9} />}>
          <b className="font-medium">We may have found copyrighted content in your video.</b>{" "}
          Instagram doesn&apos;t say what matched. It may still publish, but the audio can be muted or
          the reel limited in some countries — swap the audio if you&apos;re not sure.
        </Strip>
      );
    case "rejected":
      return (
        <Strip tone="bad" icon={<IconExclamationCircle size={15} stroke={1.9} />}>
          <b className="font-medium">Instagram couldn&apos;t process this video.</b>{" "}
          {result.message} It will fail at publishing time too — re-export it and upload again.
        </Strip>
      );
    default:
      return <Strip tone="muted" icon={<IconExclamationCircle size={15} stroke={1.9} />}>
        Instagram didn&apos;t return a copyright result for this video.
      </Strip>;
  }
}

const TONES = {
  good: "bg-[#E8F6F0] border-[#BFE6D4] text-[#1F7A55]",
  warn: "bg-[#FDF3E3] border-[#F0D9A8] text-[#7A5410]",
  bad: "bg-[#FDECEA] border-[#F5C6C0] text-[#C0392B]",
  muted: "bg-[#FCFCFE] border-gray-200 text-[#8A92A6]",
} as const;

function Strip({ tone, icon, spinner, children }: {
  tone: keyof typeof TONES; icon?: React.ReactNode; spinner?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${TONES[tone]}`}>
      {spinner
        ? <span className="w-[15px] h-[15px] shrink-0 mt-[1px] rounded-full border-2 border-gray-200 border-t-brand animate-spin" />
        : <span className="shrink-0 mt-[1px]">{icon}</span>}
      <span className="text-[12.5px] leading-snug">{children}</span>
    </div>
  );
}
