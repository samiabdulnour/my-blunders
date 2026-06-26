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

/** Plies of the engine PV we keep as a puzzle's solution / continuation line. */
const SOLUTION_MAX_PLIES = 8;

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

/**
 * Walk a parsed game and turn each critical mistake by `username` into a
 * Puzzle. For each critical position we ask the engine for the best move
 * and store it as the puzzle's answer.
 *
 * "Critical" means: the user's move dropped the eval (from their POV) by
 * at least `THRESHOLDS.mistakeCp` centipawns.
 *
 * The `engine` is injected so this runs unchanged on the server (native
 * Stockfish) or entirely in the browser (WASM worker). Note that *detecting*
 * mistakes needs no engine at all — that comes from the `[%eval]` annotations
 * Lichess ships in the PGN; the engine is only consulted to find the best-move
 * answer at each critical position.
 */
export async function generatePuzzlesFromGame(
  game: ParsedGame,
  username: string,
  engine: ChessEngine
): Promise<Puzzle[]> {
  // Identify which color the user played in this game.
  let userColor: 'w' | 'b' | null = null;
  if (isUser(game.white, username)) userColor = 'w';
  else if (isUser(game.black, username)) userColor = 'b';
  if (!userColor) return [];

  const puzzles: Puzzle[] = [];
  const moves = game.moves;
  const speed = deriveSpeed(game.headers);
  const timeControl = formatTimeControl(game.headers['timecontrol'] ?? '');

  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    if (mv.color !== userColor) continue; // only the user's moves
    if (i === 0) continue; // need an "eval before" reference

    const prev = moves[i - 1];
    const evalBeforeCp = evalToCp(prev); // eval at the position the user faced
    const evalAfterCp = evalToCp(mv);

    // Eval is white-positive; flip to side-relative so a drop is always
    // positive regardless of color.
    const sideSign = userColor === 'w' ? 1 : -1;
    const evalBeforeSide = evalBeforeCp * sideSign;
    const evalAfterSide = evalAfterCp * sideSign;
    const dropCp = evalBeforeSide - evalAfterSide;

    if (dropCp < THRESHOLDS.mistakeCp) continue;

    // Skip the opening (first 6 plies) — almost always book noise.
    if (mv.ply <= 6) continue;

    // Ask the engine for the best *line* at the position the user faced — we
    // keep the whole principal variation, not just the first move.
    let analysis;
    try {
      analysis = await engine.analyze({ fen: mv.fenBefore, depth: 18 });
    } catch (err) {
      console.warn(`Skipping puzzle at ply ${mv.ply}: ${(err as Error).message}`);
      continue;
    }
    const top = analysis.lines[0];
    const pv = top?.pvSan ?? [];
    const best = pv[0] ?? null;
    if (!best) continue;
    if (best === mv.san) continue; // engine agrees with the user — no puzzle

    // Keep a capped slice of the PV as the solution / continuation line, and
    // flag combinations (sacrifices that only pay off because of the follow-up).
    const line = pv.slice(0, SOLUTION_MAX_PLIES);
    const combination = isCombination(mv.fenBefore, line, top, userColor);

    // Build the setup move list (everything before the mistake) in SAN.
    const setupMoves = moves.slice(0, i).map((m) => m.san);

    const opponent = userColor === 'w' ? game.black : game.white;
    const player = userColor === 'w' ? game.white : game.black;
    puzzles.push({
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
      evalBefore: evalBeforeSide / 100, // back to pawn units, side-relative
      evalAfter: evalAfterSide / 100,
      drop: dropCp / 100,
      type: dropCp >= THRESHOLDS.blunderCp ? 'blunder' : 'mistake',
      speed,
      timeControl,
    });
  }

  return puzzles;
}

/** Depth for the eval-annotation pass on engine-less PGNs (chess.com / uploads).
 *  Matches the best-move search depth so the detected drop and the best-move
 *  verdict are computed at the same strength — no depth mismatch that could let
 *  a subtler mistake slip through. Tune for the time vs. quality ratio. */
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
  const before = materialBalance(c, userColor);
  try {
    c.move(line[0]); // the user's (sacrificial) move
    if (line[1]) c.move(line[1]); // the forced reply
  } catch {
    return false;
  }
  return materialBalance(c, userColor) <= before - 1; // gave up ≥ a pawn
}
