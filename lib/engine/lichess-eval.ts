/**
 * Lichess cloud-eval fallback for the server engine.
 *
 * The native backend (`lib/stockfish.ts`) spawns a local `stockfish` binary,
 * which exists on a container host (the Dockerfile apt-installs it) but NOT on
 * Vercel's serverless runtime. Production (myblunders.com) is on Vercel, and
 * the web app does all its analysis client-side in WASM — so the web never
 * needs this. But the server `/api/analyze` route (used by the iOS build) would
 * otherwise hard-fail there. This lets it fall back to Lichess's precomputed
 * cloud evaluations for single positions.
 *
 * Coverage caveat: cloud-eval only answers for positions already in Lichess's
 * cache (common openings / analysed games). Uncached positions return 404 → we
 * return null and the caller surfaces the original engine error.
 *
 * Docs: https://lichess.org/api#tag/Analysis/operation/apiCloudEval
 */

import { fetchWithRetry } from '../fetch-retry';
import { uciLineToSan, type AnalysisResult, type AnalyzeOpts } from './uci';

interface CloudPv {
  moves: string;
  cp?: number;
  mate?: number;
}

export async function cloudEval(opts: AnalyzeOpts): Promise<AnalysisResult | null> {
  const { fen } = opts;
  if (typeof fen !== 'string' || /[\r\n]/.test(fen)) return null;
  const multiPv = Math.min(5, Math.max(1, Math.floor(opts.multiPv ?? 1) || 1));

  const url = new URL('https://lichess.org/api/cloud-eval');
  url.searchParams.set('fen', fen);
  url.searchParams.set('multiPv', String(multiPv));

  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      { headers: { 'User-Agent': 'my-blunders/0.1 (https://github.com/samiabdulnour/my-blunders)' } },
      { retries: 2 }
    );
  } catch {
    return null;
  }
  // 404 = position not in Lichess's cloud cache; anything else non-OK = give up.
  if (!res.ok) return null;

  let data: { depth?: number; pvs?: CloudPv[] };
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (!data.pvs?.length) return null;

  const lines = data.pvs.map((p) => {
    const pvUci = (p.moves ?? '').trim().split(/\s+/).filter(Boolean);
    let pvSan: string[] = [];
    try {
      pvSan = uciLineToSan(fen, pvUci);
    } catch {
      pvSan = [];
    }
    return {
      cp: typeof p.cp === 'number' ? p.cp : null,
      mate: typeof p.mate === 'number' ? p.mate : null,
      pvUci,
      pvSan,
    };
  });

  return { fen, depth: data.depth ?? 0, lines };
}
