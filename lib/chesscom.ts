/**
 * Chess.com API client.
 *
 * Chess.com exposes a free, unauthenticated "Published-Data" API. Games come in
 * monthly archives; each archive lists games with a ready-made `pgn` string:
 *
 *   GET https://api.chess.com/pub/player/{username}/games/archives
 *     → { archives: [".../games/2024/01", ".../games/2024/02", …] }  (old→new)
 *   GET {archiveUrl}
 *     → { games: [{ pgn, end_time, url, rules, time_class, … }, …] }  (old→new)
 *
 * Unlike Lichess, the PGN carries **no `[%eval]` annotations**, so the importer
 * has to run the engine to find blunders (see `annotateEvalsIfMissing`). This
 * client only does the fetch: it gathers the most recent `max` standard-chess
 * games (optionally older than a cursor) and concatenates their PGN.
 *
 * Chess.com rejects requests without a User-Agent, so this must run server-side
 * (the `/api/chesscom/pgn` proxy) — the browser can't set that header.
 *
 * Docs: https://www.chess.com/news/view/published-data-api
 */

export interface FetchChessComPgnOpts {
  /** Chess.com username (case-insensitive). */
  username: string;
  /** Cap on games returned. */
  max?: number;
  /** Only return games that ended **before** this UNIX time (ms) — the cursor
   *  for "fetch older" pagination. */
  untilMillis?: number;
}

/** Absolute upper bound enforced regardless of client input. */
export const CHESSCOM_MAX_GAMES = 50;

/** Monthly archives scanned per request — bounds a sparse-cursor scan. */
const ARCHIVE_SCAN_LIMIT = 18;

const UA = 'my-blunders/0.1 (https://github.com/samiabdulnour/my-blunders)';

interface ChessComGame {
  pgn?: string;
  end_time?: number; // seconds
  rules?: string; // "chess" | "chess960" | "bughouse" | …
  url?: string;
}

/** Parse "…/games/2024/01" → 202401 for month comparison. */
function archiveMonth(url: string): number | null {
  const m = url.match(/\/(\d{4})\/(\d{2})$/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

/**
 * Fetch up to `max` of a chess.com user's recent standard games as one PGN
 * blob. The text feeds straight into `parsePgn` (lib/pgn.ts) — it has no evals,
 * so the caller annotates with the engine before generating puzzles.
 *
 * Throws on unknown users (404) or upstream failures.
 */
export async function fetchChessComGamesPgn(opts: FetchChessComPgnOpts): Promise<string> {
  const username = opts.username.trim().toLowerCase();
  if (!username) throw new Error('username is required');
  const max = Math.max(1, Math.min(CHESSCOM_MAX_GAMES, Math.floor(opts.max ?? CHESSCOM_MAX_GAMES)));
  const until = opts.untilMillis;

  const headers = { 'User-Agent': UA, Accept: 'application/json' };

  // 1) List the user's monthly archives (returned oldest→newest).
  const archRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
    { headers }
  );
  if (archRes.status === 404) throw new Error(`Chess.com user "${opts.username}" not found`);
  if (!archRes.ok) {
    const body = await archRes.text().catch(() => '');
    throw new Error(`Chess.com API ${archRes.status}: ${body.slice(0, 200)}`);
  }
  const { archives = [] } = (await archRes.json()) as { archives?: string[] };
  if (archives.length === 0) return '';

  // Newest first; when paginating, drop months newer than the cursor's month.
  let months = [...archives].reverse();
  if (until) {
    const cursorMonth = new Date(until);
    const ym = cursorMonth.getUTCFullYear() * 100 + (cursorMonth.getUTCMonth() + 1);
    months = months.filter((u) => {
      const m = archiveMonth(u);
      return m === null || m <= ym;
    });
  }
  months = months.slice(0, ARCHIVE_SCAN_LIMIT);

  // 2) Walk months newest→oldest, collecting newest-first standard games.
  const pgns: string[] = [];
  for (const monthUrl of months) {
    if (pgns.length >= max) break;
    let games: ChessComGame[] = [];
    try {
      const r = await fetch(monthUrl, { headers });
      if (!r.ok) continue;
      ({ games = [] } = (await r.json()) as { games?: ChessComGame[] });
    } catch {
      continue; // skip a flaky month rather than fail the whole import
    }
    for (let i = games.length - 1; i >= 0; i--) {
      if (pgns.length >= max) break;
      const g = games[i];
      if (!g.pgn) continue;
      if (g.rules && g.rules !== 'chess') continue; // skip variants
      if (until && (g.end_time ?? 0) * 1000 >= until) continue; // older than cursor only
      pgns.push(g.pgn);
    }
  }
  return pgns.join('\n\n');
}
