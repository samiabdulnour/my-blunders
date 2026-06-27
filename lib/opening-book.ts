/**
 * Position-keyed opening-name lookup.
 *
 * Names a position by its *exact* placement (via EPD — FEN fields 1–4), using
 * Lichess's canonical openings database. This is what makes opening names
 * accurate and complete: a single per-game ECO header can't say what variation
 * an intermediate position is in (and mislabels move-order transpositions),
 * whereas keying on the position itself names every node correctly and folds
 * transpositions onto the same name.
 *
 * The ~440 KB table (≈68 KB gzipped) is loaded as its own chunk via dynamic
 * import, so it never weighs down the initial bundle for users who only solve
 * puzzles. Callers `ensureOpeningBook()` once (Opening / Assisted Play modes),
 * then `lookupOpening()` resolves synchronously.
 */

type Book = Record<string, string>; // EPD → "ECO\tName"

let BOOK: Book | null = null;
let loadPromise: Promise<void> | null = null;

/** EPD = the position-identifying part of a FEN (board, turn, castling, e.p.). */
function epdOf(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * The named opening for a position, or null if it isn't a named opening (or the
 * book hasn't loaded yet — call {@link ensureOpeningBook} first). Synchronous.
 */
export function lookupOpening(fen: string): { eco: string; name: string } | null {
  if (!BOOK) return null;
  const v = BOOK[epdOf(fen)];
  if (!v) return null;
  const tab = v.indexOf('\t');
  return tab < 0 ? { eco: '', name: v } : { eco: v.slice(0, tab), name: v.slice(tab + 1) };
}

/** True once the book is in memory and {@link lookupOpening} can resolve names. */
export function openingBookLoaded(): boolean {
  return BOOK !== null;
}

/**
 * Load the opening-name table (idempotent; the dynamic import is fetched once).
 * Resolves when names are ready — a failed load resolves quietly, leaving names
 * simply absent rather than throwing.
 */
export function ensureOpeningBook(): Promise<void> {
  if (BOOK) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = import('./opening-names-data')
      .then((m) => { BOOK = m.OPENING_NAMES; })
      .catch(() => { /* names just won't show */ });
  }
  return loadPromise;
}
