import { fetchLichessGamesPgn, LICHESS_MAX_GAMES } from '@/lib/lichess';

/**
 * GET /api/lichess/pgn?username=&max=&until=
 *
 * Thin proxy that fetches a user's recent games from Lichess as raw PGN (with
 * `[%eval]` annotations) and streams the text straight back. **No Stockfish.**
 *
 * This is the backend half of the client-side WASM pipeline: the browser
 * fetches PGN here, then parses + analyzes it locally with the WASM engine
 * (see `lib/engine/wasm-engine.ts`). Because the heavy compute moved to the
 * client, this endpoint is CPU-trivial and scales like any static fetch — the
 * whole reason the web app no longer needs server-side Stockfish.
 *
 * It exists (rather than the browser calling lichess.org directly) so the web
 * app stays same-origin (no dependence on Lichess CORS) and so a
 * `LICHESS_TOKEN` can be applied server-side for higher rate limits.
 *
 * The legacy `/api/lichess/import` route (which *does* run Stockfish and
 * streams puzzles) is kept for the iOS build, which still analyzes server-side.
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
    ? Math.max(1, Math.min(LICHESS_MAX_GAMES, Math.floor(maxInput)))
    : LICHESS_MAX_GAMES;

  const untilInput = Number(searchParams.get('until'));
  const untilMillis =
    Number.isFinite(untilInput) && untilInput > 0 ? Math.floor(untilInput) : undefined;

  try {
    const pgn = await fetchLichessGamesPgn({ username, max, untilMillis });
    return new Response(pgn, {
      headers: {
        'Content-Type': 'application/x-chess-pgn; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // Surface "user not found" as a 404; anything else is an upstream failure.
    return jsonError(message, /not found/i.test(message) ? 404 : 502);
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
