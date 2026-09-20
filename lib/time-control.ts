/**
 * Time controls for Assisted Play.
 *
 * Three parts, all pure and framework-free so PlayMode can drive the clocks and
 * the tests can exercise the model directly:
 *   · the preset table (base + Fischer increment, in milliseconds);
 *   · `formatMs` — a clock formatter (mm:ss, dropping to tenths under 20s);
 *   · `engineThinkMs` — a human-time model for how long the engine "thinks" on a
 *     move, so a timed game feels like facing a person on that clock rather than
 *     a fixed reply delay.
 *
 * Everything here is in ms. `base === 0` is the sentinel for "Off" — no clock,
 * today's fixed-delay behaviour.
 */

export interface TimeControl {
  /** Stable id, persisted to storage and used for the picker's active state. */
  id: string;
  /** Short label for the picker button ("Off", "3+2", …). */
  label: string;
  /** Base time per side, in milliseconds. 0 === no clock (Off). */
  base: number;
  /** Fischer increment added to a side after it completes a move, in ms. */
  inc: number;
}

/** Presets, base+increment. "Off" is first and the default. */
export const TIME_CONTROLS: readonly TimeControl[] = [
  { id: 'off', label: 'Off', base: 0, inc: 0 },
  { id: '1+0', label: '1+0', base: 60_000, inc: 0 },
  { id: '3+2', label: '3+2', base: 180_000, inc: 2_000 },
  { id: '5+0', label: '5+0', base: 300_000, inc: 0 },
  { id: '10+0', label: '10+0', base: 600_000, inc: 0 },
  { id: '15+10', label: '15+10', base: 900_000, inc: 10_000 },
];

/** The "Off" preset (no clock). */
export const OFF_TC: TimeControl = TIME_CONTROLS[0];

/** Resolve a stored id to a preset, falling back to Off for anything unknown. */
export function timeControlById(id: string | null | undefined): TimeControl {
  return TIME_CONTROLS.find((t) => t.id === id) ?? OFF_TC;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * A clock reading. mm:ss normally; under 20s it drops to tenths (`0:09.4`) so
 * the final seconds read with some tension. Never negative.
 */
export function formatMs(ms: number): string {
  const t = Math.max(0, ms);
  const totalSec = Math.floor(t / 1000);
  if (t >= 20_000) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  // Under 20s: minutes are always 0, show seconds.tenths.
  const tenths = Math.floor((t % 1000) / 100);
  return `0:${String(totalSec).padStart(2, '0')}.${tenths}`;
}

/**
 * How long the engine should spend on this move to feel like a human playing on
 * the given clock: quick and book-like in the opening, longer on sharp/complex
 * middlegame positions, snappy in time trouble, with real variance so it isn't
 * metronomic. Returns a target in ms — the caller waits so the move's *total*
 * elapsed (compute + wait) lands near it, and the engine's clock decrements by
 * that real elapsed.
 *
 * Pure: `rand` is injected (pass `Math.random` in the app, a stub in tests) and
 * every signal is a plain number/boolean read off chess.js at the engine's
 * position. The caller still caps the result under the engine's remaining time
 * so it can never flag itself.
 */
/**
 * The empirical "camel-hump" of human time-per-move across a game. Averaged over
 * millions of online games, average thinking time is low while play is booked,
 * climbs steeply once players leave theory into the sharpest phase (crest around
 * move ~18), then falls as material simplifies. Modelled as a Gaussian bump over
 * the full move number. It averages ≈1 over a game, so it *redistributes* the
 * per-move budget toward the middlegame rather than inflating it. `moveNo` is the
 * 1-based full move number.
 */
function phaseWeight(moveNo: number): number {
  const bell = Math.exp(-((moveNo - 18) ** 2) / (2 * 12 * 12));
  return 0.35 + 1.05 * bell; // ~0.4 in the opening/endgame tails, ~1.4 at the crest
}

export function engineThinkMs({
  remainingMs,
  incrementMs,
  ply,
  legalMoves,
  inCheck,
  complexity,
  rand,
}: {
  /** The engine's remaining clock, in ms. */
  remainingMs: number;
  /** The time control's Fischer increment, in ms. */
  incrementMs: number;
  /** Plies already played (history length) — drives the phase curve. */
  ply: number;
  /** Legal moves in the engine's position (a branching-factor proxy). */
  legalMoves: number;
  /** Whether the engine is in check (forced replies come faster). */
  inCheck: boolean;
  /** How hard the choice is, 0..1, from the engine's candidate evals: 0 ≈ an
   *  obvious / forced / only move, 1 ≈ a genuine crossroads. The dominant signal. */
  complexity: number;
  /** Injected RNG in [0,1). */
  rand: () => number;
}): number {
  const moveNo = Math.floor(ply / 2) + 1;

  // A human's fair share of the clock for one move: what's left split over an
  // estimate of the moves ahead, plus part of the increment (which refills). It
  // shrinks naturally as the game wears on and the clock drains. Capped so the
  // longest control (15+10) doesn't average minute-long thinks.
  const movesLeft = clamp(48 - moveNo, 14, 42);
  const budget = Math.min(15_000, (remainingMs / movesLeft) * 0.95 + incrementMs * 0.6);

  // How hard is *this* move? The engine's forcedness read dominates — it can tell
  // an obvious recapture from a real fork, which raw legal-move count can't — with
  // the branching factor only a light top-up. In check ⇒ forced, snap.
  const branch = clamp((legalMoves - 6) / 28, 0, 1);
  let hard = clamp(0.82 * complexity + 0.18 * branch, 0, 1);
  if (inCheck) hard = Math.min(hard, 0.15);

  // Map hardness to a WIDE effort span the phase curve alone can't give: an
  // obvious move collapses toward the floor, a real crossroads gets a deep think.
  // Quadratic so easy moves drop off fast. hard 0 → 0.25×, 0.5 → ~0.85×, 1 → ~2.65×.
  const effort = 0.25 + hard * hard * 2.4;

  let t = budget * phaseWeight(moveNo) * effort;

  // Unpredictability: a wide lognormal so even similar positions don't take the
  // same time — most cluster, but fast and slow outliers are common (a person
  // will sometimes rattle out a hard-looking move they'd already seen, and stew
  // over an easy one).
  const gauss = (rand() + rand() + rand() - 1.5) / 0.5;
  t *= Math.exp(0.55 * gauss);

  // A genuinely complex middlegame position occasionally gets a long, deep think.
  if (hard > 0.55 && moveNo >= 8 && moveNo <= 40 && rand() < 0.13) t *= 1.6 + rand() * 1.1;

  // Booked opening: hard, absolute speed caps so the first moves rattle out fast
  // no matter how much time is on the clock (a 15+10 engine still blitzes 1.e4).
  if (moveNo <= 3) t = Math.min(t, 250 + rand() * 650); // 0.25–0.9s
  else if (moveNo <= 6) t = Math.min(t, 700 + rand() * 1500); // 0.7–2.2s

  // Obvious / forced / only move → snap it out in ~1s, even deep in the middlegame
  // (the whole point of the complexity read). Keyed off the engine's verdict, not
  // the legal-move count, and applied after the variance so it stays reliably fast.
  const obvious = complexity < 0.12 || (inCheck && legalMoves <= 3);
  if (obvious) t = Math.min(t, 400 + rand() * 800); // ~0.4–1.2s

  // Time trouble: hurry hard as the flag nears, and never spend a big slice of
  // what's left — together these guarantee the engine can't flag itself.
  if (remainingMs < 20_000) {
    const panic = remainingMs / 20_000;
    t *= panic * panic; // squared: calm near 20s, frantic by 5s
  }
  t = Math.min(t, remainingMs * 0.3);

  return clamp(t, 120, 45_000);
}
