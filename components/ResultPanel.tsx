'use client';

import type { Puzzle } from '@/lib/types';

interface ResultPanelProps {
  puzzle: Puzzle;
  yourMove: string;
  /** SANs of every wrong move tried before solving (or giving up). */
  attempts: string[];
  isOk: boolean;
  /** True once the continuation has played out and the board is free to explore. */
  analysis?: boolean;
  onRetry: () => void;
  onNext: () => void;
}

/**
 * Render the engine line in move-numbered SAN starting from the critical
 * position, e.g. "22… Qf7 23. f4 Qh5". `startPly` is how many plies preceded
 * the position (so move numbers and the side to move line up).
 */
function formatEngineLine(line: string[], startPly: number): string {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ply = startPly + i;
    const moveNo = Math.floor(ply / 2) + 1;
    const whiteToMove = ply % 2 === 0;
    if (whiteToMove) out += `${moveNo}. ${line[i]} `;
    else out += i === 0 ? `${moveNo}… ${line[i]} ` : `${line[i]} `;
  }
  return out.trim();
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
  attempts,
  isOk,
  analysis,
  onRetry,
  onNext,
}: ResultPanelProps) {
  const gaveUp = yourMove === '—';
  const engineLine = puzzle.line && puzzle.line.length > 1 ? puzzle.line : null;
  const verdictText = isOk ? 'Correct.' : gaveUp ? 'Solution shown.' : 'Suboptimal.';
  const verdictSub = isOk
    ? 'Engine line found.'
    : gaveUp
      ? 'Try the next one.'
      : 'Stockfish prefers a different move.';

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
        <div className="verdict-ico">{isOk ? '✓' : '✗'}</div>
        <div>
          <div className="verdict-text">{verdictText}</div>
          <div className="verdict-sub">{verdictSub}</div>
        </div>
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
            {formatEngineLine(engineLine, puzzle.setupMoves.length)}
          </div>
        </div>
      )}

      {analysis && (
        <div className="analysis-note">Board unlocked — move pieces to explore the position.</div>
      )}

      <div className="blunder-line">
        Blunder in real game:<span className="v">{puzzle.mistakeMove}</span>
      </div>

      {attempts.length > 0 && (
        <div className="tries-line">
          Wrong tries: <span className="v">{attempts.join(', ')}</span>
        </div>
      )}

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
