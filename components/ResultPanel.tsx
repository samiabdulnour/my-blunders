'use client';

import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Puzzle } from '@/lib/types';
import { BestLinePopup } from '@/components/BestLinePopup';
import { figurine } from '@/lib/figurine';

interface ResultPanelProps {
  puzzle: Puzzle;
  /** The move you played (or '—' on show-solution). Kept for the caller; the
   *  verdict no longer distinguishes a wrong move from a shown solution. */
  yourMove: string;
  isOk: boolean;
  onRetry: () => void;
  onNext: () => void;
  /** Open the Play tab at this puzzle's position to play it out vs the engine. */
  onPlay: () => void;
}

/**
 * Condensed result: the verdict first — "Solved." in green, or "Puzzle
 * completed." in plain text — then a 2×2 grid of identical buttons — In game,
 * Best move, then Retry, Play — and Next puzzle last.
 * Tapping Best move or In game opens a board popup that replays it — the
 * engine's winning line, or how the game actually went. "Play" hands the exact
 * position to the Play tab to play it out vs the engine.
 *
 * The replay is the most useful thing on this panel, and it used to hide behind
 * a faintly underlined move in a line of text — nobody found it. Each move is
 * now a button exactly like Retry and Play (same box, same contour), so it reads
 * as tappable by the company it keeps. One line each: label + move. The eval
 * moved into the popup header, next to its live eval bar: with it, "BEST MOVE
 * ♞f3 (+21.6)" is 147px, which fits an iPhone 17's 147px cell by 0.2px and no
 * other phone; without it the longest move fits everywhere with room to spare.
 */
export function ResultPanel({
  puzzle,
  isOk,
  onRetry,
  onNext,
  onPlay,
}: ResultPanelProps) {
  // Two outcomes, in words, no glyphs: solved (green), or simply finished — a
  // wrong move and "show solution" both land here, in the plain text colour.
  const verdictText = isOk ? 'Solved.' : 'Puzzle completed.';
  // Evals are stored side-relative (+ = good for the player who moved). Chess
  // convention is white-relative (+ = good for White), so flip the sign when the
  // player to move was Black — that's what every board/engine shows.
  const sideSign = puzzle.abdulsColor === 'white' ? 1 : -1;
  const orient = puzzle.abdulsColor === 'white' ? 'w' : 'b';

  // FEN of the critical position (after the setup moves) — where both the best
  // move and the move you actually played branch from. Both replay popups start
  // here: one plays the engine's line, one plays how the game really went.
  const puzzleFen = useMemo(() => {
    const c = new Chess();
    for (const m of puzzle.setupMoves) {
      try { c.move(m); } catch { break; }
    }
    return c.fen();
  }, [puzzle.setupMoves]);
  const bestPv = puzzle.line && puzzle.line.length > 0 ? puzzle.line : [puzzle.bestMove];
  const playedPv =
    puzzle.playedLine && puzzle.playedLine.length > 0 ? puzzle.playedLine : [puzzle.mistakeMove];
  // Which move's line is expanded into the replay popup ('best' | 'played').
  const [popup, setPopup] = useState<'best' | 'played' | null>(null);

  return (
    <div className="result">
      <div className={'verdict ' + (isOk ? 'ok' : 'done')}>
        <span className="verdict-text">{verdictText}</span>
      </div>

      <div className="actions">
        {/* The two replays first, in the same boxes as Retry / Play: what you
            played, then what was best — the order the story happens in. Side by
            side on a phone; they stack wherever the slot is too narrow for both
            (desktop column, landscape phone). */}
        <div className="rf-cards">
          <button
            type="button"
            className="btn rf-card"
            onClick={() => setPopup('played')}
            aria-label={`In game ${puzzle.mistakeMove}. Replay how the game actually went.`}
          >
            <span className="rf-lbl">In game</span>
            <span className="rf-v">{figurine(puzzle.mistakeMove, orient)}</span>
          </button>
          <button
            type="button"
            className="btn rf-card"
            onClick={() => setPopup('best')}
            aria-label={`Best move ${puzzle.bestMove}. Watch the winning line on a board.`}
          >
            <span className="rf-lbl">Best move</span>
            <span className="rf-v best">{figurine(puzzle.bestMove, orient)}</span>
          </button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={onRetry}>
            Retry
          </button>
          <button className="btn" onClick={onPlay}>
            Play →
          </button>
        </div>
        {/* Next puzzle last — the way out, at the bottom where the thumb rests. */}
        <button className="btn prim" onClick={onNext}>
          Next puzzle →
        </button>
      </div>

      {popup && (
        <BestLinePopup
          fen={puzzleFen}
          pvSan={popup === 'best' ? bestPv : playedPv}
          orient={orient}
          lead={popup === 'best' ? 'Best was' : 'You played'}
          tail={fmtEval((popup === 'best' ? puzzle.evalBefore : puzzle.evalAfter) * sideSign)}
          note={
            popup === 'best'
              ? 'The position you had, then the engine’s best line. Tap a move to jump to it.'
              : 'The position you had, then how the game actually went. Tap a move to jump to it.'
          }
          maxPlies={12}
          firstDelay={900}
          stepMs={1200}
          onClose={() => setPopup(null)}
        />
      )}

    </div>
  );
}

/** Anything at/above this is a forced mate, not a real evaluation. Two sentinels
 *  exist in the data: the generator clamps mate to ±100 pawns (±10000cp), while
 *  the bundled famous puzzles use ±99 — so the cut-off sits well below both. No
 *  genuine position evaluates anywhere near ±50 pawns. */
const MATE_PAWNS = 50;

/** Pawns, white-relative → "+1.2" / "−0.4" / "#" — the standard board convention
 *  (positive = White better). Callers flip the stored side-relative eval with
 *  `sideSign` before passing it in. */
function fmtEval(pawns: number): string {
  if (!Number.isFinite(pawns)) return '–';
  if (pawns >= MATE_PAWNS) return '#';
  if (pawns <= -MATE_PAWNS) return '-#';
  return (pawns > 0 ? '+' : '') + pawns.toFixed(1);
}
