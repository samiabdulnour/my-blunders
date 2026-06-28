import { NextResponse } from 'next/server';
import { validateFen } from 'chess.js';
import { analyzePosition } from '@/lib/stockfish';

// Imports node:child_process via lib/stockfish — must run on the Node runtime,
// and bound the request so a search can't run unbounded.
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/analyze
 *
 * Body: { fen: string, depth?: number, multiPv?: number }
 *
 * Runs Stockfish on the given position and returns the engine's eval and
 * principal variation(s). Used both to fact-check Lichess's evals and to
 * find best replies for puzzle answers.
 *
 * Stockfish placement: see `lib/stockfish.ts` for the choice between
 * a local Node binary, the Lichess cloud-eval API, or client-side WASM.
 */
export async function POST(req: Request) {
  let body: { fen?: string; depth?: number; multiPv?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { fen } = body;
  if (!fen || typeof fen !== 'string') {
    return NextResponse.json({ error: 'fen is required' }, { status: 400 });
  }
  // Reject anything that isn't a legal, single-line FEN. Beyond correctness,
  // this blocks UCI injection: a newline in the fen would otherwise be written
  // as extra commands to the engine's stdin (see lib/stockfish.ts).
  if (/[\r\n]/.test(fen) || !validateFen(fen).ok) {
    return NextResponse.json({ error: 'invalid FEN' }, { status: 400 });
  }
  // Clamp compute so one request can't pin the CPU (and a flood can't pile up
  // long searches): bounded depth + a small MultiPV.
  const depth = Math.min(22, Math.max(1, Math.floor(Number(body.depth ?? 18)) || 18));
  const multiPv = Math.min(5, Math.max(1, Math.floor(Number(body.multiPv ?? 1)) || 1));

  try {
    const result = await analyzePosition({ fen, depth, multiPv });
    return NextResponse.json(result);
  } catch (err: unknown) {
    // Log the detail server-side; don't reflect raw engine/host text to clients.
    console.error('analyze failed:', err);
    return NextResponse.json({ error: 'analysis failed' }, { status: 500 });
  }
}
