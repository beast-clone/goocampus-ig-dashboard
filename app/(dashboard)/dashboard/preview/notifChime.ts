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
 * Three notes, struck on something metal.
 *
 * The first version stacked a note with its own octave, which is a HARMONIC
 * stack — that is a flute or an organ pipe, and it sounded like one. A bell is
 * inharmonic: the partials sit at ratios that are deliberately not whole
 * numbers, and that clash is the entire reason a bell sounds like a bell. The
 * ratios below are a struck bar — the family a phone's message tone belongs to.
 *
 * Each partial also decays at its OWN rate, the high ones fastest. A bell has a
 * bright clang that dies immediately over a hum that rings on; decay them all
 * together and you get a beep.
 *
 * This is not Apple's tone — that file is theirs. It is the same idea: three
 * notes rising, struck and left to ring.
 */
export function playChime() {
  if (chimeMuted()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;

    // ratio from the fundamental, how loud, how long it rings
    const PARTIALS: [number, number, number][] = [
      [1.00, 0.20, 1.30],   // the hum — quietest to fade
      [2.00, 0.11, 0.85],
      [2.76, 0.09, 0.55],   // the inharmonic ones: what makes it metal
      [4.07, 0.06, 0.32],
      [5.43, 0.03, 0.18],   // the initial clang, gone almost at once
    ];
    // Up three, the way a message tone goes. C#6, E6, A6.
    const NOTES: [number, number][] = [[1108.7, 0.00], [1318.5, 0.13], [1760.0, 0.26]];

    for (const [freq, at] of NOTES) {
      const start = t0 + at;
      for (const [ratio, level, ring] of PARTIALS) {
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * ratio;
        // 4 ms to full: a strike, not a swell.
        vol.gain.setValueAtTime(0.0001, start);
        vol.gain.exponentialRampToValueAtTime(level, start + 0.004);
        vol.gain.exponentialRampToValueAtTime(0.0001, start + ring);
        osc.connect(vol).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + ring + 0.02);
      }
    }
  } catch { /* no audio on this device — the shake still carries it */ }
}
