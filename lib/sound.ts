/**
 * Move sound.
 *
 * These are recordings of a real set on a real board, made on a phone and
 * trimmed to the knock. That sentence is the whole design note.
 *
 * Second recording ("Bondi Rd"), and the numbers say why it replaced the
 * first: no clipping at all, a room 15dB quieter, and — the part you actually
 * hear — three quarters of the energy above 1.2kHz on the hard takes, where
 * the first recording put four fifths of it between 400Hz and 1.2kHz with
 * almost nothing on top. That low-mid pile-up is what "hollow" was. A
 * 4th-order high-pass at 130Hz takes out the handling rumble underneath;
 * everything else is the board.
 *
 * This was synthesised for a long time, for good reasons — nothing to license,
 * nothing to download, works offline — and it never once sounded like wood.
 * Filtered noise is a hiss; stacked sine partials are a marimba; a bank of
 * ringing resonators is closer and still, audibly, a computer pretending. Wood
 * has a dense, irregular spectrum with every mode decaying at its own rate,
 * and the ear knows the difference immediately even when it cannot say why.
 * Lichess sounds right because Lichess is playing a recording. So is this now.
 *
 * (Their sound set is not an option to borrow: lichess-org/lila's COPYING.md
 * lists the standard sounds under "Exceptions (non-free)".)
 *
 * Five takes, so a long game does not sound machine-stamped: three dry ones
 * for a move, two heavier and longer for a capture, chosen at random, with a
 * few percent of playback-rate wobble on top. Together that is ~40KB, decoded
 * once on the first gesture and thereafter free to fire.
 *
 * Synthesis survives as a fallback, and only that: if the files cannot be
 * fetched or decoded, a move still makes a noise.
 */

const KEY = 'mb.sound';

const MOVE_TAKES = ['/sounds/move-1.m4a', '/sounds/move-2.m4a', '/sounds/move-3.m4a'];
const CAPTURE_TAKES = ['/sounds/capture-1.m4a', '/sounds/capture-2.m4a'];

/** Sound on? Defaults to on; only an explicit "0" turns it off. */
export function loadSound(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(KEY) !== '0';
}

export function saveSound(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, on ? '1' : '0');
  enabled = on;
}

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
/** Cached preference; read from storage on first use. */
let enabled: boolean | null = null;

/** Decoded takes, by url. Populated once, lazily. */
const takes = new Map<string, AudioBuffer>();
let loading = false;

/** Keep the in-memory flag in step with a toggle elsewhere in the UI. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Fetch and decode every take. Fired on the first move rather than at import:
 * before a user gesture there is no running AudioContext to decode into, and
 * on iOS creating one early just earns a suspended context and a warning.
 * Failures are silent and permanent-ish — the synth fallback covers them.
 */
function warm(c: AudioContext): void {
  if (loading) return;
  loading = true;
  [...MOVE_TAKES, ...CAPTURE_TAKES].forEach((url) => {
    fetch(url)
      // Deliberately not checking `response.ok`, which cost an evening. In the
      // native app these files come off the Capacitor scheme handler rather
      // than a web server, and a custom URL scheme has no HTTP status to
      // report: every one of them arrives status 0, ok false, body entirely
      // intact. Gating on ok threw away five perfectly good files and left the
      // app on the synth fallback for ever, silently, because the catch below
      // treats a rejection as "no sound available". If the bytes are wrong,
      // decodeAudioData is the thing that will say so.
      .then((r) => r.arrayBuffer())
      .then(
        (buf) =>
          new Promise<AudioBuffer>((resolve, reject) => {
            // The callback form, not the promise form: older WebKit only has
            // this one, and this is exactly the browser that matters here.
            c.decodeAudioData(buf, resolve, reject);
          })
      )
      .then((decoded) => {
        takes.set(url, decoded);
      })
      .catch(() => {
        /* fallback covers it */
      });
  });
}

/**
 * Decode ahead of the first move.
 *
 * `warm` needs a running AudioContext, and iOS only gives you one inside a
 * user gesture — so the earliest possible moment is the first touch anywhere
 * in the app, not the first move. Without this the opening move of a session
 * always fell through to the synth, because the fetches it kicked off had not
 * landed yet: the one move most likely to be judged, played by the one code
 * path meant never to be heard.
 */
if (typeof window !== 'undefined') {
  const first = () => {
    window.removeEventListener('pointerdown', first, true);
    window.removeEventListener('keydown', first, true);
    const c = audio();
    if (c) warm(c);
  };
  window.addEventListener('pointerdown', first, true);
  window.addEventListener('keydown', first, true);
}

/** A piece landing on the board. Safe to call anywhere — never throws. */
export function playMove(capture = false): void {
  if (enabled === null) enabled = loadSound();
  if (!enabled) return;
  const c = audio();
  if (!c) return;
  try {
    // iOS keeps the context suspended until a user gesture; a move is one.
    if (c.state === 'suspended') void c.resume();
    warm(c);

    const pool = (capture ? CAPTURE_TAKES : MOVE_TAKES).filter((u) => takes.has(u));
    if (!pool.length) {
      synth(c, capture);
      return;
    }

    const buf = takes.get(pool[Math.floor(Math.random() * pool.length)]);
    if (!buf) return;

    const src = c.createBufferSource();
    src.buffer = buf;
    // A few percent either way. Real repeats are never identical, and the
    // takes alone are not quite enough variation over a long game.
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.045;

    const g = c.createGain();
    g.gain.value = (capture ? 0.95 : 0.8) * (1 + (Math.random() * 2 - 1) * 0.06);

    src.connect(g);
    g.connect(c.destination);
    src.start(c.currentTime);
  } catch {
    /* Audio is a nicety — never let it break a move. */
  }
}

/* ── Fallback ─────────────────────────────────────────────────────────────
   Only reached if the takes are missing or undecodable. Not meant to be
   good; meant to be present. */

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = Math.floor(c.sampleRate * 0.12);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

function synth(c: AudioContext, capture: boolean): void {
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(capture ? 2000 : 1450, t);
  lp.frequency.exponentialRampToValueAtTime(capture ? 520 : 460, t + 0.055);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(capture ? 0.5 : 0.32, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (capture ? 0.1 : 0.075));

  src.connect(lp);
  lp.connect(gain);
  gain.connect(c.destination);
  src.start(t);
  src.stop(t + 0.14);
}
