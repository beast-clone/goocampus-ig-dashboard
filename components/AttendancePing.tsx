"use client";
import { useEffect } from "react";

// Attendance heartbeat (docs/ATTENDANCE_SPEC.md). Opening any dashboard page marks
// arrival; after that, every 5 minutes — but only while the tab is on screen AND the
// person has moved the mouse or typed in those 5 minutes — so a tab left open overnight
// doesn't keep someone "working". The server stamps the signed-in person, never a body field.
const EVERY = 5 * 60 * 1000;

const ping = () =>
  fetch("/api/my-day/attendance", {
    method: "POST", keepalive: true, credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ping" }),
  }).catch(() => {});

export function AttendancePing() {
  useEffect(() => {
    let lastInput = Date.now();
    const seen = () => { lastInput = Date.now(); };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, seen, { passive: true }));
    ping();
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInput < EVERY) ping();
    }, EVERY);
    return () => { clearInterval(t); events.forEach((e) => window.removeEventListener(e, seen)); };
  }, []);
  return null;
}
