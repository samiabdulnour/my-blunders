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
 * two cards. Tapping a card opens a board popup that replays it — the engine's
 * winning line, or how the game actually went. The "Play" button hands the exact
 * position to the Play tab to play it out vs the engine.
 *
 * The replay is the most useful thing on this panel, and it used to hide behind
 * a faintly underlined move in a line of text — nobody found it. So each move is
 * now a whole card that reads as a button: bordered, a full-size touch target,
 * with a play mark that says "this plays something".
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

      <div className={'verdict ' + (isOk ? 'ok' : 'bad')}>
        <span className="verdict-ico">{isOk ? '✓' : '✗'}</span>
        <span className="verdict-text">{verdictText}</span>
      </div>

      {/* Two replay cards. Side by side on a phone; they stack wherever the slot
          is too narrow for both (desktop column, landscape phone). */}
      <div className="rf-cards">
        <button
          type="button"
          className="rf-card"
          onClick={() => setPopup('best')}
          aria-label={`Best move ${puzzle.bestMove}. Watch the winning line on a board.`}
        >
          <span className="rf-lbl">Best move</span>
          <span className="rf-v best">
            {figurine(puzzle.bestMove, orient)}{' '}
            <span className="rf-eval">({fmtEval(puzzle.evalBefore * sideSign)})</span>
          </span>
          <PlayMark />
        </button>
        <button
          type="button"
          className="rf-card"
          onClick={() => setPopup('played')}
          aria-label={`Blunder in game ${puzzle.mistakeMove}. Replay how the game actually went.`}
        >
          <span className="rf-lbl">Blunder in game</span>
          <span className="rf-v">
            {figurine(puzzle.mistakeMove, orient)}{' '}
            <span className="rf-eval">({fmtEval(puzzle.evalAfter * sideSign)})</span>
          </span>
          <PlayMark />
        </button>
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

/** The "this plays something" mark on a replay card — a solid disc with a play
 *  triangle, the one glyph everybody reads as "watch". An icon, not text, so it
 *  sits outside the three type styles. */
function PlayMark() {
  return (
    <svg className="rf-play" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="11" />
      <path d="M8.6 6.6 L15.6 11 L8.6 15.4 Z" />
    </svg>
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
