"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconMicrophone, IconPlayerStopFilled } from "@tabler/icons-react";

// Dictation for any text field — click the mic, talk, the words appear.
//
// Uses the browser's own speech recognition (Chrome/Edge). No API key, no cost,
// nothing sent to a server we run. It is not in Firefox, and Safari's is patchy,
// so the button hides itself where it will not work rather than showing a control
// that does nothing.
//
// Two kinds of result come back while you talk: interim (a rough guess that keeps
// changing) and final (settled). Only final text is committed to the field;
// interim is shown separately as faint preview text, so the box does not flicker
// through half-heard words.

type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { isFinal: boolean; 0: { transcript: string } ; length: number }[] & { length: number };
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// How long the mic can be perfectly silent before we say something is wrong, and
// what counts as silence. A real room floor registers a few units even when
// nobody speaks; a dead virtual device reads a flat 0.
const SILENCE_GRACE_MS = 5000;
// Deliberately 0, not a "quiet" threshold. A live microphone always returns some
// noise floor even in a silent room, so any non-zero reading proves the device is
// real and the user simply has not spoken yet — which must NOT be warned about.
// Only a dead input (a virtual mic with nothing behind it) returns a perfectly
// flat waveform. Set this any higher and the warning fires at anyone who pauses.
const SILENCE_LEVEL = 0;

// Watches the actual audio coming off the default capture device.
//
// The Speech API gives no way to pick a microphone and no way to ask what it is
// hearing — it just reports "no-speech". That is indistinguishable from Chrome
// being pointed at a dead device, which is exactly what happened here: Chrome was
// set to a virtual mic from a phone-webcam app that emits pure digital silence,
// so the button pulsed red forever while nothing could ever be transcribed.
// Metering a parallel stream lets us tell "you are not talking" from "this
// microphone is not producing sound", and name the device in the warning.
function useSilenceWatch(active: boolean) {
  const [silentDevice, setSilentDevice] = useState<string | null>(null);
  useEffect(() => {
    if (!active) { setSilentDevice(null); return; }
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const label = stream.getAudioTracks()[0]?.label || "the selected microphone";
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const startedAt = Date.now();
        let heardAnything = false;
        const timer = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) { const d = Math.abs(v - 128); if (d > peak) peak = d; }
          if (peak > SILENCE_LEVEL) heardAnything = true;
          // Only complain once the grace period has passed with nothing at all.
          setSilentDevice(!heardAnything && Date.now() - startedAt > SILENCE_GRACE_MS ? label : null);
        }, 200);
        stop = () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); };
      } catch { /* permission handled by the recogniser's own error path */ }
    })();
    return () => { cancelled = true; stop(); };
  }, [active]);
  return silentDevice;
}

// ⌘D on a Mac, Ctrl+D on Windows. Both are the browser's "bookmark" shortcut, so
// it is suppressed while a dictatable field is focused — that is also why the key
// only binds when `hotkey` is on, rather than globally hijacking it everywhere.
export const DICTATE_HOTKEY = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘D" : "Ctrl+D";

export function useVoiceInput({ onFinalText, lang = "en-IN", hotkey = false }: {
  onFinalText: (text: string) => void; lang?: string;
  // Bind ⌘D / Ctrl+D while this field is the one being used.
  hotkey?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Whether the USER wants to be dictating. Chrome ends a session on its own
  // after a few seconds of silence — `continuous` does not prevent it — so the
  // session ending is not the same as the user being finished. This flag is what
  // tells the two apart, and drives the auto-restart in onend.
  const wantRef = useRef(false);
  // Keep the latest callback without restarting recognition on every re-render.
  const onFinalRef = useRef(onFinalText);
  onFinalRef.current = onFinalText;

  useEffect(() => { setSupported(!!getRecognitionCtor()); }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const startRef = useRef<() => void>(() => {});
  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    wantRef.current = true;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;      // don't cut out on a natural pause mid-sentence
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finalChunk = "";
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else pending += r[0].transcript;
      }
      setInterim(pending);
      if (finalChunk.trim()) onFinalRef.current(finalChunk.trim());
    };
    rec.onerror = (e) => {
      // "no-speech" just means a quiet stretch — Chrome raises it and ends the
      // session, but the user has not finished, so let onend restart instead of
      // tearing everything down. "aborted" is our own stop().
      if (e.error === "no-speech") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone blocked. Allow mic access for this site in Chrome.");
      } else if (e.error === "audio-capture") {
        setError("No microphone found — check the input device.");
      } else if (e.error === "network") {
        setError("Speech service unreachable — check the internet connection.");
      } else if (e.error !== "aborted") {
        setError("Could not hear you — try again.");
      }
      wantRef.current = false;          // a real failure: don't loop on it
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      setInterim("");
      // Silence ended the session but the user never pressed stop — start a new
      // one so dictation survives pauses. Without this the mic looks live while
      // Chrome has actually stopped listening, which is exactly how this failed.
      if (wantRef.current) { setTimeout(() => { if (wantRef.current) startRef.current(); }, 150); return; }
      setListening(false);
    };

    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { /* already running */ }
  }, [lang]);
  startRef.current = start;

  // Never leave the mic open when the component goes away.
  useEffect(() => () => { wantRef.current = false; recRef.current?.abort(); }, []);

  // Tap to start, tap again to stop. Deliberately a toggle rather than
  // hold-to-talk: ⌘D held down auto-repeats, and you cannot type into the field
  // with a modifier held anyway.
  useEffect(() => {
    if (!hotkey || !supported) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || (e.key !== "d" && e.key !== "D")) return;
      e.preventDefault();   // stop Chrome opening its bookmark dialog
      if (listening) stop(); else start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey, supported, listening, start, stop]);

  const silentDevice = useSilenceWatch(listening);
  // A dead capture device is the more useful thing to report, so it wins over the
  // recogniser's own (vaguer) errors while it is happening.
  const shownError = silentDevice
    ? `“${silentDevice}” isn’t producing any audio. Click the icon left of the address bar → Microphone, and choose a different mic.`
    : error;

  return {
    supported, listening, interim, start, stop,
    error: shownError,
    deviceSilent: !!silentDevice,
    toggle: () => (listening ? stop() : start()),
  };
}

export function MicButton({
  listening, onClick, title, size = 18,
}: { listening: boolean; onClick: () => void; title?: string; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || (listening ? "Stop dictating" : "Dictate")}
      aria-label={title || (listening ? "Stop dictating" : "Dictate")}
      className={`relative shrink-0 grid place-items-center rounded-full transition ${
        listening ? "bg-[#C0392B] text-white" : "text-[#8A92A6] hover:text-brand hover:bg-brand-light/60"
      }`}
      style={{ width: size + 14, height: size + 14 }}
    >
      {listening && (
        // Pulse so it is obvious the mic is open — an always-on mic with no
        // indicator is the thing people rightly get uneasy about.
        <span className="absolute inset-0 rounded-full bg-[#C0392B] opacity-40 animate-ping" />
      )}
      <span className="relative">
        {listening ? <IconPlayerStopFilled size={size - 4} /> : <IconMicrophone size={size} stroke={1.8} />}
      </span>
    </button>
  );
}
