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

/** White-relative cp from an engine result (undefined = not computed yet). */
export function whiteCp(e: EngineEval | null | undefined): number | null | undefined {
  if (e === undefined) return undefined;
  if (e === null) return null;
  if (e.mate !== null) return e.mate > 0 ? 10000 : -10000;
  return e.cp;
}
