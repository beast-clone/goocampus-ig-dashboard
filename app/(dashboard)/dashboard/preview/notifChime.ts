// The sounds the dashboard makes: the bell, and a message in the team chat.
//
// Praveen supplied the file (28 Sep), after three attempts at synthesising one
// landed variously as a flute, a church bell and something that rang in the ears.
// A real recording ends that argument.
//
// The synthesised tone is kept as a fallback, for the case where the file cannot
// be fetched — a cold cache on a bad connection, or an offline tab. A bell that
// sometimes makes no sound is worse than one that occasionally sounds different.
//
// Browsers refuse to make noise before the person has interacted with the page, so
// the first call may do nothing. That is fine: the bell still shakes, and the next
// one is audible. Nothing here ever throws.

const SOUND_URL = "/sounds/notification.mp3";
const CHAT_SOUND_URL = "/sounds/chat.mp3";
let el: HTMLAudioElement | null = null;
let chatEl: HTMLAudioElement | null = null;

const MUTE_KEY = "gc-notif-muted";

export function chimeMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function setChimeMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* private mode */ }
}

let ctx: AudioContext | null = null;

/** A message in the team chat. Its own sound, so you know which it was without looking. */
export function playChatChime() {
  if (chimeMuted()) return;
  try {
    chatEl = chatEl || new Audio(CHAT_SOUND_URL);
    chatEl.volume = 0.55;
    chatEl.currentTime = 0;
    const p = chatEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch { /* silence is the only failure mode, and it is survivable */ }
}

/** The bell. The recording when it loads, the synthesised tone when it does not. */
export function playChime() {
  if (chimeMuted()) return;
  try {
    el = el || new Audio(SOUND_URL);
    el.volume = 0.6;
    el.currentTime = 0;
    const played = el.play();
    // .play() rejects when the browser blocks autoplay, and ALSO when the file is
    // missing — only the second is worth falling back for, and they are not
    // distinguishable here. Falling back on both is harmless: a blocked page makes
    // no sound either way.
    if (played && typeof played.catch === "function") played.catch(() => playSynthesised());
  } catch {
    playSynthesised();
  }
}

/**
 * Fallback: three soft notes — a wooden bar, not a bell.
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
function playSynthesised() {
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
