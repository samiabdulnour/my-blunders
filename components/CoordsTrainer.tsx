'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { FAMOUS_GAMES } from '@/lib/famous-games';

/**
 * Coordinate / board-vision trainer (Lichess-style), three modes:
 *  · Find the square — a coordinate is named; click it on a piece-less board.
 *  · Square colour   — a coordinate is named; say if it's a light or dark square.
 *  · Play famous games — replay canonical games move-by-move for both sides.
 *
 * Each mode renders a left panel (mode nav + session controls) and a right
 * content area (board / prompt), matching the sidebar pattern of other modes.
 */

type SubMode = 'find' | 'color' | 'replay';

const FILES = 'abcdefgh';

/** a1 is dark; a square is light when file+rank index sum is odd. */
function isLight(sq: string): boolean {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  return (f + r) % 2 === 1;
}
function randomSquare(): string {
  return FILES[Math.floor(Math.random() * 8)] + (Math.floor(Math.random() * 8) + 1);
}
function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Open-ended drill session: a count-up clock and tallies, ended by Finish. */
function useSession() {
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = () => { setElapsed(0); setCorrect(0); setWrong(0); setOver(false); setRunning(true); };
  const finish = () => { setRunning(false); setOver(true); };
  return { running, over, elapsed, correct, wrong, setCorrect, setWrong, start, finish };
}

/** Left-panel nav: three mode buttons. */
function ModeNav({ sub, onChangeSub }: { sub: SubMode; onChangeSub: (s: SubMode) => void }) {
  return (
    <nav className="coords-nav">
      <button type="button" className={'ct-nav-btn' + (sub === 'find' ? ' on' : '')} onClick={() => onChangeSub('find')}>Find the square</button>
      <button type="button" className={'ct-nav-btn' + (sub === 'color' ? ' on' : '')} onClick={() => onChangeSub('color')}>Square colour</button>
      <button type="button" className={'ct-nav-btn' + (sub === 'replay' ? ' on' : '')} onClick={() => onChangeSub('replay')}>Play famous games</button>
    </nav>
  );
}

/** Session controls in the sidebar: Start/Finish button + time/done stats. */
function SessionPanel({ running, over, elapsed, correct, wrong, onStart, onFinish }: {
  running: boolean; over: boolean; elapsed: number; correct: number; wrong: number;
  onStart: () => void; onFinish: () => void;
}) {
  return (
    <div className="ct-panel-section">
      <button type="button" className="ct-action-full" onClick={running ? onFinish : onStart}>
        {running ? 'Finish' : over ? 'Go again' : 'Start'}
      </button>
      <div className="ct-panel-stats">
        <div className="ct-panel-stat">
          <span className="ct-panel-num">{mmss(elapsed)}</span>
          <span className="ct-panel-label">time</span>
        </div>
        <div className="ct-panel-stat">
          <span className="ct-panel-num">{correct}</span>
          <span className="ct-panel-label">done</span>
        </div>
      </div>
      {over && (
        <p className="ct-panel-result">
          <b>{correct}</b> correct in {mmss(elapsed)}{wrong > 0 ? ` · ${wrong} missed` : ''}
        </p>
      )}
    </div>
  );
}

export function CoordsTrainer() {
  const [sub, setSub] = useState<SubMode>('find');
  return (
    <div className="coords-shell">
      {sub === 'find' ? <FindMode sub={sub} onChangeSub={setSub} />
       : sub === 'color' ? <ColorMode sub={sub} onChangeSub={setSub} />
       : <ReplayMode sub={sub} onChangeSub={setSub} />}
    </div>
  );
}

function FindMode({ sub, onChangeSub }: { sub: SubMode; onChangeSub: (s: SubMode) => void }) {
  const { running, over, elapsed, correct, wrong, setCorrect, setWrong, start, finish } = useSession();
  const [target, setTarget] = useState('e4');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [showCoords, setShowCoords] = useState(false);
  const [flash, setFlash] = useState<{ sq: string; ok: boolean } | null>(null);

  const begin = () => { setTarget(randomSquare()); setFlash(null); start(); };
  const pick = (sq: string) => {
    if (!running || flash) return;
    if (sq === target) {
      setCorrect((s) => s + 1);
      setFlash({ sq, ok: true });
      window.setTimeout(() => { setFlash(null); setTarget(randomSquare()); }, 320);
    } else {
      setWrong((w) => w + 1);
      setFlash({ sq, ok: false });
      window.setTimeout(() => setFlash(null), 420);
    }
  };

  return (
    <>
      <aside className="coords-panel">
        <div className="side-h">Coordinates</div>
        <ModeNav sub={sub} onChangeSub={onChangeSub} />
        <div className="ct-panel-sep" />
        <SessionPanel running={running} over={over} elapsed={elapsed} correct={correct} wrong={wrong} onStart={begin} onFinish={finish} />
        <div className="ct-panel-sep" />
        <div className="ct-panel-section">
          <p className="ct-panel-persp">Board from <b>{orientation === 'white' ? 'White' : 'Black'}</b>&apos;s side</p>
          <button type="button" className="ct-panel-btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
            Flip board
          </button>
          <label className="ct-toggle">
            <input type="checkbox" checked={showCoords} onChange={(e) => setShowCoords(e.target.checked)} />
            Show coords
          </label>
        </div>
      </aside>
      <div className="coords-content">
        <div className="ct-prompt small">
          {running
            ? <span>Find <span className="ct-coord">{target}</span></span>
            : over ? null
            : <span className="ct-idle">Press Start to begin</span>}
        </div>
        <CoordBoard orientation={orientation} onPick={running ? pick : () => {}} flash={flash} interactive={running} showCoords={showCoords} />
      </div>
    </>
  );
}

function ColorMode({ sub, onChangeSub }: { sub: SubMode; onChangeSub: (s: SubMode) => void }) {
  const { running, over, elapsed, correct, wrong, setCorrect, setWrong, start, finish } = useSession();
  const [target, setTarget] = useState('e4');
  const [fb, setFb] = useState<'ok' | 'fail' | null>(null);

  const begin = () => { setTarget(randomSquare()); setFb(null); start(); };
  const answer = (light: boolean) => {
    if (!running || fb === 'fail') return;
    if (isLight(target) === light) {
      setCorrect((s) => s + 1);
      setFb('ok');
      window.setTimeout(() => { setFb(null); setTarget(randomSquare()); }, 350);
    } else {
      setWrong((w) => w + 1);
      setFb('fail');
      window.setTimeout(() => setFb(null), 600);
    }
  };

  return (
    <>
      <aside className="coords-panel">
        <div className="side-h">Coordinates</div>
        <ModeNav sub={sub} onChangeSub={onChangeSub} />
        <div className="ct-panel-sep" />
        <SessionPanel running={running} over={over} elapsed={elapsed} correct={correct} wrong={wrong} onStart={begin} onFinish={finish} />
      </aside>
      <div className="coords-content">
        <div className={'ct-prompt' + (fb ? ' f-' + fb : '')}>
          {running ? (
            <>
              <span className="ct-coord">{target}</span>
              {fb === 'ok' && <span className="ct-check ok">✓</span>}
              {fb === 'fail' && <span className="ct-check fail">✗ it&apos;s {isLight(target) ? 'light' : 'dark'}</span>}
            </>
          ) : over ? null : (
            <span className="ct-idle">Light or dark square?</span>
          )}
        </div>
        <div className="ct-color-btns">
          <button type="button" className="ct-color-btn light" onClick={() => answer(true)} disabled={!running}>Light</button>
          <button type="button" className="ct-color-btn dark" onClick={() => answer(false)} disabled={!running}>Dark</button>
        </div>
      </div>
    </>
  );
}

/** Piece-less 8×8 board used by Find mode, with optional edge coordinates. */
function CoordBoard({ orientation, onPick, flash, interactive, showCoords }: {
  orientation: 'white' | 'black';
  onPick: (sq: string) => void;
  flash: { sq: string; ok: boolean } | null;
  interactive: boolean;
  showCoords: boolean;
}) {
  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? FILES.split('') : FILES.split('').reverse();
  const grid = (
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
  if (!showCoords) return grid;
  return (
    <div className="ct-board-area">
      <div className="ct-ranks">{ranks.map((r) => <span key={r}>{r}</span>)}</div>
      {grid}
      <div className="ct-files">{files.map((f) => <span key={f}>{f}</span>)}</div>
    </div>
  );
}

function ReplayMode({ sub, onChangeSub }: { sub: SubMode; onChangeSub: (s: SubMode) => void }) {
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

  const movesRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const ol = movesRef.current;
    const next = ol?.querySelector<HTMLElement>('.ct-ply.next');
    if (ol && next) ol.scrollTop = next.offsetTop - ol.clientHeight / 2;
  }, [ply]);

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
      g.undo();
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

  const rows: { n: number; w?: string; wPly: number; b?: string; bPly: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push({ n: i / 2 + 1, w: moves[i], wPly: i, b: moves[i + 1], bPly: i + 1 });

  return (
    <>
      <aside className="coords-panel">
        <div className="side-h">Coordinates</div>
        <ModeNav sub={sub} onChangeSub={onChangeSub} />
        <div className="ct-panel-sep" />
        <div className="ct-panel-section">
          <div className="ct-panel-label-h">Game</div>
          <select className="ct-game-select" value={gameIdx} onChange={(e) => setGameIdx(Number(e.target.value))}>
            {FAMOUS_GAMES.map((g, i) => (
              <option key={g.id} value={i}>{g.title}{g.year ? ` · ${g.year}` : ''}</option>
            ))}
          </select>
          <div className="ct-game-players">{game.white} – {game.black}</div>
          <p className="ct-game-context">{game.context}</p>
        </div>
        <div className="ct-panel-sep" />
        <div className="ct-panel-section">
          <div className="ct-panel-label-h">{done ? 'Game complete ♚' : `${sideToMove === 'w' ? 'White' : 'Black'} to move`}</div>
          {done ? (
            <div className="ps-hint">You replayed the whole game. Result: <b>{game.result}</b>.</div>
          ) : (
            <div className="ps-hint">Play the game&apos;s next move{wrong ? ' — that wasn’t it, try again.' : '.'}</div>
          )}
          <div className="ct-controls">
            <button type="button" className="ct-panel-btn" onClick={showMove} disabled={done}>Show move</button>
            <button type="button" className="ct-panel-btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>Flip board</button>
            <button type="button" className="ct-panel-btn" onClick={restart} disabled={ply === 0}>Restart</button>
          </div>
        </div>
      </aside>

      <div className="coords-content coords-replay-content">
        <aside className="ct-replay-moves ps-block">
          <div className="ps-h">Moves · {Math.ceil(moves.length / 2)}</div>
          <ol className="ps-moves ct-moves" ref={movesRef}>
            {rows.map((r) => (
              <li className="ps-move-row" key={r.n}>
                <span className="ps-move-no num">{r.n}.</span>
                <span className={'ct-ply' + (r.wPly < ply ? ' done' : '') + (r.wPly === ply ? ' next' : '')}>{r.w}</span>
                <span className={'ct-ply' + (r.b ? (r.bPly < ply ? ' done' : '') + (r.bPly === ply ? ' next' : '') : '')}>{r.b ?? ''}</span>
              </li>
            ))}
          </ol>
        </aside>
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
      </div>
    </>
  );
}
