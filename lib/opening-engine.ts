import { getWasmEngine } from './engine/wasm-engine';

/**
 * Shared Stockfish-eval helper for the Opening Clinic and the Opening Drill.
 * Both the per-node eval fill and the drill's "is this the best move?" check
 * read from one FEN-keyed cache, so a position is only ever analysed once.
 */
export interface EngineEval {
  cp: number | null;
  mate: number | null;
  bestUci: string;
  bestSan: string;
}

const cache = new Map<string, EngineEval | null>();

/** Synchronous peek (undefined = not analysed yet). */
export function peekEval(fen: string): EngineEval | null | undefined {
  return cache.get(fen);
}

/** Analyse a FEN with the WASM engine (depth 14), cached per position. */
export async function evalPosition(fen: string): Promise<EngineEval | null> {
  const hit = cache.get(fen);
  if (hit !== undefined) return hit;
  try {
    const res = await getWasmEngine().analyze({ fen, depth: 14 });
    const l = res.lines[0];
    const out: EngineEval | null = l
      ? { cp: l.cp, mate: l.mate, bestUci: l.pvUci[0] ?? '', bestSan: l.pvSan[0] ?? '' }
      : null;
    cache.set(fen, out);
    return out;
  } catch {
    cache.set(fen, null);
    return null;
  }
}

/** Depth for the poster's bulk pass. Every drawn position gets an eval, so this
 *  trades a little accuracy for speed: ~18ms/position versus ~44ms at the
 *  clinic's depth 14 (measured on the WASM build), i.e. seconds rather than
 *  tens of seconds for a full sheet. */
const POSTER_DEPTH = 12;

/** Shallow evals keyed by FEN, white-relative cp. Kept apart from the depth-14
 *  `cache` so a quick poster pass never downgrades what the clinic shows. */
const posterCache = new Map<string, number | null>();

/**
 * Evaluate every position on the poster, so each board can print an eval
 * instead of only the ~1-in-5 that came from a server-analysed game.
 *
 * Positions the clinic already analysed at depth 14 are reused as-is (better and
 * free); the rest are searched at POSTER_DEPTH and cached, so re-opening the
 * dialog or flipping orientation is instant. Searches are serialized by the
 * engine's own queue. `onProgress` reports only the positions actually searched.
 * Failures are cached as "no eval" rather than retried — a poster shouldn't hang
 * on a flaky engine.
 */
export async function fillPosterEvals(
  fens: string[],
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const todo: string[] = [];
  for (const fen of fens) {
    const deep = whiteCp(peekEval(fen));
    if (deep != null) { out.set(fen, deep); continue; }
    const shallow = posterCache.get(fen);
    if (shallow !== undefined) { if (shallow != null) out.set(fen, shallow); continue; }
    if (!todo.includes(fen)) todo.push(fen);
  }
  onProgress?.(0, todo.length);
  let done = 0;
  for (const fen of todo) {
    if (shouldStop?.()) break;
    try {
      const res = await getWasmEngine().analyze({ fen, depth: POSTER_DEPTH });
      const l = res.lines[0];
      const cp = l ? (l.mate != null ? (l.mate > 0 ? 10000 : -10000) : l.cp) : null;
      posterCache.set(fen, cp);
      if (cp != null) out.set(fen, cp);
    } catch {
      posterCache.set(fen, null);
    }
    onProgress?.(++done, todo.length);
  }
  return out;
}

/** One candidate move from a multi-PV search (cp is white-relative). */
export interface EngineMove {
  uci: string;
  san: string;
  cp: number | null;
  mate: number | null;
}

/**
 * Top candidate moves at a position (multi-PV), best first. Used by the drill
 * to pick a *varied but good* opponent reply so a line isn't always identical.
 * Not cached — callers want fresh variety, and these are one-off per ply.
 */
export async function candidateMoves(fen: string, multiPv = 4, depth = 12): Promise<EngineMove[]> {
  try {
    const res = await getWasmEngine().analyze({ fen, depth, multiPv });
    return res.lines
      .map((l) => ({ uci: l.pvUci[0] ?? '', san: l.pvSan[0] ?? '', cp: l.cp, mate: l.mate }))
      .filter((m) => m.uci);
  } catch {
    return [];
  }
}

/** White-relative cp from an engine result (undefined = not computed yet). */
export function whiteCp(e: EngineEval | null | undefined): number | null | undefined {
  if (e === undefined) return undefined;
  if (e === null) return null;
  if (e.mate !== null) return e.mate > 0 ? 10000 : -10000;
  return e.cp;
}
