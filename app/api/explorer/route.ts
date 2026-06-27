/**
 * GET /api/explorer?db=masters|lichess&fen=&moves=&...
 *
 * Same-origin proxy for the Lichess Opening Explorer (explorer.lichess.ovh).
 * The browser used to call the explorer directly — it's CORS-enabled — but that
 * cross-site request is fragile: privacy browsers / shields (Brave, ad-blockers)
 * often block requests to a domain other than the app's own, which silently
 * killed opening theory (book hints, opening names) for those users. Routing it
 * through our origin makes it a first-party request that survives those blocks,
 * and lets us cache it. Counterpart to /api/lichess/pgn and /api/chesscom/pgn.
 */
export const runtime = 'nodejs';

const UPSTREAM = 'https://explorer.lichess.ovh';
/** Params we forward verbatim to the explorer. */
const PASS = ['fen', 'moves', 'topGames', 'recentGames', 'speeds', 'ratings'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const db = searchParams.get('db') === 'masters' ? 'masters' : 'lichess';
  const fen = searchParams.get('fen');
  if (!fen) return jsonError('fen is required', 400);

  const url = new URL(`${UPSTREAM}/${db}`);
  for (const k of PASS) {
    const v = searchParams.get(k);
    if (v != null) url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString(), { headers: { 'User-Agent': 'my-blunders/0.1' } });
    if (!res.ok) return new Response(null, { status: res.status });
    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Opening theory for a position is effectively static — cache hard.
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'upstream error', 502);
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
