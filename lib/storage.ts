import type { GameSource, HistoryEntry, Puzzle, SessionStats } from './types';
import type { OpeningGame } from './opening-tree';

/**
 * Tiny localStorage wrapper for persisting imported puzzles across reloads.
 *
 * Keys:
 *   bt.puzzles          — Puzzle[] generated from imports
 *   bt.username         — the Lichess username used for imports (convenience)
 *   bt.solved           — { [puzzleId]: 'ok' | 'fail' } progress
 *   bt.oldestFetchedMs  — UNIX ms of the oldest game imported from Lichess,
 *                         used as a cursor for pagination.
 *   bt.fetchedGames     — cumulative count of games pulled from Lichess
 *                         across all batches. Caps auto-fetch at 200.
 *
 * Graduate this to a real database (SQLite via better-sqlite3, or Postgres)
 * when you start caring about multi-device or multi-user.
 */

const KEY_PUZZLES = 'bt.puzzles';
const KEY_USERNAME = 'bt.username';
const KEY_SOURCE = 'bt.source';
const KEY_SOLVED = 'bt.solved';
const KEY_OLDEST = 'bt.oldestFetchedMs';
const KEY_FETCHED = 'bt.fetchedGames';
const KEY_RANDOM = 'bt.randomOrder';
const KEY_THEME = 'bt.theme';
const KEY_ONBOARDED = 'bt.onboarded';
const KEY_STATS = 'bt.stats';
const KEY_HISTORY = 'bt.history';
const KEY_OPENING_GAMES = 'bt.openingGames';

export function loadPuzzles(): Puzzle[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY_PUZZLES);
    if (!raw) return [];
    return JSON.parse(raw) as Puzzle[];
  } catch {
    return [];
  }
}

export function savePuzzles(puzzles: Puzzle[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_PUZZLES, JSON.stringify(puzzles));
  } catch (err) {
    console.warn('Failed to save puzzles to localStorage:', err);
  }
}

export function loadUsername(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(KEY_USERNAME) ?? '';
}

export function saveUsername(username: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_USERNAME, username);
}

/** Which site the user imports from. Defaults to Lichess. */
export function loadSource(): GameSource {
  if (typeof window === 'undefined') return 'lichess';
  return window.localStorage.getItem(KEY_SOURCE) === 'chesscom' ? 'chesscom' : 'lichess';
}

export function saveSource(source: GameSource): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_SOURCE, source);
}

export function loadSolved(): Record<string, 'ok' | 'fail'> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY_SOLVED);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveSolved(solved: Record<string, 'ok' | 'fail'>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_SOLVED, JSON.stringify(solved));
  } catch (err) {
    console.warn('Failed to save solved map to localStorage:', err);
  }
}

/** Merge two puzzle lists, deduping by id. Later entries win. */
export function mergePuzzles(a: Puzzle[], b: Puzzle[]): Puzzle[] {
  const map = new Map<string, Puzzle>();
  for (const p of a) map.set(p.id, p);
  for (const p of b) map.set(p.id, p);
  return Array.from(map.values());
}

/**
 * Wipe all imported puzzles, solved progress, the pagination cursor, and the
 * mapped opening games from localStorage. The username is preserved so the user
 * doesn't have to retype it after clearing. Seed puzzles served from
 * `/api/puzzles` are unaffected (they live in code, not storage).
 *
 * The Opening Clinic corpus is wiped too, and its background-fetch cursor is
 * marked "done" for the current account so clearing leaves the clinic empty
 * until the user re-imports — rather than the background build silently
 * re-pulling the same games and making the openings reappear.
 */
export function clearAll(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY_PUZZLES);
  window.localStorage.removeItem(KEY_SOLVED);
  window.localStorage.removeItem(KEY_OLDEST);
  window.localStorage.removeItem(KEY_FETCHED);
  window.localStorage.removeItem(KEY_OPENING_GAMES);
  const u = loadUsername().trim();
  if (u) saveOpeningFetchState({ key: openingFetchKey(loadSource(), u), until: null, done: true });
  else window.localStorage.removeItem(KEY_OPENING_CURSOR);
}

/**
 * Cursor for "fetch older games" pagination. Stores the UNIX ms timestamp
 * of the oldest Lichess game already imported; the next batch fetches
 * games strictly older than this.
 */
export function loadOldestFetchedMs(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY_OLDEST);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveOldestFetchedMs(ms: number | null): void {
  if (typeof window === 'undefined') return;
  if (ms == null) window.localStorage.removeItem(KEY_OLDEST);
  else window.localStorage.setItem(KEY_OLDEST, String(ms));
}

/**
 * Cumulative number of Lichess games that have been fetched (summed
 * across all batches). Used to enforce the `MAX_FETCHED_GAMES` cap so
 * the auto-fetch loop eventually stops.
 */
export function loadFetchedGameCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(KEY_FETCHED);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function saveFetchedGameCount(n: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_FETCHED, String(Math.max(0, Math.floor(n))));
}

/* ── User-preference toggles ──
   Tiny boolean / enum settings kept in localStorage so they survive
   reloads. Each has a default that matches "first-time user" behavior. */

/** Random-order toggle. When true, `next()` picks a random unsolved
 *  puzzle from the filtered list instead of the next one in order. */
export function loadRandomOrder(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY_RANDOM) === '1';
}

export function saveRandomOrder(on: boolean): void {
  if (typeof window === 'undefined') return;
  if (on) window.localStorage.setItem(KEY_RANDOM, '1');
  else window.localStorage.removeItem(KEY_RANDOM);
}

export type ThemeMode = 'light' | 'dark';

/** Color theme. Defaults to 'light' (the original terminal-on-paper
 *  look). When 'dark', the app inverts to a full-black background suite
 *  driven by a `[data-theme="dark"]` selector in globals.css. */
export function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const v = window.localStorage.getItem(KEY_THEME);
  return v === 'dark' ? 'dark' : 'light';
}

export function saveTheme(t: ThemeMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_THEME, t);
}

/* ── First-run onboarding flag ──
   Gates the onboarding screen. Once the user has supplied a username (or
   skipped into the app), we never show it again. */
export function loadOnboarded(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY_ONBOARDED) === '1';
}

export function saveOnboarded(on: boolean): void {
  if (typeof window === 'undefined') return;
  if (on) window.localStorage.setItem(KEY_ONBOARDED, '1');
  else window.localStorage.removeItem(KEY_ONBOARDED);
}

/* ── Session stats ──
   Solved / wrong tallies + current and best streak. Persisted so the
   topbar cluster and stats sheet survive reloads. */
const DEFAULT_STATS: SessionStats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0 };

export function loadStats(): SessionStats {
  if (typeof window === 'undefined') return { ...DEFAULT_STATS };
  try {
    const raw = window.localStorage.getItem(KEY_STATS);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw) as Partial<SessionStats>;
    return {
      correct: parsed.correct ?? 0,
      wrong: parsed.wrong ?? 0,
      streak: parsed.streak ?? 0,
      bestStreak: parsed.bestStreak ?? parsed.streak ?? 0,
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveStats(stats: SessionStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_STATS, JSON.stringify(stats));
  } catch (err) {
    console.warn('Failed to save stats to localStorage:', err);
  }
}

/* ── Daily solve history ──
   Drives the "last 14 days" sparkline. Each entry is one calendar day. */
export function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: HistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_HISTORY, JSON.stringify(history));
  } catch (err) {
    console.warn('Failed to save history to localStorage:', err);
  }
}

/* ── Opening-tree game summaries (compact, one per imported game) ──
   Persisted so the Opening Clinic can rebuild its tree without a re-import.
   The tree itself is derived on demand in lib/opening-tree.ts. */
export function loadOpeningGames(): OpeningGame[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY_OPENING_GAMES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as OpeningGame[]) : [];
  } catch {
    return [];
  }
}

export function saveOpeningGames(games: OpeningGame[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_OPENING_GAMES, JSON.stringify(games));
  } catch (err) {
    console.warn('Failed to save opening games to localStorage:', err);
  }
}

/** Merge new summaries into the stored set, de-duped by gameId (newest wins). */
export function mergeOpeningGames(existing: OpeningGame[], incoming: OpeningGame[]): OpeningGame[] {
  const map = new Map<string, OpeningGame>();
  for (const g of existing) map.set(g.gameId, g);
  for (const g of incoming) map.set(g.gameId, g);
  return Array.from(map.values());
}

/* ── Opening Clinic background-fetch cursor ──
   The clinic builds its corpus toward a sensible target (a few hundred games),
   pulled in the background across pages — and across sessions. This persisted
   cursor records how far we've paged (`until`) and whether we've reached the
   target / run out of history (`done`), so a returning user resumes instead of
   re-fetching, and a finished corpus isn't re-pulled. */
const KEY_OPENING_CURSOR = 'bt.openingCursor';

export interface OpeningFetchState {
  /** `${source}:${username}` — a different account or site invalidates the cursor. */
  key: string;
  /** UNIX ms to page strictly older than next time (oldest fetched − 1); null = from newest. */
  until: number | null;
  /** True once the corpus hit its target size or we paged past the oldest game. */
  done: boolean;
}

/** Canonical cursor key for an account, so case/whitespace don't fork it. */
export function openingFetchKey(source: GameSource, username: string): string {
  return `${source}:${username.trim().toLowerCase()}`;
}

export function loadOpeningFetchState(): OpeningFetchState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY_OPENING_CURSOR);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.key === 'string' && typeof p.done === 'boolean') return p as OpeningFetchState;
    return null;
  } catch {
    return null;
  }
}

export function saveOpeningFetchState(state: OpeningFetchState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_OPENING_CURSOR, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}
