import { NextResponse } from 'next/server';
import { parsePgn } from '@/lib/pgn';
import { generatePuzzlesFromGame } from '@/lib/puzzle-generator';
import { nodeEngine } from '@/lib/stockfish';
import type { Puzzle } from '@/lib/types';

/**
 * POST /api/import-pgn
 *
 * Body: { pgn: string, username: string }
 *
 * Accepts the raw text of a Lichess PGN export (one or many games), parses
 * it, finds the user's mistakes/blunders by reading the {[%eval ...]}
 * annotations, runs Stockfish on each critical position to find the best
 * move, and returns the resulting Puzzle[].
 *
 * Stockfish must be installed on the host running this Next.js server:
 *   macOS:  brew install stockfish
 *   Linux:  apt install stockfish
 */
export const runtime = 'nodejs'; // child_process is not available on edge
export const maxDuration = 60;

/** Caps so one request can't OOM the host or spawn unbounded engine runs. */
const MAX_PGN_BYTES = 4_000_000; // ~4 MB of PGN text
const MAX_GAMES = 50; // matches the fetch importers' per-call cap

export async function POST(req: Request) {
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'expected application/json' }, { status: 415 });
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_PGN_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  let body: { pgn?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { pgn, username } = body;
  if (!pgn || typeof pgn !== 'string') {
    return NextResponse.json({ error: 'pgn is required' }, { status: 400 });
  }
  if (pgn.length > MAX_PGN_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }
  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: 'username is required' }, { status: 400 });
  }

  let games;
  try {
    games = parsePgn(pgn);
  } catch (err) {
    return NextResponse.json(
      { error: `PGN parse error: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (games.length === 0) {
    return NextResponse.json(
      { error: 'No games found in PGN. Did you export with `--evals=true`?' },
      { status: 400 }
    );
  }

  const puzzles: Puzzle[] = [];
  const errors: string[] = [];

  // Only analyse up to MAX_GAMES — each game runs the engine, so an unbounded
  // count is a CPU/time DoS.
  const toAnalyse = games.slice(0, MAX_GAMES);
  for (const g of toAnalyse) {
    try {
      const generated = await generatePuzzlesFromGame(g, username, nodeEngine);
      puzzles.push(...generated);
    } catch (err) {
      errors.push(`game ${g.gameId ?? '(unknown)'}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    parsedGames: toAnalyse.length,
    generated: puzzles.length,
    puzzles,
    errors: errors.length > 0 ? errors : undefined,
  });
}
