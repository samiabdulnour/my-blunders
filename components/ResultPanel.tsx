'use client';

import type { Puzzle } from '@/lib/types';

interface ResultPanelProps {
  puzzle: Puzzle;
  yourMove: string;
  isOk: boolean;
  /** Jump the board to the position after the i-th move of the engine line. */
  onSeek?: (ply: number) => void;
  /** Index of the engine-line move currently shown on the board (for highlight). */
  seekPly?: number | null;
  onRetry: () => void;
  onNext: () => void;
}

const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));
const fmtEval = (v: number) => {
  if (Math.abs(v) > 50) return v > 0 ? '+M' : '−M';
  return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
};

/**
 * Verdict-first result: a mint ✓ / coral ✗ verdict block, an eval bar that
 * plots the before/after evaluation and the drop between them, the engine's
 * best move vs. what the user played, the real-game blunder, and the action
 * buttons. The "Lichess" button deep-links to the exact game position.
 */
export function ResultPanel({
  puzzle,
  yourMove,
  isOk,
  onSeek,
  seekPly,
  onRetry,
  onNext,
}: ResultPanelProps) {
  const gaveUp = yourMove === '—';
  const engineLine = puzzle.line && puzzle.line.length > 1 ? puzzle.line : null;
  const verdictText = isOk ? 'Correct.' : gaveUp ? 'Solution shown.' : 'Suboptimal.';

  // Map evals from −8..+8 onto 0..100% and draw the drop as a filled span.
  const pctBefore = ((clamp(puzzle.evalBefore, -8, 8) + 8) / 16) * 100;
  const pctAfter = ((clamp(puzzle.evalAfter, -8, 8) + 8) / 16) * 100;
  const fillL = Math.min(pctBefore, pctAfter);
  const fillW = Math.abs(pctAfter - pctBefore);

  /**
   * Where the "view game" button points. For a real Lichess game URL
   * (lichess.org/<8-char id>), build a deep link to the exact position + POV:
   *   /{gameId}        — white POV   ·   /{gameId}/black — black POV   ·   #N — ply
   * Famous-game puzzles instead carry a plain reference URL (Wikipedia) or a
   * Lichess /analysis/ board, which we open verbatim — appending a ply/POV
   * path would corrupt those.
   */
  const isLichessGame = /lichess\.org\/[A-Za-z0-9]{8}(?:[/#?]|$)/.test(puzzle.site);
  const gameUrl = (() => {
    if (!isLichessGame) return puzzle.site;
    const base = puzzle.site.replace(/#.*$/, '').replace(/\/$/, '');
    const ply = puzzle.setupMoves.length;
    const pov = puzzle.abdulsColor === 'black' ? '/black' : '';
    return `${base}${pov}#${ply}`;
  })();
  const linkLabel = isLichessGame
    ? 'Lichess'
    : puzzle.site.includes('lichess.org')
      ? 'Analyse'
      : 'View game';

  return (
    <div className="result">
      <div className={'verdict ' + (isOk ? 'ok' : 'bad')}>
        <span className="verdict-ico">{isOk ? '✓' : '✗'}</span>
        <span className="verdict-text">{verdictText}</span>
      </div>

      <div className="eval-bar">
        <div className="eval-bar-h">
          <span>Eval drop</span>
          <span className="drop">−{puzzle.drop.toFixed(1)}</span>
        </div>
        <div className="eval-track">
          <div className="eval-fill" style={{ left: fillL + '%', width: fillW + '%' }} />
          <div className="eval-marker" style={{ left: pctBefore + '%' }} />
          <div className="eval-marker" style={{ left: pctAfter + '%' }} />
        </div>
        <div className="eval-vals">
          <span className="before">before {fmtEval(puzzle.evalBefore)}</span>
          <span className="after">after {fmtEval(puzzle.evalAfter)}</span>
        </div>
      </div>

      <div className="move-grid">
        <div className="move-cell best">
          <div className="lbl">Engine best</div>
          <div className="v">{puzzle.bestMove}</div>
        </div>
        <div className={'move-cell ' + (isOk ? 'user-ok' : 'bad')}>
          <div className="lbl">You played</div>
          <div className="v">{yourMove || '—'}</div>
        </div>
      </div>

      {engineLine && (
        <div className="engine-line">
          <div className="engine-line-h">{puzzle.combination ? 'Winning line' : 'Engine line'}</div>
          <div className="engine-line-moves">
            {engineLine.map((san, i) => {
              const ply = puzzle.setupMoves.length + i;
              const whiteToMove = ply % 2 === 0;
              const showNo = whiteToMove || i === 0;
              return (
                <span key={i} className="el-tok">
                  {showNo && <span className="el-no num">{Math.floor(ply / 2) + 1}{whiteToMove ? '.' : '…'}</span>}
                  <button
                    type="button"
                    className={'el-move' + (seekPly === i ? ' cur' : '')}
                    onClick={() => onSeek?.(i)}
                    title="Show this position"
                  >
                    {san}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="blunder-line">
        Blunder in real game:<span className="v">{puzzle.mistakeMove}</span>
      </div>

      <div className="actions">
        <button className="btn prim" onClick={onNext}>
          Next puzzle →
        </button>
        <div className="btn-row">
          <button className="btn" onClick={onRetry}>
            Retry
          </button>
          <button
            className="btn"
            onClick={() => window.open(gameUrl, '_blank', 'noopener,noreferrer')}
          >
            {linkLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
