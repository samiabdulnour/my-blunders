import { getWasmEngine } from './engine/wasm-engine';
import type { AnalysisLine } from './engine/uci';

/**
 * Engine glue for Assisted Play.
 *
 * Two jobs:
 *  · pick the opponent's move at *about* the user's strength — not the best
 *    move, but one sampled from the top candidates with a temperature tied to
 *    Elo, so a weaker setting plays weaker (and blunders) like a real opponent;
 *  · judge the user's move at full strength to surface where they went wrong and
 *    what the best move was.
 *
 * The shared WASM engine stays at full strength (it's also used for puzzle
 * generation); we shape difficulty purely by *which* candidate we choose.
 */

/** Candidate moves to consider for the opponent (MultiPV). */
const CANDIDATES = 5;
/** Search depth for the opponent's move — shallow enough to feel responsive. */
const OPPONENT_DEPTH = 12;
/** Search depth for judging the user's move — a touch deeper for a fair verdict. */
const JUDGE_DEPTH = 14;
/** How much of the principal variation we keep: 8 plies = 4 moves a side, enough
 *  to *show* where the best move leads without turning into an engine dump. */
const PV_PLIES = 12; // 6 full moves

export type MoveQuality = 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

/** The engine's principal variation from a position, best move first. */
export interface Pv {
  san: string[];
  uci: string[];
}

export interface BestLine {
  san: string | null;
  uci: string | null;
  /** White-relative centipawns (mate clamped to ±100000). */
  cpWhite: number;
  /** The whole continuation the engine expects, capped at `PV_PLIES`. `san[0]`
   *  / `uci[0]` are the same move as `san` / `uci` above. */
  pv: Pv;
}

export interface EngineChoice {
  uci: string | null;
  san: string | null;
  /** White-relative eval of the position with best play (the top candidate). */
  bestCpWhite: number;
  /** How hard the choice is, for the clock model — read off the multiPv evals.
   *  0 ≈ one dominant / forced / obvious move (play it fast); 1 ≈ several moves
   *  within a whisker of each other (a genuine crossroads worth a long think). */
  complexity: number;
}

export interface MoveVerdict {
  quality: MoveQuality;
  /** True when the user played the engine's exact top move. */
  isBest: boolean;
  /** The engine's preferred move in the position the user faced. */
  bestSan: string | null;
  bestUci: string | null;
  /** The continuation the best move leads to (best move first), so the UI can
   *  play it out on a board instead of only naming the move. */
  bestPv: Pv;
  /** Eval after the user's move, from the user's POV, in pawns. */
  evalAfterPawns: number;
  /** Drop in winning chances (0–1) the move cost vs. the best move. */
  dropProb: number;
}

/** White-relative cp for a line, mate clamped so arithmetic stays finite. */
function cpWhiteOf(line: AnalysisLine | undefined): number {
  if (!line) return 0;
  if (line.mate != null) return line.mate > 0 ? 100000 : -100000;
  return line.cp ?? 0;
}

/** Logistic win probability from white-relative cp (Elo-style expected score). */
function winProb(cp: number): number {
  return 1 / (1 + Math.pow(10, -cp / 400));
}

/** Softmax temperature (in cp) from a target Elo: strong → near-best play,
 *  weak → flatter distribution that picks (and blunders) lesser moves. */
function tempFromElo(elo: number): number {
  return Math.max(18, (2200 - elo) * 0.22);
}

/** Best move + eval + continuation in a position, at judging strength. */
export async function bestLine(fen: string, depth = JUDGE_DEPTH): Promise<BestLine> {
  const res = await getWasmEngine().analyze({ fen, depth, multiPv: 1 });
  const top = res.lines[0];
  // The search already produced the whole PV — keep a slice of it rather than
  // throwing it away and re-searching later just to show the follow-up.
  const san = (top?.pvSan ?? []).slice(0, PV_PLIES);
  const uci = (top?.pvUci ?? []).slice(0, PV_PLIES);
  return { san: san[0] ?? null, uci: uci[0] ?? null, cpWhite: cpWhiteOf(top), pv: { san, uci } };
}

/**
 * Choose the opponent's move at the given Elo: sample from the top candidates
 * weighted by exp(-loss / T), where loss is how much eval the move concedes vs.
 * the best and T grows as Elo falls. Returns the chosen move plus the position's
 * best eval (top candidate) so the caller can also judge the user's prior move.
 */
export async function chooseEngineMove(fen: string, elo: number, depth = OPPONENT_DEPTH): Promise<EngineChoice> {
  const res = await getWasmEngine().analyze({ fen, depth, multiPv: CANDIDATES });
  const lines = res.lines.filter((l) => l.pvUci.length > 0);
  if (lines.length === 0) return { uci: null, san: null, bestCpWhite: 0, complexity: 0 };

  const stm = fen.split(' ')[1] === 'w' ? 1 : -1; // side-to-move sign
  const scored = lines.map((l) => {
    const cpWhite = cpWhiteOf(l);
    return { uci: l.pvUci[0], san: l.pvSan[0] ?? null, cpWhite, evalStm: cpWhite * stm };
  });

  // Read position complexity off the candidate evals (best-first). A big gap from
  // #1 to #2 means the top move is clearly forced/obvious; several moves within
  // ~half a pawn mean a real choice. `complexity` ∈ [0,1] feeds the clock model.
  const evalsStm = scored.map((s) => s.evalStm);
  const gap = evalsStm.length > 1 ? evalsStm[0] - evalsStm[1] : 1000; // cp, #1 over #2
  const nClose = evalsStm.filter((e) => evalsStm[0] - e <= 55).length; // within ~½ pawn
  const forced = Math.max(0, Math.min(1, gap / 220)); // dominant top move → 1
  const breadth = Math.max(0, Math.min(1, (nClose - 1) / 4)); // many close options → 1
  const complexity = Math.max(0, Math.min(1, breadth * (1 - forced)));
  // lines are best-first, so scored[0] is the engine's top choice.
  const best = scored[0].evalStm;
  const T = tempFromElo(elo);
  const weights = scored.map((s) => Math.exp(-(best - s.evalStm) / T));
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  let r = Math.random() * total;
  let pick = scored[0];
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = scored[i];
      break;
    }
  }
  return { uci: pick.uci, san: pick.san, bestCpWhite: scored[0].cpWhite, complexity };
}

/**
 * Judge the user's move: compare the eval after their move to the eval the best
 * move would have kept, both from the user's POV, and classify the drop in
 * winning chances. `bestCpWhite` is the eval the best move keeps (analyse the
 * position they faced); `afterCpWhite` is the eval after the move they played
 * (the opponent's top candidate in the resulting position).
 */
export function judgeMove(
  bestCpWhite: number,
  bestSan: string | null,
  bestUci: string | null,
  afterCpWhite: number,
  userColor: 'w' | 'b',
  playedSan: string,
  /** The best move's continuation, straight off the same search — optional, so
   *  callers that only care about the grade can leave it out. */
  bestPv: Pv = { san: [], uci: [] },
): MoveVerdict {
  const sign = userColor === 'w' ? 1 : -1;
  const evalAfterPawns = (afterCpWhite * sign) / 100;
  const dropProb = winProb(bestCpWhite * sign) - winProb(afterCpWhite * sign);

  const isBest = !!bestSan && playedSan === bestSan;
  let quality: MoveQuality = 'ok';
  // Grade non-best moves by the drop in winning chances; a small drop is still
  // "ok" (a fine alternative), so we don't nag over engine-line hair-splitting.
  if (!isBest) {
    if (dropProb >= 0.3) quality = 'blunder';
    else if (dropProb >= 0.15) quality = 'mistake';
    else if (dropProb >= 0.07) quality = 'inaccuracy';
  }
  return { quality, isBest, bestSan, bestUci, bestPv, evalAfterPawns, dropProb };
}
