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
 * The drills are open-ended (start, then finish when you like) with a count-up
 * clock — no countdown, so there's no time pressure.
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

/** The session control: a primary action (Start/Finish/Go again) and the
 *  time / done readout, grouped together. Board options live separately. */
function SessionBar({ running, over, elapsed, correct, onStart, onFinish }: { running: boolean; over: boolean; elapsed: number; correct: number; onStart: () => void; onFinish: () => void }) {
  return (
    <div className="ct-bar">
      {running
        ? <button className="ct-action" onClick={onFinish}>Finish</button>
        : <button className="ct-action" onClick={onStart}>{over ? 'Go again' : 'Start'}</button>}
      <div className="ct-stats">
        <span className="ct-stat"><b className="num">{mmss(elapsed)}</b> time</span>
        <span className="ct-stat"><b className="num">{correct}</b> done</span>
      </div>
    </div>
  );
}

/** Prompt slot shown above the board/buttons — fixed structure so nothing jumps
 *  between idle, running and finished states. */
function Prompt({ running, over, elapsed, correct, wrong, idle, children }: { running: boolean; over: boolean; elapsed: number; correct: number; wrong: number; idle: string; children?: React.ReactNode }) {
  if (running) return <>{children}</>;
  if (over) return <span className="ct-idle"><b>{correct}</b> correct in {mmss(elapsed)}{wrong > 0 ? ` · ${wrong} missed` : ''}</span>;
  return <span className="ct-idle">{idle}</span>;
}

function ColorMode() {
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
      // Wrong: count it, show it, and stay on this square so guessing one colour
      // can't farm points — you have to actually get it right to move on.
      setWrong((w) => w + 1);
      setFb('fail');
      window.setTimeout(() => setFb(null), 600);
    }
  };

  return (
    <div className="ct-pane">
      <SessionBar running={running} over={over} elapsed={elapsed} correct={correct} onStart={begin} onFinish={finish} />
      <div className={'ct-prompt' + (fb ? ' f-' + fb : '')}>
        <Prompt running={running} over={over} elapsed={elapsed} correct={correct} wrong={wrong} idle="Light or dark square?">
          <span className="ct-coord">{target}</span>
          {fb === 'ok' && <span className="ct-check ok">✓</span>}
          {fb === 'fail' && <span className="ct-check fail">✗ it&apos;s {isLight(target) ? 'light' : 'dark'}</span>}
        </Prompt>
      </div>
      <div className="ct-color-btns">
        <button className="ct-color-btn light" onClick={() => answer(true)} disabled={!running}>Light</button>
        <button className="ct-color-btn dark" onClick={() => answer(false)} disabled={!running}>Dark</button>
      </div>
    </div>
  );
}

function FindMode() {
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

  // The board stays centred and in the same place in every state (idle/running/
  // finished); only the prompt above it changes. Session control sits in the
  // bar; board options sit on their own row, aligned to the board.
  return (
    <div className="ct-pane ct-find">
      <SessionBar running={running} over={over} elapsed={elapsed} correct={correct} onStart={begin} onFinish={finish} />
      <div className="ct-board-controls">
        <span className="ct-persp">Board from <b>{orientation === 'white' ? 'White' : 'Black'}</b>’s side</span>
        <div className="ct-board-opts">
          <label className="ct-toggle"><input type="checkbox" checked={showCoords} onChange={(e) => setShowCoords(e.target.checked)} /> Coords</label>
          <button className="ct-flip" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>Flip</button>
        </div>
      </div>
      <div className="ct-prompt small">
        <Prompt running={running} over={over} elapsed={elapsed} correct={correct} wrong={wrong} idle="Press Start, then click the named square">
          Find <span className="ct-coord">{target}</span>
        </Prompt>
      </div>
      <CoordBoard orientation={orientation} onPick={running ? pick : () => {}} flash={flash} interactive={running} showCoords={showCoords} />
    </div>
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

  // Keep the move to play in view as the game advances (scroll the list, not the page).
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
    <div className="ct-replay">
      {/* Move list on the left — its own scroll area, so long games don't make
          you scroll the whole page, and it never drops out of view. */}
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

      <aside className="ct-replay-side">
        <div className="ps-block">
          <div className="ps-h">Game</div>
          <select className="ct-game-select" value={gameIdx} onChange={(e) => setGameIdx(Number(e.target.value))}>
            {FAMOUS_GAMES.map((g, i) => (
              <option key={g.id} value={i}>{g.title}{g.year ? ` · ${g.year}` : ''}</option>
            ))}
          </select>
          <div className="ct-game-players">{game.white} – {game.black}</div>
          <p className="ct-game-context">{game.context}</p>
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
      </aside>
    </div>
  );
}
