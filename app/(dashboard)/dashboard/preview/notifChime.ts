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
 * Three soft notes — a wooden bar, not a bell.
 *
 * The previous version rang in the ears (Praveen, 28 Sep) for three reasons, and
 * all three are fixed here:
 *
 *   · it was PITCHED TOO HIGH. Fundamentals above 1.1 kHz with partials reaching
 *     9 kHz land right where the ear is most sensitive. Everything is down about
 *     a fifth now, and nothing above 3 kHz survives the filter.
 *   · it used INHARMONIC partials (2.76, 4.07). Those belong to a struck church
 *     bell, and at that pitch they beat against each other and bite. A phone's
 *     message tone is a marimba or a glockenspiel: fundamental, a quiet fourth
 *     harmonic, and little else.
 *   · it was simply LOUD — five partials summing near half of full scale.
 *
 * A low-pass at 2.6 kHz takes the last of the edge off, and each note is given a
 * gentle 12 ms attack rather than a 4 ms strike, which is the difference between
 * a tap and a click.
 */
export function playChime() {
  if (chimeMuted()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;

    // One filter for the whole tone — the edge comes off everything at once.
    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 2600;
    soft.Q.value = 0.7;
    const out = ctx.createGain();
    out.gain.value = 0.55;            // quiet by default; it only has to be noticed
    soft.connect(out).connect(ctx.destination);

    // Marimba: the fundamental, and a fourth harmonic well underneath it.
    const PARTIALS: [number, number, number][] = [
      [1, 0.15, 0.90],
      [4, 0.025, 0.28],
    ];
    // E5, A5, C#6 — rising, and low enough to sit under the ear's sore spot.
    const NOTES: [number, number][] = [[659.3, 0.00], [880.0, 0.15], [1108.7, 0.30]];

    for (const [freq, at] of NOTES) {
      const start = t0 + at;
      for (const [ratio, level, ring] of PARTIALS) {
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * ratio;
        vol.gain.setValueAtTime(0.0001, start);
        vol.gain.exponentialRampToValueAtTime(level, start + 0.012);
        vol.gain.exponentialRampToValueAtTime(0.0001, start + ring);
        osc.connect(vol).connect(soft);
        osc.start(start);
        osc.stop(start + ring + 0.02);
      }
    }
  } catch { /* no audio on this device — the shake still carries it */ }
}
