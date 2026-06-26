import { fetchChessComGamesPgn, CHESSCOM_MAX_GAMES } from '@/lib/chesscom';

/**
 * GET /api/chesscom/pgn?username=&max=&until=
 *
 * Thin proxy that gathers a user's recent games from chess.com's public API and
 * streams them back as one PGN blob. **No Stockfish, no evals** — chess.com
 * PGNs carry no `[%eval]`, so the browser annotates with WASM Stockfish before
 * generating puzzles (see `annotateEvalsIfMissing`).
 *
 * It exists (rather than the browser calling api.chess.com directly) because
 * chess.com rejects requests without a User-Agent — which a browser can't set —
 * and to keep the web app same-origin. The counterpart to `/api/lichess/pgn`.
 */
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const username = (searchParams.get('username') ?? '').trim();
  if (!username) {
    return jsonError('username is required', 400);
  }

  const maxInput = Number(searchParams.get('max'));
  const max = Number.isFinite(maxInput)
    ? Math.max(1, Math.min(CHESSCOM_MAX_GAMES, Math.floor(maxInput)))
    : CHESSCOM_MAX_GAMES;

  const untilInput = Number(searchParams.get('until'));
  const untilMillis =
    Number.isFinite(untilInput) && untilInput > 0 ? Math.floor(untilInput) : undefined;

  try {
    const pgn = await fetchChessComGamesPgn({ username, max, untilMillis });
    return new Response(pgn, {
      headers: {
        'Content-Type': 'application/x-chess-pgn; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return jsonError(message, /not found/i.test(message) ? 404 : 502);
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
