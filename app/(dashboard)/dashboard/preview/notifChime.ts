// The sound the bell makes.
//
// Synthesised rather than shipped as a file: it weighs nothing, there is no asset
// to license, host or cache-bust, and Apple's own tones are theirs. This is the
// same SHAPE as a phone message tone — three notes up and a settle — not a copy
// of one.
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

/**
 * Three notes, struck and left to ring — the shape of a phone's message tone
 * rather than a soft two-note ding, which Praveen found too easy to miss (28 Sep).
 *
 * Each note is a sine with a quieter octave above it: a pure sine reads as a test
 * tone, and the octave is what makes it sound struck, like a chime bar. Six
 * milliseconds to full, then a fast exponential tail, so it is percussive rather
 * than a hum.
 */
export function playChime() {
  if (chimeMuted()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;

    // Up, up, and settle — the figure a message tone makes.
    // A5, D6, A6, then back to D6 so it lands rather than trails off.
    const notes: [number, number, number][] = [
      [880.0, 0.00, 0.26],
      [1174.7, 0.11, 0.26],
      [1760.0, 0.22, 0.30],
      [1174.7, 0.33, 0.70],
    ];

    for (const [freq, at, len] of notes) {
      const start = t0 + at;
      for (const [mult, level] of [[1, 0.17], [2, 0.05]] as [number, number][]) {
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * mult;
        vol.gain.setValueAtTime(0.0001, start);
        vol.gain.exponentialRampToValueAtTime(level, start + 0.006);
        vol.gain.exponentialRampToValueAtTime(0.0001, start + len);
        osc.connect(vol).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + len + 0.02);
      }
    }
  } catch { /* no audio on this device — the shake still carries it */ }
}
