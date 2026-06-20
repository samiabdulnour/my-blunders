import {
  UciSearch,
  type AnalyzeOpts,
  type AnalysisResult,
  type ChessEngine,
} from './uci';

/**
 * Browser Stockfish backend — drives the WASM build in a Web Worker.
 *
 * This is the client-side counterpart to the server's `nodeEngine`. Instead of
 * spawning a `stockfish` process per analysis on our server (which doesn't
 * scale — every concurrent import fights for the same CPU), each user's own
 * device runs the engine. The backend shrinks to a thin Lichess PGN proxy.
 *
 * We use the **lite single-threaded** build (`stockfish-18-lite-single`,
 * ~7.3 MB) on purpose: it needs no `SharedArrayBuffer`, so it runs without the
 * cross-origin-isolation (COOP/COEP) headers a multi-threaded build would
 * require — meaning it works in a plain browser tab with zero server config.
 *
 * The engine files are served as static assets from `public/stockfish/`, so
 * the worker URL is same-origin in the web build.
 *
 * Stockfish (and this WASM build) is GPL-3.0. Shipping it to the browser is
 * "conveying" under the GPL — see `public/stockfish/README.md` for the source
 * offer and license notice that keeps the web distribution compliant.
 */

/** Same-origin path to the vendored worker entry. */
const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js';
/** How long to wait for the engine to load + answer `isready` before giving up. */
const BOOT_TIMEOUT_MS = 30_000;
/** Per-search ceiling, mirroring the server engine's safety timeout. */
const SEARCH_TIMEOUT_MS = 30_000;

class WasmEngine implements ChessEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  /**
   * The handler for the *current* phase (boot handshake or active search).
   * Searches are serialized through `queue`, so only one is ever installed at
   * a time — no cross-talk between concurrent searches.
   */
  private onLine: ((line: string) => void) | null = null;
  /** Serializes searches: Stockfish processes one `go` at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  /** Lazily start the worker and complete the UCI handshake (once). */
  private boot(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(ENGINE_URL);
      } catch (err) {
        reject(new Error(`Could not start the Stockfish worker: ${(err as Error).message}`));
        return;
      }
      this.worker = worker;

      const timer = setTimeout(() => {
        this.onLine = null;
        reject(
          new Error(
            'Stockfish engine failed to load. Check that ' +
              '/stockfish/stockfish-18-lite-single.{js,wasm} are being served.'
          )
        );
      }, BOOT_TIMEOUT_MS);

      worker.onmessage = (e: MessageEvent) => {
        const line = lineOf(e.data);
        if (line) this.onLine?.(line);
      };
      worker.onerror = (e: ErrorEvent) => {
        clearTimeout(timer);
        this.onLine = null;
        reject(new Error(`Stockfish worker error: ${e.message || 'unknown'}`));
      };

      // UCI handshake: uci → uciok → isready → readyok.
      this.onLine = (line) => {
        if (line === 'uciok') {
          worker.postMessage('isready');
        } else if (line === 'readyok') {
          clearTimeout(timer);
          this.onLine = null;
          resolve();
        }
      };
      worker.postMessage('uci');
    });

    // A failed boot shouldn't be cached — let the next call retry from scratch.
    this.ready.catch(() => {
      this.ready = null;
      this.worker?.terminate();
      this.worker = null;
    });

    return this.ready;
  }

  async analyze(opts: AnalyzeOpts): Promise<AnalysisResult> {
    const { fen, depth = 18, multiPv = 1 } = opts;
    await this.boot();

    const run = () =>
      new Promise<AnalysisResult>((resolve, reject) => {
        const worker = this.worker;
        if (!worker) {
          reject(new Error('Stockfish worker is not running'));
          return;
        }
        const search = new UciSearch(fen, depth);
        const timer = setTimeout(() => {
          this.onLine = null;
          reject(new Error(`Stockfish timed out at depth ${depth}`));
        }, SEARCH_TIMEOUT_MS);

        this.onLine = (line) => {
          const result = search.handleLine(line);
          if (result) {
            clearTimeout(timer);
            this.onLine = null;
            resolve(result);
          }
        };

        worker.postMessage(`setoption name MultiPV value ${multiPv}`);
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go depth ${depth}`);
      });

    // Chain onto the queue so searches never overlap, regardless of how many
    // callers fire concurrently. A failed search doesn't poison the chain.
    const p = this.queue.then(run, run);
    this.queue = p.then(
      () => undefined,
      () => undefined
    );
    return p;
  }

  async bestMoveSan(fen: string, depth = 18): Promise<string | null> {
    const res = await this.analyze({ fen, depth, multiPv: 1 });
    return res.lines[0]?.pvSan[0] ?? null;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.onLine = null;
    this.queue = Promise.resolve();
  }
}

/** Normalize a worker message into a UCI line string. */
function lineOf(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as { data: unknown }).data;
    return typeof inner === 'string' ? inner : '';
  }
  return '';
}

let singleton: WasmEngine | null = null;

/**
 * Process-wide WASM engine. One worker is reused for the whole session — far
 * faster than booting a 7 MB engine per import, and the UI only ever runs one
 * import at a time.
 */
export function getWasmEngine(): ChessEngine {
  if (!singleton) singleton = new WasmEngine();
  return singleton;
}
