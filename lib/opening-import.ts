import { apiUrl } from './api';
import { parsePgn, oldestGameStartMs } from './pgn';
import { summarizeGame, type OpeningGame } from './opening-tree';
import { loadOpeningGames, saveOpeningGames, mergeOpeningGames } from './storage';

/**
 * Decoupled, engine-free game fetch for the Opening Clinic.
 *
 * The puzzle pipeline analyzes every game with the WASM engine, so it sips
 * games 20 at a time. The clinic only needs the cheap opening summary (move
 * list + result + blundered plies, all read straight from the PGN's `[%eval]`),
 * so it can afford to pull *many* games at once. We page the existing
 * `/api/lichess/pgn` proxy (capped at 50/req) a few times via the `until`
 * cursor to gather ~150 games, summarize them, and merge into the same
 * `bt.openingGames` store the importer writes — giving the clinic real breadth
 * without slowing puzzle generation.
 */
const PAGE = 50;
const PAGES = 3; // ~150 games

export async function importOpeningGames(
  username: string,
  onProgress?: (count: number) => void,
): Promise<number> {
  const name = username.trim();
  if (!name) return 0;

  const collected: OpeningGame[] = [];
  let until: number | undefined;

  for (let p = 0; p < PAGES; p++) {
    const url = new URL(apiUrl('/api/lichess/pgn'), window.location.origin);
    url.searchParams.set('username', name);
    url.searchParams.set('max', String(PAGE));
    if (until) url.searchParams.set('until', String(until));

    let pgn: string;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) break;
      pgn = await res.text();
    } catch {
      break; // network hiccup — keep whatever we have
    }

    const games = parsePgn(pgn);
    if (games.length === 0) break;
    for (const g of games) {
      const s = summarizeGame(g, name);
      if (s) collected.push(s);
    }
    onProgress?.(collected.length);

    if (games.length < PAGE) break; // reached the end of their history
    const oldest = oldestGameStartMs(games);
    if (!oldest) break;
    until = oldest - 1; // page strictly older next time
  }

  if (collected.length) {
    saveOpeningGames(mergeOpeningGames(loadOpeningGames(), collected));
  }
  return collected.length;
}
