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

export function useVoiceInput({ onFinalText, lang = "en-IN" }: { onFinalText: (text: string) => void; lang?: string }) {
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

  return { supported, listening, interim, error, start, stop, toggle: () => (listening ? stop() : start()) };
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
