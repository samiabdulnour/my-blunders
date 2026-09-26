/**
 * Lichess Opening Explorer client — the "right continuation" source for the
 * clinic. For any position it returns the moves actually played (master games
 * by default, or rated Lichess games), with how popular each is and how it
 * scores. The top move is opening theory's main line.
 *
 * On the web, calls go through our own `/api/explorer` proxy rather than
 * hitting explorer.lichess.ovh directly: a same-origin request survives privacy
 * browsers / shields that block cross-site requests (which silently killed
 * theory for some users). In the native iOS app there is no backend to proxy
 * through, so we hit the Lichess explorer directly over Capacitor's native HTTP
 * (which bypasses the WebView CORS) — exactly like the game importers. Without
 * this fork the proxy 404s on the capacitor:// origin and theory is dead on
 * device. NOTE: the upstream is *not* reachable from the dev sandbox's egress,
 * so this is exercised live in the browser / production and mocked in tests.
 */
import { apiUrl } from './api';
import { isNativeApp } from './platform';

export type TheoryDb = 'masters' | 'lichess';

export interface TheoryMove {
  san: string;
  uci: string;
  /** Games reaching this move from the queried position. */
  games: number;
  white: number;
  draws: number;
  black: number;
  /** Share of games from this position that played this move (0–100). */
  share: number;
}

export interface Theory {
  db: TheoryDb;
  total: number;
  moves: TheoryMove[];
  opening: { eco: string; name: string } | null;
}

interface RawMove {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
}

function shape(json: { white?: number; draws?: number; black?: number; moves?: RawMove[]; opening?: { eco: string; name: string } | null }, db: TheoryDb): Theory {
  const total = (json.white ?? 0) + (json.draws ?? 0) + (json.black ?? 0);
  const moves: TheoryMove[] = (json.moves ?? []).map((m) => {
    const games = (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0);
    return {
      san: m.san,
      uci: m.uci,
      games,
      white: m.white ?? 0,
      draws: m.draws ?? 0,
      black: m.black ?? 0,
      share: total ? Math.round((games / total) * 100) : 0,
    };
  });
  return { db, total, moves, opening: json.opening ?? null };
}

async function query(db: TheoryDb, fen: string): Promise<Theory | null> {
  const params = new URLSearchParams({ fen, moves: '6', topGames: '0', recentGames: '0' });
  if (db === 'lichess') {
    params.set('speeds', 'blitz,rapid,classical');
    params.set('ratings', '1600,1800,2000,2200,2500');
  }
  let res: Response;
  if (isNativeApp()) {
    // Native: hit the explorer directly (CapacitorHttp routes it past CORS).
    res = await fetch(`https://explorer.lichess.ovh/${db}?${params}`, {
      headers: { 'User-Agent': 'my-blunders/0.1' },
    });
  } else {
    // Web: same-origin proxy so privacy shields don't block it.
    params.set('db', db);
    const url = new URL(apiUrl('/api/explorer'), window.location.origin);
    params.forEach((v, k) => url.searchParams.set(k, v));
    res = await fetch(url.toString());
  }
  if (!res.ok) return null;
  return shape(await res.json(), db);
}

const cache = new Map<string, Theory | null>();

/**
 * Theory for a position. Prefers the master database; if masters has too few
 * games (deep/offbeat lines), falls back to the rated-Lichess database so the
 * clinic still has a recommendation. Cached per FEN.
 */
export async function fetchTheory(fen: string): Promise<Theory | null> {
  if (cache.has(fen)) return cache.get(fen) ?? null;
  let theory: Theory | null = null;
  try {
    theory = await query('masters', fen);
    if (!theory || theory.total < 50) {
      const lichess = await query('lichess', fen);
      if (lichess && (!theory || lichess.total > theory.total)) theory = lichess;
    }
  } catch {
    theory = null;
  }
  cache.set(fen, theory);
  return theory;
}
