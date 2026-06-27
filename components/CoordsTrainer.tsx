'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { FAMOUS_GAMES } from '@/lib/famous-games';

/**
 * Coordinate / board-vision trainer (Lichess-style), three modes:
 *  · Find the square — a coordinate is named; click it on an unlabelled board.
 *  · Square colour   — a coordinate is named; say if it's a light or dark square.
 *  · Play famous games — replay canonical games move-by-move for both sides.
 * The first two are 30-second sprints scored against a stored best.
 */

type SubMode = 'find' | 'color' | 'replay';

const FILES = 'abcdefgh';
const ROUND_SECONDS = 30;

/** a1 is dark; a square is light when file+rank index sum is odd. */
function isLight(sq: string): boolean {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  return (f + r) % 2 === 1;
}
function randomSquare(): string {
  return FILES[Math.floor(Math.random() * 8)] + (Math.floor(Math.random() * 8) + 1);
}
function loadBest(key: string): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem('bt.coords.' + key) || 0);
}
function saveBest(key: string, v: number) {
  try { window.localStorage.setItem('bt.coords.' + key, String(v)); } catch { /* ignore */ }
}

export function CoordsTrainer() {
  const [sub, setSub] = useState<SubMode>('find');
  return (
    <div className="coords">
      <div className="coords-head">
        <div className="seg-tabs coords-modes" role="tablist" aria-label="Trainer mode">
          <button type="button" role="tab" aria-selected={sub === 'find'} className={'seg-tab' + (sub === 'find' ? ' on' : '')} onClick={() => setSub('find')}>Find the square</button>
          <button type="button" role="tab" aria-selected={sub === 'color'} className={'seg-tab' + (sub === 'color' ? ' on' : '')} onClick={() => setSub('color')}>Square colour</button>
          <button type="button" role="tab" aria-selected={sub === 'replay'} className={'seg-tab' + (sub === 'replay' ? ' on' : '')} onClick={() => setSub('replay')}>Play famous games</button>
        </div>
      </div>
      {sub === 'find' ? <FindMode /> : sub === 'color' ? <ColorMode /> : <ReplayMode />}
    </div>
  );
}

/** Shared 30-second sprint state for the two coordinate sprints. */
function useSprint(key: string) {
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const scoreRef = useRef(0);
  scoreRef.current = score;

  useEffect(() => { setBest(loadBest(key)); }, [key]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setRunning(false);
          setOver(true);
          setBest((b) => { const nb = Math.max(b, scoreRef.current); saveBest(key, nb); return nb; });
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, key]);

  const start = () => { setScore(0); setTimeLeft(ROUND_SECONDS); setOver(false); setRunning(true); };
  return { running, over, timeLeft, score, best, setScore, start };
}

function ColorMode() {
  const { running, over, timeLeft, score, best, setScore, start } = useSprint('color');
  const [target, setTarget] = useState('e4');
  const [flash, setFlash] = useState<'ok' | 'fail' | null>(null);

  const begin = () => { setTarget(randomSquare()); setFlash(null); start(); };
  const answer = (light: boolean) => {
    if (!running) return;
    const correct = isLight(target) === light;
    if (correct) setScore((s) => s + 1);
    setFlash(correct ? 'ok' : 'fail');
    setTarget(randomSquare());
    window.setTimeout(() => setFlash(null), 180);
  };

  return (
    <div className="ct-pane">
      <SprintBar running={running} timeLeft={timeLeft} score={score} best={best} />
      <div className={'ct-prompt' + (flash ? ' f-' + flash : '')}>
        {running ? <span className="ct-coord">{target}</span> : <span className="ct-idle">Light or dark square?</span>}
      </div>
      {running ? (
        <div className="ct-color-btns">
          <button className="ct-color-btn light" onClick={() => answer(true)}>Light</button>
          <button className="ct-color-btn dark" onClick={() => answer(false)}>Dark</button>
        </div>
      ) : (
        <StartCard over={over} score={score} best={best} onStart={begin}
          blurb="A coordinate is shown — tap whether it's a light or dark square. As many as you can in 30 seconds." />
      )}
    </div>
  );
}

function FindMode() {
  const { running, over, timeLeft, score, best, setScore, start } = useSprint('find');
  const [target, setTarget] = useState('e4');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [flash, setFlash] = useState<{ sq: string; ok: boolean } | null>(null);

  const begin = () => { setTarget(randomSquare()); setFlash(null); start(); };
  const pick = (sq: string) => {
    if (!running) return;
    const ok = sq === target;
    if (ok) setScore((s) => s + 1);
    setFlash({ sq, ok });
    if (ok) setTarget(randomSquare());
    window.setTimeout(() => setFlash(null), 220);
  };

  return (
    <div className="ct-pane ct-find">
      <SprintBar running={running} timeLeft={timeLeft} score={score} best={best}>
        <button className="ct-flip" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>Flip</button>
      </SprintBar>
      <div className="ct-prompt small">
        {running ? <>Find <span className="ct-coord">{target}</span></> : <span className="ct-idle">Click the named square</span>}
      </div>
      <div className="ct-find-row">
        <CoordBoard orientation={orientation} onPick={pick} flash={flash} interactive={running} />
        {!running && (
          <StartCard over={over} score={score} best={best} onStart={begin}
            blurb="A coordinate is named — click that square on the board (no labels!). As many as you can in 30 seconds." />
        )}
      </div>
    </div>
  );
}

/** Unlabelled 8×8 board used by Find mode. */
function CoordBoard({ orientation, onPick, flash, interactive }: {
  orientation: 'white' | 'black';
  onPick: (sq: string) => void;
  flash: { sq: string; ok: boolean } | null;
  interactive: boolean;
}) {
  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? FILES.split('') : FILES.split('').reverse();
  return (
    <div className={'ct-board' + (interactive ? '' : ' idle')}>
      {ranks.map((r) => files.map((f) => {
        const sq = f + r;
        const light = isLight(sq);
        const fl = flash && flash.sq === sq;
        return (
          <button
            key={sq}
            type="button"
            className={'ct-sq ' + (light ? 'l' : 'd') + (fl ? (flash!.ok ? ' ok' : ' fail') : '')}
            data-sq={sq}
            onClick={() => onPick(sq)}
            tabIndex={interactive ? 0 : -1}
            aria-label={sq}
          />
        );
      }))}
    </div>
  );
}

function SprintBar({ running, timeLeft, score, best, children }: { running: boolean; timeLeft: number; score: number; best: number; children?: React.ReactNode }) {
  return (
    <div className="ct-bar">
      <div className="ct-stat"><span className="ct-stat-n num">{running ? timeLeft : '30'}</span><span className="ct-stat-l">seconds</span></div>
      <div className="ct-stat"><span className="ct-stat-n num">{score}</span><span className="ct-stat-l">score</span></div>
      <div className="ct-stat"><span className="ct-stat-n num">{best}</span><span className="ct-stat-l">best</span></div>
      {children}
    </div>
  );
}

function StartCard({ over, score, best, onStart, blurb }: { over: boolean; score: number; best: number; onStart: () => void; blurb: string }) {
  return (
    <div className="ct-start">
      {over ? (
        <>
          <div className="ct-final">You scored <b>{score}</b>{score >= best && score > 0 ? ' — new best!' : ''}</div>
          <button className="ct-go" onClick={onStart}>Play again</button>
        </>
      ) : (
        <>
          <p className="ct-blurb">{blurb}</p>
          <button className="ct-go" onClick={onStart}>Start</button>
        </>
      )}
    </div>
  );
}

function ReplayMode() {
  const [gameIdx, setGameIdx] = useState(0);
  const game = FAMOUS_GAMES[gameIdx];
  const moves = useMemo(() => game.san.trim().split(/\s+/), [game]);

  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [ply, setPly] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [wrong, setWrong] = useState<{ from: string; to: string } | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');

  useEffect(() => {
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setPly(0); setSelected(null); setLastMove(null); setWrong(null);
  }, [gameIdx]);

  const boardChess = useMemo(() => new Chess(fen), [fen]);
  const done = ply >= moves.length;
  const expected = done ? null : moves[ply];
  const sideToMove = boardChess.turn();

  const legalFrom = useMemo(() => {
    const out: Record<string, Move[]> = {};
    if (done) return out;
    for (const m of boardChess.moves({ verbose: true })) (out[m.from] ??= []).push(m);
    return out;
  }, [boardChess, done]);

  const advance = (mv: Move) => {
    setLastMove({ from: mv.from, to: mv.to });
    setFen(chessRef.current.fen());
    setPly((p) => p + 1);
    setSelected(null);
    setWrong(null);
  };

  const tryMove = (m: { from: string; to: string; promotion?: string }) => {
    if (done) return;
    const g = chessRef.current;
    let mv: Move | null;
    try { mv = g.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' }); } catch { return; }
    if (!mv) return;
    if (mv.san === expected) {
      advance(mv);
    } else {
      g.undo(); // not the game's move — reject
      setWrong({ from: m.from, to: m.to });
      setSelected(null);
      window.setTimeout(() => setWrong(null), 500);
    }
  };

  const onSquareClick = (sq: string) => {
    if (done) return;
    if (selected) {
      const cands = (legalFrom[selected] ?? []).filter((x) => x.to === sq);
      if (cands.length) { tryMove(cands.find((x) => x.promotion === 'q') ?? cands[0]); return; }
    }
    const p = boardChess.get(sq as Parameters<typeof boardChess.get>[0]);
    setSelected(p && p.color === sideToMove ? sq : null);
  };

  const showMove = () => {
    if (done || !expected) return;
    const mv = chessRef.current.move(expected);
    if (mv) advance(mv);
  };
  const restart = () => {
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setPly(0); setSelected(null); setLastMove(null); setWrong(null);
  };

  // Numbered move rows; the next move to find is highlighted.
  const rows: { n: number; w?: string; wPly: number; b?: string; bPly: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push({ n: i / 2 + 1, w: moves[i], wPly: i, b: moves[i + 1], bPly: i + 1 });

  return (
    <div className="ct-replay">
      <div className="ct-replay-board">
        <Board
          chess={boardChess}
          orientation={orientation}
          selected={selected}
          legalFrom={legalFrom}
          lastFrom={lastMove?.from ?? null}
          lastTo={lastMove?.to ?? null}
          flashOk={null}
          flashFail={wrong?.to ?? null}
          bounceBack={wrong}
          introMove={null}
          revealed={done}
          onSquareClick={onSquareClick}
          onDragMove={(mv) => tryMove(mv)}
        />
      </div>

      <aside className="ct-replay-side">
        <div className="ps-block">
          <div className="ps-h">Game</div>
          <select className="ct-game-select" value={gameIdx} onChange={(e) => setGameIdx(Number(e.target.value))}>
            {FAMOUS_GAMES.map((g, i) => (
              <option key={g.id} value={i}>{g.white} – {g.black}{g.year ? ` (${g.year})` : ''}</option>
            ))}
          </select>
          <div className="ct-game-meta">{game.event}</div>
        </div>

        <div className="ps-block">
          <div className="ps-h">{done ? 'Game complete ♚' : `${sideToMove === 'w' ? 'White' : 'Black'} to move`}</div>
          {done ? (
            <div className="ps-hint">You replayed the whole game. Result: <b>{game.result}</b>.</div>
          ) : (
            <div className="ps-hint">Play the game&apos;s next move{wrong ? ' — that wasn’t it, try again.' : '.'}</div>
          )}
          <div className="ct-controls">
            <button className="ps-btn" onClick={showMove} disabled={done}>Show move</button>
            <button className="ps-btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>Flip board</button>
            <button className="ps-btn" onClick={restart} disabled={ply === 0}>Restart</button>
          </div>
        </div>

        <div className="ps-block ct-moves-block">
          <div className="ps-h">Moves · {Math.ceil(moves.length / 2)}</div>
          <ol className="ps-moves ct-moves">
            {rows.map((r) => (
              <li className="ps-move-row" key={r.n}>
                <span className="ps-move-no num">{r.n}.</span>
                <span className={'ct-ply' + (r.wPly < ply ? ' done' : '') + (r.wPly === ply ? ' next' : '')}>{r.w}</span>
                <span className={'ct-ply' + (r.b ? (r.bPly < ply ? ' done' : '') + (r.bPly === ply ? ' next' : '') : '')}>{r.b ?? ''}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
