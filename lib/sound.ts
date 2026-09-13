/**
 * Board sounds.
 *
 * Synthesised with the Web Audio API rather than played from files. Three
 * reasons: a move has to be *heard* the instant it lands, and a sample that
 * still has to be fetched and decoded is late the first time it matters; the
 * app is meant to work offline on a phone, so a set of recordings is weight it
 * would carry forever; and recorded piece sets belong to whoever recorded
 * them, which is not a thing to borrow.
 *
 * The pieces are wood, so a move is built like a knock on wood: a very short
 * band-passed noise burst for the contact, under it a couple of fast-decaying
 * partials for the body of the piece. Every hit is detuned slightly, because
 * identical repeats are most of what makes synthesised sound read as cheap —
 * real wood never lands twice the same way.
 */

export type Cue = 'move' | 'capture' | 'castle' | 'check' | 'correct' | 'wrong' | 'end';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let unlockInstalled = false;
let enabled = true;

/** Overall level. Deliberately reserved — these fire on every single move, and
 *  a move sound you notice is a move sound you will come to hate. */
const MASTER_GAIN = 0.45;

type AudioCtor = typeof AudioContext;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const AC: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  // One second of white noise, reused by every percussive cue.
  const len = Math.floor(ctx.sampleRate * 0.4);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** iOS hands out audio contexts suspended and only lets a real user gesture
 *  start them, so the first tap anywhere in the app wakes ours up. The silent
 *  one-frame buffer is the part that actually convinces WebKit. */
export function installUnlock(): void {
  if (typeof window === 'undefined' || unlockInstalled) return;
  unlockInstalled = true;
  const go = () => {
    const c = ensure();
    if (!c) return;
    void c.resume();
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start(0);
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  // Deliberately does NOT build a context. Restoring the stored preference
  // happens on mount, long before anyone has touched the screen, and an
  // AudioContext created outside a user gesture is born suspended on iOS and
  // earns a console warning everywhere else. `installUnlock` builds it on the
  // first real tap; all this has to do is resume one that already exists.
  if (on && ctx && ctx.state === 'suspended') void ctx.resume();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Random walk around a value, as a fraction. */
const jitter = (v: number, pct: number) => v * (1 + (Math.random() * 2 - 1) * pct);

/** Exponential ramps can't reach zero, so silence is a very small number. */
const SILENT = 0.0001;

function envelope(g: GainNode, t0: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(SILENT, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t0 + attack + decay);
}

function tone(
  c: AudioContext,
  t0: number,
  freq: number,
  peak: number,
  decay: number,
  type: OscillatorType = 'triangle',
  attack = 0.004
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = c.createGain();
  envelope(g, t0, peak, attack, decay);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + attack + decay + 0.05);
}

function burst(
  c: AudioContext,
  t0: number,
  freq: number,
  q: number,
  peak: number,
  decay: number
) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t0);
  f.Q.value = q;
  const g = c.createGain();
  envelope(g, t0, peak, 0.001, decay);
  s.connect(f).connect(g).connect(master!);
  s.start(t0);
  s.stop(t0 + decay + 0.08);
}

/** A piece set down on the board: contact noise plus the body of the piece. */
function knock(c: AudioContext, t0: number, level = 1) {
  burst(c, t0, jitter(1550, 0.14), 1.1, 0.5 * level, 0.042);
  tone(c, t0, jitter(196, 0.07), 0.26 * level, 0.075, 'triangle', 0.002);
  tone(c, t0, jitter(324, 0.07), 0.1 * level, 0.05, 'sine', 0.002);
}

function render(cue: Cue, c: AudioContext, t0: number) {
  switch (cue) {
    case 'move':
      knock(c, t0);
      break;

    // Wood on wood: a brighter, harder contact and a lower thud under it, so a
    // capture is recognisable without having to be louder.
    case 'capture':
      burst(c, t0, jitter(2500, 0.12), 0.9, 0.62, 0.065);
      burst(c, t0 + 0.006, jitter(520, 0.12), 1.4, 0.45, 0.085);
      tone(c, t0, jitter(138, 0.06), 0.3, 0.1, 'triangle', 0.002);
      break;

    // Two pieces land, king then rook, close enough to read as one gesture.
    case 'castle':
      knock(c, t0, 0.95);
      knock(c, t0 + 0.085, 0.75);
      break;

    // Not wood — a short rising pair that cuts through the move sound, since
    // check is information rather than texture.
    case 'check':
      tone(c, t0, 784, 0.2, 0.09);
      tone(c, t0 + 0.075, 1175, 0.22, 0.13);
      break;

    // A struck bell: one fundamental with inharmonic partials above it, each
    // quieter and shorter than the last, which is what separates a bell from a
    // beep. Started a fraction late so it answers the knock of the move rather
    // than colliding with it.
    case 'correct': {
      const t = t0 + 0.06;
      const f = 880;
      // Ratios from a real strike tone — deliberately not whole multiples.
      tone(c, t, f, 0.2, 0.9, 'sine', 0.002);
      tone(c, t, f * 2, 0.1, 0.55, 'sine', 0.002);
      tone(c, t, f * 2.76, 0.06, 0.35, 'sine', 0.002);
      tone(c, t, f * 5.4, 0.025, 0.18, 'sine', 0.002);
      // A second strike a fifth up: the phrase resolves instead of just ringing.
      tone(c, t + 0.13, f * 1.5, 0.14, 0.8, 'sine', 0.002);
      tone(c, t + 0.13, f * 1.5 * 2.76, 0.04, 0.3, 'sine', 0.002);
      break;
    }

    // Low, dull and falling. Unpleasant on purpose, but brief.
    case 'wrong': {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t0);
      o.frequency.exponentialRampToValueAtTime(188, t0 + 0.22);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t0);
      const g = c.createGain();
      envelope(g, t0, 0.17, 0.008, 0.23);
      o.connect(lp).connect(g).connect(master!);
      o.start(t0);
      o.stop(t0 + 0.3);
      break;
    }

    // The game is over: three notes, settled rather than triumphant, since it
    // plays on losses too.
    case 'end':
      tone(c, t0, 523, 0.17, 0.16);
      tone(c, t0 + 0.12, 659, 0.17, 0.16);
      tone(c, t0 + 0.24, 784, 0.19, 0.3);
      break;
  }
}

/** Play a cue. Cheap to call and safe anywhere: it does nothing before the
 *  context has been unlocked, on the server, or when sound is switched off. */
export function play(cue: Cue): void {
  if (!enabled) return;
  const c = ensure();
  if (!c || !master) return;
  // Coming back from the background leaves the context suspended.
  if (c.state === 'suspended') {
    void c.resume();
    return;
  }
  try {
    render(cue, c, c.currentTime + 0.001);
  } catch {
    /* A cue is never worth throwing over. */
  }
}
