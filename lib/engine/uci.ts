import { Chess } from 'chess.js';

/**
 * Transport-agnostic UCI plumbing shared by every Stockfish backend.
 *
 * The same engine speaks the same UCI protocol whether it's a native binary
 * driven over stdin/stdout (`lib/stockfish.ts`, server) or a WASM build driven
 * over Web Worker messages (`lib/engine/wasm-engine.ts`, browser). Only the
 * transport differs, so the parsing — and the `ChessEngine` contract the rest
 * of the app codes against — lives here, free of any Node or browser imports.
 */

export interface AnalyzeOpts {
  fen: string;
  /** Search depth. Default 18 — strong, fast for personal use. */
  depth?: number;
  /** Number of principal variations. Default 1 (just the best move). */
  multiPv?: number;
}

export interface AnalysisLine {
  /** Eval in centipawns (white-positive). null if `mate` is set. */
  cp: number | null;
  /** Moves to mate, signed (positive = white mates). null if `cp` is set. */
  mate: number | null;
  /** UCI moves of the principal variation. */
  pvUci: string[];
  /** Same PV converted to SAN — matches what the puzzle UI compares against. */
  pvSan: string[];
}

export interface AnalysisResult {
  fen: string;
  depth: number;
  /** Principal variations, sorted best-first. */
  lines: AnalysisLine[];
}

/**
 * What the puzzle pipeline needs from an engine. Implementations: `nodeEngine`
 * (server child_process) and the WASM worker engine (browser). Injecting this
 * into `generatePuzzlesFromGame` is what lets the exact same generation logic
 * run on the server *or* entirely on the client.
 */
export interface ChessEngine {
  analyze(opts: AnalyzeOpts): Promise<AnalysisResult>;
  /** Convenience: best move at this position, as SAN. */
  bestMoveSan(fen: string, depth?: number): Promise<string | null>;
  /** Release any held resources (worker / process pool). */
  dispose(): void;
}

/** Convert a UCI move ("e2e4", "e7e8q") to SAN against a given FEN. */
export function uciToSan(fen: string, uci: string): string {
  const c = new Chess(fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
  const m = c.move({ from, to, promotion });
  return m.san;
}

export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of uciMoves) {
    const from = u.slice(0, 2);
    const to = u.slice(2, 4);
    const promotion = u.length > 4 ? u.slice(4, 5) : undefined;
    try {
      const m = c.move({ from, to, promotion });
      out.push(m.san);
    } catch {
      break; // engine sometimes emits truncated PVs in low-time scenarios
    }
  }
  return out;
}

/**
 * Accumulates the `info ... pv ...` lines for a single `go` search and
 * finalizes into an `AnalysisResult` the moment `bestmove` arrives.
 *
 * Feed every line the engine emits into `handleLine`. It returns `null` while
 * the search is still running and the finished result on the terminating
 * `bestmove` line — so each transport just resolves its promise on the first
 * non-null return.
 */
export class UciSearch {
  /** Per-multipv slot — index 1 = best line. Updated many times during search. */
  private readonly lines = new Map<number, AnalysisLine>();

  constructor(
    private readonly fen: string,
    private readonly depth: number
  ) {}

  handleLine(line: string): AnalysisResult | null {
    if (line.startsWith('info ') && line.includes(' pv ')) {
      const mpvMatch = line.match(/\bmultipv\s+(\d+)\b/);
      const cpMatch = line.match(/\bscore cp\s+(-?\d+)/);
      const mateMatch = line.match(/\bscore mate\s+(-?\d+)/);
      const pvMatch = line.match(/\bpv\s+(.+?)(?:\s+(?:bmc|hashfull|nps|tbhits|time|nodes|depth)\s+|$)/);
      const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
      const pvUci = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];
      if (pvUci.length === 0) return null;

      // White-relative score: Stockfish reports cp from side-to-move POV;
      // flip the sign when it's black to move so callers always get a
      // white-positive value.
      const sideToMove = this.fen.split(' ')[1]; // 'w' or 'b'
      const flip = sideToMove === 'b' ? -1 : 1;

      const cp = cpMatch ? parseInt(cpMatch[1], 10) * flip : null;
      const mate = mateMatch ? parseInt(mateMatch[1], 10) * flip : null;

      let pvSan: string[] = [];
      try {
        pvSan = uciLineToSan(this.fen, pvUci);
      } catch {
        // ignore — partial/illegal PV
      }

      this.lines.set(mpv, { cp, mate, pvUci, pvSan });
      return null;
    }

    if (line.startsWith('bestmove')) {
      const sorted = Array.from(this.lines.entries())
        .sort(([a], [b]) => a - b)
        .map(([, v]) => v);
      return { fen: this.fen, depth: this.depth, lines: sorted };
    }

    return null;
  }
}
