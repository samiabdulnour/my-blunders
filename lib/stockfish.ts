import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  UciSearch,
  uciToSan,
  type AnalyzeOpts,
  type AnalysisResult,
  type ChessEngine,
} from './engine/uci';

/**
 * Native Stockfish backend — spawns the local `stockfish` binary and speaks
 * UCI to it over stdin/stdout. Server-only (uses `node:child_process`), so it
 * must never be imported into client code.
 *
 * The UCI parsing itself lives in `lib/engine/uci.ts` and is shared with the
 * browser WASM backend; this file only owns the child_process transport.
 *
 * Requires Stockfish installed on the host machine:
 *   macOS:  brew install stockfish
 *   Linux:  apt install stockfish  (or equivalent)
 *
 * If the binary is missing, analyzePosition throws a clear error so the
 * caller can surface it in the UI.
 *
 * Performance note: each call spawns a fresh process. That's ~10ms of
 * overhead on top of the search itself — fine for batch puzzle-generation
 * (50 positions × depth 18 finishes in seconds), and dramatically simpler
 * than holding a long-running engine across requests. If you hit a
 * bottleneck, switch to a singleton engine pool keyed on FEN.
 */

// Re-export the shared types so existing importers of `@/lib/stockfish`
// (the API routes) keep working unchanged.
export type { AnalyzeOpts, AnalysisLine, AnalysisResult } from './engine/uci';

/**
 * Drive a single Stockfish process through one analysis request.
 * Resolves with the parsed `info ... pv ...` output for each multipv slot
 * after the engine emits `bestmove`.
 */
function runUci(opts: AnalyzeOpts): Promise<AnalysisResult> {
  const { fen, depth = 18, multiPv = 1 } = opts;

  return new Promise((resolve, reject) => {
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn('stockfish', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      reject(
        new Error(
          `Could not spawn 'stockfish': ${(err as Error).message}. ` +
            `Install it with 'brew install stockfish' (macOS) or 'apt install stockfish' (Linux).`
        )
      );
      return;
    }

    proc.on('error', (err) => {
      reject(
        new Error(
          `Stockfish error: ${err.message}. Is the 'stockfish' binary on your PATH? ` +
            `Try 'brew install stockfish' (macOS).`
        )
      );
    });

    const search = new UciSearch(fen, depth);
    let buffer = '';
    let settled = false;

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      // Split on newlines, but leave any trailing partial line in the buffer.
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        const result = search.handleLine(line);
        if (result && !settled) {
          settled = true;
          proc.stdin.end();
          resolve(result);
        }
      }
    });

    proc.stderr.on('data', () => {
      // Stockfish prints its banner to stderr; ignore.
    });

    // Drive the engine
    proc.stdin.write('uci\n');
    proc.stdin.write(`setoption name MultiPV value ${multiPv}\n`);
    proc.stdin.write('isready\n');
    proc.stdin.write(`position fen ${fen}\n`);
    proc.stdin.write(`go depth ${depth}\n`);

    // Safety timeout — kill the process if it goes longer than 30s
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill();
        reject(new Error(`Stockfish timed out at depth ${depth}`));
      }
    }, 30_000);
  });
}

export async function analyzePosition(opts: AnalyzeOpts): Promise<AnalysisResult> {
  return runUci(opts);
}

/** Convenience: just give me the best move at this position, as SAN. */
export async function bestMoveSan(fen: string, depth = 18): Promise<string | null> {
  const res = await analyzePosition({ fen, depth, multiPv: 1 });
  return res.lines[0]?.pvSan[0] ?? null;
}

/**
 * The native engine as a `ChessEngine`. Pass this to `generatePuzzlesFromGame`
 * from server routes; the browser passes the WASM engine instead.
 */
export const nodeEngine: ChessEngine = {
  analyze: analyzePosition,
  bestMoveSan,
  dispose() {
    // Nothing to release — each search spawns and tears down its own process.
  },
};

export { uciToSan };
