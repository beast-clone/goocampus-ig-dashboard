// The sound the bell makes.
//
// Synthesised rather than shipped as a file: it is about forty lines, it weighs
// nothing, and there is no asset to license, host or cache-bust. Two partials a
// fifth apart with a fast attack and a long decay is what a small bell actually
// does — a single sine reads as a doorbell buzzer.
//
// Browsers refuse to make noise before the person has interacted with the page, so
// the first call may do nothing. That is fine: the bell still shakes, and the next
// one is audible. Nothing here ever throws.

const MUTE_KEY = "gc-notif-muted";

export function chimeMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function setChimeMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* private mode */ }
}

let ctx: AudioContext | null = null;

/** A short, soft two-tone chime. Silent when muted, or when the browser says no. */
export function playChime() {
  if (chimeMuted()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // E6 and B6 — a fifth, struck together, the higher one quieter and shorter.
    const partials: [number, number, number][] = [[1318.5, 0.16, 1.5], [1975.5, 0.07, 1.0]];
    for (const [freq, gain, seconds] of partials) {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Struck, not faded in: 6 ms to full, then an exponential tail.
      vol.gain.setValueAtTime(0.0001, now);
      vol.gain.exponentialRampToValueAtTime(gain, now + 0.006);
      vol.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      osc.connect(vol).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + seconds + 0.02);
    }
  } catch { /* no audio on this device — the shake still carries it */ }
}
