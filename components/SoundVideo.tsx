"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type SyntheticEvent } from "react";
import { IconVolume, IconVolumeOff } from "@tabler/icons-react";

// Reels with their sound (Praveen, 27 Oct: "add audio to all of these reels").
//
// Browsers only autoplay a video silently, so every reel player here started muted and
// the only way to hear it was the tiny volume icon in the native control bar — and the
// Scheduler's Create post preview had no controls at all. This puts an obvious
// "Tap for sound" button on the player. The choice is remembered (localStorage), so once
// sound is on, the next reels play with sound too. `open` is for players someone opened
// on purpose (a file viewer): those try sound straight away, and fall back to silent +
// the button if the browser refuses.
//
// Renders the <video> and the button as siblings (no wrapper element), so each player
// keeps its own sizing — the parent only needs `position: relative`.

const KEY = "gc-reel-sound";
const wantsSound = () => { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } };

type Props = {
  src: string;
  className?: string;
  style?: CSSProperties;
  poster?: string;
  controls?: boolean;
  loop?: boolean;
  autoPlay?: boolean;          // false = don't start on its own (e.g. a carousel slide that isn't showing)
  open?: boolean;              // opened on purpose → try sound first
  preload?: "auto" | "metadata" | "none";
  buttonClassName?: string;    // where the button sits; default top-left
  onLoadedMetadata?: (e: SyntheticEvent<HTMLVideoElement>) => void;
  onError?: () => void;
};

export function SoundVideo({ src, className, style, poster, controls = true, loop = true, autoPlay = true, open = false, preload = "auto", buttonClassName, onLoadedMetadata, onError }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

  // Start it: with sound if that's wanted and allowed, else silently.
  const start = useCallback(() => {
    const v = ref.current;
    if (!v || !autoPlay) return;
    v.muted = !(open || wantsSound());
    v.play().then(() => setMuted(v.muted)).catch(() => {
      v.muted = true; setMuted(true);
      void v.play().catch(() => {});
    });
  }, [autoPlay, open]);

  // A slide that becomes the visible one starts; one that stops being it pauses.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (autoPlay) { if (v.readyState >= 2) start(); } else v.pause();
  }, [autoPlay, start]);

  const toggle = (e: MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    try { window.localStorage.setItem(KEY, v.muted ? "0" : "1"); } catch { /* private window — just this video */ }
    if (!v.muted) void v.play().catch(() => {});
  };

  return (
    <>
      <video ref={ref} key={src} src={src} className={className} style={style} poster={poster}
        controls={controls} loop={loop} muted playsInline preload={preload}
        onLoadedData={start}
        onLoadedMetadata={onLoadedMetadata}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onError={onError} />
      <button type="button" onClick={toggle} aria-label={muted ? "Turn sound on" : "Turn sound off"}
        className={`absolute z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 hover:bg-black/75 text-white text-xs font-medium px-2.5 py-1 leading-none ${buttonClassName || "top-2 left-2"}`}>
        {muted ? <><IconVolumeOff size={14} stroke={2} />Tap for sound</> : <><IconVolume size={14} stroke={2} />Sound on</>}
      </button>
    </>
  );
}
