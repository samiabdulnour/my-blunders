import { apiUrl } from './api';
import { parsePgn, oldestGameStartMs } from './pgn';
import { summarizeGame, type OpeningGame } from './opening-tree';
import {
  loadOpeningGames,
  saveOpeningGames,
  mergeOpeningGames,
  loadOpeningFetchState,
  saveOpeningFetchState,
  openingFetchKey,
} from './storage';
import type { GameSource } from './types';

/**
 * Decoupled, engine-free game fetch for the Opening Clinic.
 *
 * The puzzle pipeline analyzes every game with the WASM engine, so it sips
 * games a batch at a time. The clinic only needs the cheap opening summary (move
 * list + result + blundered plies, read straight from the PGN), so it can afford
 * to pull *many* games. We page the proxy (capped at 50/req) toward a sensible
 * corpus target, summarizing and merging into the same `bt.openingGames` store
 * the importer writes — giving the clinic real breadth.
 *
 * This runs in the background and is **resumable**: a persisted cursor records
 * how far we've paged and whether we're finished, so a returning user keeps
 * filling toward the target across sessions instead of re-fetching, and a
 * completed corpus is never re-pulled. `onProgress` fires after every page with
 * the running total so the tree can grow live as games arrive.
 */
const PAGE = 50;

/** The corpus size the clinic builds toward — enough for a rich tree (main lines
 *  plus common sidelines and opponents) without unbounded fetching. Tunable. */
export const OPENING_TARGET_GAMES = 500;

/** Per-run page cap: a backstop so a single visit can't loop forever. 500/50 = 10
 *  pages, with slack for de-duped or result-less games. A run that hits the cap
 *  without finishing just resumes on the next visit (the cursor persists). */
const MAX_PAGES_PER_RUN = 14;

/** In-flight builds, keyed by account. Coalesces concurrent callers — a fast
 *  mode-switch (or React's dev StrictMode double-invoke) would otherwise start a
 *  second build that races the first on the shared cursor and double-fetches.
 *  Both callers await the same run and then re-read the finished store. */
const inFlight = new Map<string, Promise<number>>();

export function importOpeningGames(
  username: string,
  source: GameSource = 'lichess',
  onProgress?: (count: number) => void,
): Promise<number> {
  const name = username.trim();
  if (!name) return Promise.resolve(0);
  const key = openingFetchKey(source, name);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const run = buildOpeningCorpus(name, source, key, onProgress).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function buildOpeningCorpus(
  name: string,
  source: GameSource,
  key: string,
  onProgress?: (count: number) => void,
): Promise<number> {
  let state = loadOpeningFetchState();
  // A cursor for a different account/site doesn't apply — start fresh.
  if (!state || state.key !== key) state = { key, until: null, exhausted: false };

  let stored = loadOpeningGames();
  // Gate on the *actual* corpus size, not a sticky "done" flag: already have
  // enough, or no history left to pull → nothing to do. This self-heals — after
  // a clear (or any reset to 0) the corpus simply rebuilds.
  if (stored.length >= OPENING_TARGET_GAMES || state.exhausted) {
    saveOpeningFetchState(state);
    return stored.length;
  }

  const proxy = source === 'chesscom' ? '/api/chesscom/pgn' : '/api/lichess/pgn';
  let until = state.until ?? undefined;
  let pages = 0;
  let fetchedSome = false;

  while (stored.length < OPENING_TARGET_GAMES && pages < MAX_PAGES_PER_RUN) {
    pages++;
    const url = new URL(apiUrl(proxy), window.location.origin);
    url.searchParams.set('username', name);
    url.searchParams.set('max', String(PAGE));
    if (until) url.searchParams.set('until', String(until));

    let pgn: string;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) break; // transient — keep what we have and retry next visit
      pgn = await res.text();
    } catch {
      break; // network hiccup — retry next visit
    }

    const games = parsePgn(pgn);
    if (games.length === 0) {
      // Empty page is the end of history only if we'd already pulled some this
      // run; a blank first page is likely transient, so don't permanently
      // disable the build (the user clearly has games — they have puzzles).
      if (fetchedSome) state.exhausted = true;
      break;
    }
    fetchedSome = true;

    const summaries: OpeningGame[] = [];
    for (const g of games) {
      const s = summarizeGame(g, name);
      if (s) summaries.push(s);
    }
    stored = mergeOpeningGames(stored, summaries);
    saveOpeningGames(stored);

    // Advance the cursor strictly older, and persist it every page so an
    // interrupted run resumes here rather than from the newest game again.
    const oldest = oldestGameStartMs(games);
    until = oldest ? oldest - 1 : until;
    state.until = until ?? null;
    saveOpeningFetchState(state);
    onProgress?.(stored.length);

    if (games.length < PAGE) {
      state.exhausted = true; // a short page means we reached their oldest game
      break;
    }
  }

  saveOpeningFetchState(state);
  return stored.length;
}
