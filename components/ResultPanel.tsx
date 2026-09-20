'use client';

import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Puzzle } from '@/lib/types';
import { BestLinePopup } from '@/components/BestLinePopup';
import { figurine } from '@/lib/figurine';

interface ResultPanelProps {
  puzzle: Puzzle;
  yourMove: string;
  isOk: boolean;
  onRetry: () => void;
  onNext: () => void;
  /** Open the Play tab at this puzzle's position to play it out vs the engine. */
  onPlay: () => void;
}

/**
 * Condensed result: the action buttons (Next / Retry / Play) up top, a mint ✓
 * "Correct" / coral ✗ verdict, then the best move and the real-game blunder as
 * a tight label→value grid. Tapping either move opens a board popup that replays
 * it — the engine's winning line, or how the game actually went. The "Play"
 * button hands the exact position to the Play tab to play it out vs the engine.
 */
export function ResultPanel({
  puzzle,
  yourMove,
  isOk,
  onRetry,
  onNext,
  onPlay,
}: ResultPanelProps) {
  const gaveUp = yourMove === '—';
  const verdictText = isOk ? 'Correct.' : gaveUp ? 'Solution shown.' : 'Suboptimal.';
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
      <div className="actions">
        <button className="btn prim" onClick={onNext}>
          Next puzzle →
        </button>
        <div className="btn-row">
          <button className="btn" onClick={onRetry}>
            Retry
          </button>
          <button className="btn" onClick={onPlay}>
            Play →
          </button>
        </div>
      </div>

      {/* Facts and verdict share one row to keep the panel compact. */}
      <div className="result-summary">
        <div className="result-facts">
          <div className="rf">
            <span className="rf-lbl">Best move</span>
            <span className="rf-v best">
              <button type="button" className="rf-move" onClick={() => setPopup('best')} title="Show the winning line on a board">
                {figurine(puzzle.bestMove, orient)}
              </button>{' '}
              <span className="rf-eval">({fmtEval(puzzle.evalBefore * sideSign)})</span>
            </span>
          </div>
          <div className="rf">
            <span className="rf-lbl">Blunder in game</span>
            <span className="rf-v">
              <button type="button" className="rf-move" onClick={() => setPopup('played')} title="Replay how the game actually went">
                {figurine(puzzle.mistakeMove, orient)}
              </button>{' '}
              <span className="rf-eval">({fmtEval(puzzle.evalAfter * sideSign)})</span>
            </span>
          </div>
        </div>
        <div className={'verdict ' + (isOk ? 'ok' : 'bad')}>
          <span className="verdict-ico">{isOk ? '✓' : '✗'}</span>
          <span className="verdict-text">{verdictText}</span>
        </div>
      </div>

      {popup && (
        <BestLinePopup
          fen={puzzleFen}
          pvSan={popup === 'best' ? bestPv : playedPv}
          orient={orient}
          lead={popup === 'best' ? 'Best was' : 'You played'}
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
