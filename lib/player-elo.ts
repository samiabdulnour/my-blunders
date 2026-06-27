import type { ParsedGame } from './pgn';

/**
 * Tracks the player's estimated rating, used by Assisted Play to size the
 * engine opponent to "about as strong (and as wrong) as you".
 *
 * We accumulate a running sum + count of the ratings seen in the user's
 * imported games (their side's Elo from the PGN's WhiteElo/BlackElo headers),
 * so `loadElo()` is just the average. A manual override lets a user set their
 * level directly — handy before any games are imported, or to tune the
 * opponent to taste. The override wins when set.
 */
const KEY_TALLY = 'bt.eloTally';
const KEY_OVERRIDE = 'bt.eloOverride';

/** Sensible default when nothing is known yet (a clubby-beginner level). */
export const DEFAULT_ELO = 1500;
/** Range we let the opponent be sized to. */
export const MIN_ELO = 600;
export const MAX_ELO = 2800;

interface Tally {
  sum: number;
  count: number;
}

function loadTally(): Tally {
  if (typeof window === 'undefined') return { sum: 0, count: 0 };
  try {
    const raw = window.localStorage.getItem(KEY_TALLY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p.sum === 'number' && typeof p.count === 'number') return p;
  } catch {
    /* ignore */
  }
  return { sum: 0, count: 0 };
}

function saveTally(t: Tally): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_TALLY, JSON.stringify(t));
  } catch {
    /* ignore quota */
  }
}

/** The user's manual Elo override, or null if they haven't set one. */
export function loadEloOverride(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY_OVERRIDE);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? clampElo(n) : null;
}

export function saveEloOverride(elo: number | null): void {
  if (typeof window === 'undefined') return;
  if (elo == null) window.localStorage.removeItem(KEY_OVERRIDE);
  else window.localStorage.setItem(KEY_OVERRIDE, String(clampElo(elo)));
}

/** Average rating estimated from imported games, or null if none recorded. */
export function loadEstimatedElo(): number | null {
  const t = loadTally();
  return t.count > 0 ? clampElo(Math.round(t.sum / t.count)) : null;
}

/** Effective Elo to size the opponent: the manual override if set, else the
 *  estimate from imported games, else the default. */
export function effectiveElo(): number {
  return loadEloOverride() ?? loadEstimatedElo() ?? DEFAULT_ELO;
}

export function clampElo(elo: number): number {
  return Math.max(MIN_ELO, Math.min(MAX_ELO, Math.round(elo)));
}

/** Pull the user's rating out of a parsed game (their side's Elo header). */
function userRating(game: ParsedGame, username: string): number | null {
  const u = username.trim().toLowerCase();
  const side =
    game.white.trim().toLowerCase() === u
      ? 'whiteelo'
      : game.black.trim().toLowerCase() === u
        ? 'blackelo'
        : null;
  if (!side) return null;
  const n = parseInt(game.headers[side] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fold a freshly-imported batch of games into the rating estimate. */
export function recordEloFromGames(games: ParsedGame[], username: string): void {
  const t = loadTally();
  let added = false;
  for (const g of games) {
    const r = userRating(g, username);
    if (r != null) {
      t.sum += r;
      t.count += 1;
      added = true;
    }
  }
  if (added) saveTally(t);
}

/** Wipe the rating estimate + override (called from clearAll). */
export function clearElo(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY_TALLY);
  window.localStorage.removeItem(KEY_OVERRIDE);
}
