import { Chess } from 'chess.js';
import type { ParsedGame, ParsedMove } from './pgn';
import type { GameSpeed, Puzzle } from './types';
import type { AnalysisLine, ChessEngine } from './engine/uci';

/**
 * Pull the Lichess speed name out of the Event header. Lichess writes
 * Events like "Rated blitz game" or "Rated 3+2 • Blitz Arena". We match
 * the speed name case-insensitively and fall back to deriving it from
 * the TimeControl header if needed.
 */
function deriveSpeed(headers: Record<string, string>): GameSpeed {
  const event = (headers['event'] ?? '').toLowerCase();
  if (event.includes('ultrabullet')) return 'ultraBullet';
  if (event.includes('bullet')) return 'bullet';
  if (event.includes('blitz')) return 'blitz';
  if (event.includes('rapid')) return 'rapid';
  if (event.includes('classical')) return 'classical';
  if (event.includes('correspondence')) return 'correspondence';

  // Fallback: classify by total estimated game length using Lichess's rule
  //   bucket = base + 40 * increment   (in seconds)
  const tc = headers['timecontrol'] ?? '';
  if (!tc || tc === '-') return 'correspondence';
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return 'unknown';
  const base = parseInt(m[1], 10);
  const inc = m[2] ? parseInt(m[2], 10) : 0;
  const bucket = base + 40 * inc;
  if (bucket < 30) return 'ultraBullet';
  if (bucket < 180) return 'bullet';
  if (bucket < 480) return 'blitz';
  if (bucket < 1500) return 'rapid';
  return 'classical';
}

/**
 * Render the PGN TimeControl header (e.g. "180+2") into the conventional
 * "minutes+increment" form ("3+2"). Returns the raw string when it
 * doesn't fit the pattern.
 */
function formatTimeControl(tc: string): string {
  if (!tc || tc === '-') return 'corr.';
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return tc;
  const base = parseInt(m[1], 10);
  const inc = m[2] ? parseInt(m[2], 10) : 0;
  // < 60s base => show seconds (e.g. ultraBullet "30+0"); otherwise minutes.
  const baseDisplay = base < 60 ? `${base}s` : `${Math.round(base / 60)}`;
  return `${baseDisplay}+${inc}`;
}

/**
 * Eval-drop thresholds (in centipawns) for puzzle classification.
 * Tweak these in one place to change the whole pipeline.
 */
export const THRESHOLDS = {
  /** Minimum eval drop to count as a "mistake" puzzle. */
  mistakeCp: 100,
  /** Minimum eval drop to count as a "blunder" puzzle. */
  blunderCp: 200,
};

/** Plies of the engine PV we keep as a puzzle's solution / continuation line.
 *  12 plies ≈ 6 full moves, enough to show where the winning line actually
 *  leads without dragging. (Only affects games analysed from here on — puzzles
 *  already in storage keep the length they were generated with.) */
const SOLUTION_MAX_PLIES = 12;

/** Centipawns the engine line must favor the user by for a sac to count as a
 *  winning combination (mate always qualifies). */
const COMBINATION_WIN_CP = 100;

/** Standard piece values; king omitted since it never leaves the board. */
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Compare a player name to the user's username. Lichess usernames are
 * case-insensitive, so we lower-case both sides.
 */
function isUser(name: string, username: string): boolean {
  return name.trim().toLowerCase() === username.trim().toLowerCase();
}

/**
 * Cap-able eval value: mate scores are clamped to ±10000 for arithmetic
 * (we treat them as "lost" / "won" for purposes of detecting eval drops).
 */
function evalToCp(m: ParsedMove): number {
  if (m.mate !== null) return m.mate > 0 ? 10000 : -10000;
  return m.evalCp ?? 0;
}

/** Depth of the shallow pass that *finds* candidate mistakes in a game that
 *  ships no evals (chess.com, un-analysed Lichess games, uploads). Every
 *  candidate is then confirmed at VERIFY_DEPTH, so this only decides *where to
 *  look*, never what a puzzle says.
 *
 *  Chosen by measurement, not taste (lite single-thread WASM build, 8 real
 *  games / 401 plies, against the old score-every-ply-at-18 pipeline):
 *    per position: depth 12 ≈ 12 ms · 14 ≈ 31 ms · 16 ≈ 86 ms · 18 ≈ 227 ms
 *    scan 12 → 16 of the old 18 puzzles, 29.5 s, first puzzle at 3.3 s
 *    scan 14 → 16 of 18 as well,         40.0 s, first puzzle at 4.6 s
 *    old     → 18,                     128–162 s, first puzzle at ~11 s
 *  Depth 14 bought no recall — the misses are mistakes only a depth-17+ search
 *  sees, plus coin-flips sitting on the 1.00-pawn line (which also differ
 *  between two runs of the old pipeline). A depth-16 "second opinion" stage was
 *  tried and removed: it threw out real mistakes (13 of 18). */
export const SCAN_DEPTH = 12;

/** Depth that confirms a candidate and computes its solution line. Every puzzle
 *  that is emitted carries verdicts from this depth, scanned game or not. */
export const VERIFY_DEPTH = 18;

/** A scan-depth drop this big earns a deep look. Deliberately below
 *  `THRESHOLDS.mistakeCp`: a shallow search under-reads some mistakes, and a
 *  false candidate only costs two deep searches before it is thrown out. */
const SCAN_CANDIDATE_CP = 60;

export interface AnalyseGameOptions {
  /** Called the moment a puzzle is confirmed — mid-game, not at the end — so
   *  the first puzzle reaches the UI seconds after an import starts. */
  onPuzzle?: (puzzle: Puzzle) => void;
  /** Scan progress through the game, in plies. Only fires for scanned games. */
  onProgress?: (done: number, total: number) => void;
  /** Polled before every engine search; return true to abandon the game (the
   *  import was cleared or superseded). Stops within one search, not one game. */
  shouldStop?: () => boolean;
  /** Score eval-less games with the engine first. Default true. With false, a
   *  game without evals yields nothing (the pre-scan behaviour). */
  scan?: boolean;
}

/**
 * Turn each critical mistake `username` made in `game` into a Puzzle, streaming
 * every puzzle out as soon as it is confirmed.
 *
 * "Critical" means the user's move dropped the eval (from their POV) by at least
 * `THRESHOLDS.mistakeCp`. Where the evals come from decides the cost:
 *
 *   · Games that ship `[%eval]` (Lichess server analysis) need no scan — their
 *     evals are authoritative, so each mistake costs one deep search (its line).
 *   · Everything else is scanned ply by ply at SCAN_DEPTH, and a candidate is
 *     confirmed on the spot with two deep searches (the position faced → best
 *     line + eval before; the position reached → eval after). The deep numbers
 *     replace the shallow ones, so the stored drop is a VERIFY_DEPTH verdict.
 *
 * The old pipeline scored *every* ply at depth 18 before looking for a single
 * mistake: ~19× the engine work, and nothing to show until a whole game was
 * done — minutes per game on a phone.
 *
 * Mutates `game.moves` evals in place (like `annotateEvalsIfMissing`), so the
 * opening-tree summaries downstream still see an annotated game. The `engine`
 * is injected so this runs unchanged on native Stockfish or the WASM worker.
 */
export async function analyseGame(
  game: ParsedGame,
  username: string,
  engine: ChessEngine,
  opts: AnalyseGameOptions = {}
): Promise<Puzzle[]> {
  const { onPuzzle, onProgress, shouldStop, scan = true } = opts;

  // Identify which color the user played in this game.
  let userColor: 'w' | 'b' | null = null;
  if (isUser(game.white, username)) userColor = 'w';
  else if (isUser(game.black, username)) userColor = 'b';
  if (!userColor) return [];

  const puzzles: Puzzle[] = [];
  const moves = game.moves;
  const speed = deriveSpeed(game.headers);
  const timeControl = formatTimeControl(game.headers['timecontrol'] ?? '');
  // Eval is white-positive; flip to side-relative so a drop is always positive.
  const sideSign = userColor === 'w' ? 1 : -1;
  const scanned = scan && !moves.some((m) => m.evalCp !== null || m.mate !== null);

  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];

    if (scanned) {
      if (shouldStop?.()) break;
      try {
        const res = await engine.analyze({ fen: mv.fenAfter, depth: SCAN_DEPTH });
        const top = res.lines[0];
        if (top) {
          mv.evalCp = top.cp;
          mv.mate = top.mate;
        }
      } catch {
        // Leave this ply null — it just won't be eligible to spawn a puzzle.
      }
      onProgress?.(i + 1, moves.length);
    }

    if (mv.color !== userColor) continue; // only the user's moves
    if (i === 0) continue; // need an "eval before" reference
    // Skip the opening (first 6 plies) — almost always book noise.
    if (mv.ply <= 6) continue;

    const prev = moves[i - 1]; // its eval is the position the user faced
    let dropCp = (evalToCp(prev) - evalToCp(mv)) * sideSign;
    if (dropCp < (scanned ? SCAN_CANDIDATE_CP : THRESHOLDS.mistakeCp)) continue;

    // Ask the engine for the best *line* at the position the user faced — we
    // keep the whole principal variation, not just the first move.
    if (shouldStop?.()) break;
    let analysis;
    try {
      analysis = await engine.analyze({ fen: mv.fenBefore, depth: VERIFY_DEPTH });
    } catch (err) {
      console.warn(`Skipping puzzle at ply ${mv.ply}: ${(err as Error).message}`);
      continue;
    }
    const top = analysis.lines[0];
    const pv = top?.pvSan ?? [];
    const best = pv[0] ?? null;
    if (!best) continue;
    if (best === mv.san) continue; // engine agrees with the user — no puzzle
    if (!isLegalSan(mv.fenBefore, best)) continue; // never ship an unsolvable puzzle

    if (scanned) {
      // Confirm the shallow verdict at depth. `fenBefore` is the position after
      // `prev`, so the search above already is its deep eval; one more search
      // scores the position the user's move reached.
      if (top && (top.cp !== null || top.mate !== null)) {
        prev.evalCp = top.cp;
        prev.mate = top.mate;
      }
      if (shouldStop?.()) break;
      try {
        const after = (await engine.analyze({ fen: mv.fenAfter, depth: VERIFY_DEPTH })).lines[0];
        if (after && (after.cp !== null || after.mate !== null)) {
          mv.evalCp = after.cp;
          mv.mate = after.mate;
        }
      } catch {
        // Keep the scan eval for this ply.
      }
      dropCp = (evalToCp(prev) - evalToCp(mv)) * sideSign;
      if (dropCp < THRESHOLDS.mistakeCp) continue; // the scan over-read it
    }

    // Keep a capped slice of the PV as the solution / continuation line, and
    // flag combinations (sacrifices that only pay off because of the follow-up).
    const line = pv.slice(0, SOLUTION_MAX_PLIES);
    const combination = isCombination(mv.fenBefore, line, top, userColor);

    // Build the setup move list (everything before the mistake) in SAN.
    const setupMoves = moves.slice(0, i).map((m) => m.san);

    const opponent = userColor === 'w' ? game.black : game.white;
    const player = userColor === 'w' ? game.white : game.black;
    const puzzle: Puzzle = {
      id: `${game.gameId ?? 'unknown'}_${mv.ply}`,
      gameId: game.gameId ?? 'unknown',
      site: game.site ?? 'https://lichess.org',
      player,
      opponent,
      eco: game.eco,
      date: game.date,
      abdulsColor: userColor === 'w' ? 'white' : 'black',
      setupMoves,
      bestMove: best,
      line,
      combination,
      mistakeMove: mv.san,
      // The real game from the mistake onward (mistakeMove first), same cap as
      // the engine line — so the panel can replay how the game actually went.
      playedLine: moves.slice(i, i + SOLUTION_MAX_PLIES).map((m) => m.san),
      evalBefore: (evalToCp(prev) * sideSign) / 100, // pawn units, side-relative
      evalAfter: (evalToCp(mv) * sideSign) / 100,
      drop: dropCp / 100,
      type: dropCp >= THRESHOLDS.blunderCp ? 'blunder' : 'mistake',
      speed,
      timeControl,
    };
    puzzles.push(puzzle);
    onPuzzle?.(puzzle);
  }

  return puzzles;
}

/** True when `san` can be played in `fen`. */
function isLegalSan(fen: string, san: string): boolean {
  try {
    return !!new Chess(fen).move(san);
  } catch {
    return false;
  }
}

/**
 * All of a game's puzzles at once, from the evals the game already carries —
 * no scan, so a game without evals yields nothing. Kept for the server import
 * routes, which feed it Lichess-annotated games; the in-app importer uses
 * `analyseGame` directly (scan + streaming).
 */
export function generatePuzzlesFromGame(
  game: ParsedGame,
  username: string,
  engine: ChessEngine
): Promise<Puzzle[]> {
  return analyseGame(game, username, engine, { scan: false });
}

/** Depth for a *full* eval-annotation pass (every ply, same strength as the
 *  best-move search). Thorough but slow — ~19× a SCAN_DEPTH pass — so the in-app
 *  importer no longer uses it; see `analyseGame`. */
export const ANNOTATE_DEPTH = 18;

/**
 * Fill in per-ply evals with the engine when a game has none — chess.com games,
 * or PGNs uploaded without analysis. Lichess ships `[%eval]` already, so this is
 * a no-op for those. Mutates `game.moves` in place: afterwards the game looks
 * exactly like an annotated Lichess game, so blunder detection *and* the
 * opening-tree summaries work unchanged downstream.
 *
 * Each ply is scored by analysing the position *after* the move (white-relative
 * cp/mate), matching `ParsedMove.evalCp`'s contract. Returns true if it ran.
 */
export async function annotateEvalsIfMissing(
  game: ParsedGame,
  engine: ChessEngine,
  onPly?: (done: number, total: number) => void,
  depth = ANNOTATE_DEPTH
): Promise<boolean> {
  if (game.moves.some((m) => m.evalCp !== null || m.mate !== null)) return false;
  const total = game.moves.length;
  for (let i = 0; i < total; i++) {
    const mv = game.moves[i];
    try {
      const res = await engine.analyze({ fen: mv.fenAfter, depth });
      const top = res.lines[0];
      if (top) {
        mv.evalCp = top.cp;
        mv.mate = top.mate;
      }
    } catch {
      // Leave this ply null — it just won't be eligible to spawn a puzzle.
    }
    onPly?.(i + 1, total);
  }
  return true;
}

/** Material balance from `userColor`'s point of view at the given position. */
function materialBalance(chess: Chess, userColor: 'w' | 'b'): number {
  let bal = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const v = PIECE_VALUE[sq.type] ?? 0;
      bal += sq.color === userColor ? v : -v;
    }
  }
  return bal;
}

/**
 * A "combination" is a best move whose point only holds up *with* the
 * continuation: it concedes material immediately, yet the engine still
 * evaluates the line as winning for the user. Those are worth solving as
 * multi-move puzzles (you have to find the follow-up) rather than one-movers.
 *
 * Detection is intentionally cheap — no extra engine calls: a material
 * sacrifice across the first exchange plus a winning engine eval on the line.
 */
function isCombination(
  fenBefore: string,
  line: string[],
  top: AnalysisLine | undefined,
  userColor: 'w' | 'b'
): boolean {
  if (!top || line.length < 3) return false; // need a real continuation
  const userSign = userColor === 'w' ? 1 : -1;
  const winning =
    top.mate != null
      ? top.mate * userSign > 0
      : top.cp != null
        ? top.cp * userSign >= COMBINATION_WIN_CP
        : false;
  if (!winning) return false;

  const c = new Chess(fenBefore);
  // A forced move (responding to check) is never a *chosen* sacrifice.
  if (c.isCheck()) return false;
  const before = materialBalance(c, userColor);
  let m0, m1;
  try {
    m0 = c.move(line[0]); // the user's (sacrificial) move
    m1 = line[1] ? c.move(line[1]) : null; // the forced reply
  } catch {
    return false;
  }
  if (!m1) return false;
  // A real sacrifice: the opponent's forced reply captures the very piece the
  // user just offered — a recapture on the move's destination square — leaving
  // the user down material. Requiring this avoids mislabelling lines where the
  // user makes a move and the opponent grabs material *elsewhere* (e.g. a king
  // step out of check while a knight snaps off a pawn) as a "sacrifice".
  const recapturedOffer = !!m1.captured && m1.to === m0.to;
  if (!recapturedOffer) return false;
  return materialBalance(c, userColor) <= before - 1; // gave up ≥ a pawn
}
