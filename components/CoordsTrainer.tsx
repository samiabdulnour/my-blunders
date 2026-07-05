'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { FAMOUS_GAMES } from '@/lib/famous-games';

/**
 * Coordinate / board-vision trainer (Lichess-style), three modes:
 *  · Find the square — a coordinate is named; click it on a piece-less board.
 *  · Square colour   — a coordinate is named; say if it's light or dark.
 *  · Play famous games — replay canonical games move-by-move for both sides.
 *
 * Uses the same .side + .main > .board-col > .board-row + .result-slot
 * layout as Puzzle mode so the board sits in exactly the same place.
 */

type SubMode = 'find' | 'color' | 'replay';

const FILES = 'abcdefgh';

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

/** Shared left sidebar using the same .side class as Puzzle mode. */
function CoordsPanel({ sub, onChangeSub, children }: {
  sub: SubMode;
  onChangeSub: (s: SubMode) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="side">
      <div className="side-block">
        <div className="side-h">Coordinates</div>
        <div className="ct-mode-list">
          <button type="button" className={'ct-nav-btn' + (sub === 'find' ? ' on' : '')} onClick={() => onChangeSub('find')}>Find the square</button>
          <button type="button" className={'ct-nav-btn' + (sub === 'color' ? ' on' : '')} onClick={() => onChangeSub('color')}>Square colour</button>
          <button type="button" className={'ct-nav-btn' + (sub === 'replay' ? ' on' : '')} onClick={() => onChangeSub('replay')}>Play famous games</button>
        </div>
      </div>
      {children}
    </div>
  );
}

export function CoordsTrainer() {
  const [sub, setSub] = useState<SubMode>('find');
  return sub === 'find' ? <FindMode sub={sub} onChangeSub={setSub} />
       : sub === 'color' ? <ColorMode sub={sub} onChangeSub={setSub} />
       : <ReplayMode sub={sub} onChangeSub={setSub} />;
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
      <CoordsPanel sub={sub} onChangeSub={onChangeSub}>
        <div className="side-block">
          <div className="side-h">Session</div>
          <div className="ct-session-row">
            <button type="button" className="ct-action-sm" onClick={running ? finish : begin}>
              {running ? 'Finish' : over ? 'Go again' : 'Start'}
            </button>
            <div className="ct-inline-stats">
              <span className="ct-stat"><b>{mmss(elapsed)}</b> time</span>
              <span className="ct-stat"><b>{correct}</b> done</span>
            </div>
          </div>
          {over && (
            <p className="ct-session-result">
              <b>{correct}</b> correct in {mmss(elapsed)}{wrong > 0 ? ` · ${wrong} missed` : ''}
            </p>
          )}
        </div>
        <div className="side-block">
          <div className="side-h">Board</div>
          <div className="ct-persp-row">
            <span className="ct-persp-txt">From <b>{orientation === 'white' ? 'White' : 'Black'}</b>&apos;s side</span>
            <button type="button" className="ct-flip-sm" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>Flip</button>
          </div>
          <label className="ct-toggle">
            <input type="checkbox" checked={showCoords} onChange={(e) => setShowCoords(e.target.checked)} />
            Show coords
          </label>
        </div>
      </CoordsPanel>

      <div className="main">
        <div className="board-col">
          <div className="board-row">
            <CoordBoard orientation={orientation} onPick={running ? pick : () => {}} flash={flash} interactive={running} showCoords={showCoords} />
            <div className="result-slot">
              <div className="pre-result">
                <div className="verdict idle">
                  <div className="verdict-ico">{running ? '→' : '?'}</div>
                  <div>
                    {running ? (
                      <>
                        <div className="verdict-title">Find <span className="ct-coord-inline">{target}</span></div>
                        <div className="verdict-sub">Click the square on the board.</div>
                      </>
                    ) : over ? (
                      <>
                        <div className="verdict-title">Session done</div>
                        <div className="verdict-sub">{correct} correct · {wrong} missed</div>
                      </>
                    ) : (
                      <>
                        <div className="verdict-title">Find the square</div>
                        <div className="verdict-sub">A coordinate is shown — click it on the board.</div>
                      </>
                    )}
                  </div>
                </div>
                {!running && (
                  <div className="btn-row">
                    <button className="btn" onClick={begin}>{over ? 'Go again' : 'Start'}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
      <CoordsPanel sub={sub} onChangeSub={onChangeSub}>
        <div className="side-block">
          <div className="side-h">Session</div>
          <div className="ct-session-row">
            <button type="button" className="ct-action-sm" onClick={running ? finish : begin}>
              {running ? 'Finish' : over ? 'Go again' : 'Start'}
            </button>
            <div className="ct-inline-stats">
              <span className="ct-stat"><b>{mmss(elapsed)}</b> time</span>
              <span className="ct-stat"><b>{correct}</b> done</span>
            </div>
          </div>
          {over && (
            <p className="ct-session-result">
              <b>{correct}</b> correct in {mmss(elapsed)}{wrong > 0 ? ` · ${wrong} missed` : ''}
            </p>
          )}
        </div>
      </CoordsPanel>

      <div className="main">
        <div className="board-col">
          <div className="board-row">
            <div className="ct-color-area">
              <div className={'ct-coord-big' + (fb === 'ok' ? ' ok' : fb === 'fail' ? ' fail' : '')}>
                {running ? target : <span className="ct-coord-ghost">e4</span>}
              </div>
              {fb === 'fail' && (
                <div className="ct-color-hint">{target} is {isLight(target) ? 'light' : 'dark'}</div>
              )}
              <div className="ct-color-btns">
                <button type="button" className="ct-color-btn light" onClick={() => answer(true)} disabled={!running}>Light</button>
                <button type="button" className="ct-color-btn dark" onClick={() => answer(false)} disabled={!running}>Dark</button>
              </div>
            </div>
            <div className="result-slot">
              <div className="pre-result">
                <div className="verdict idle">
                  <div className="verdict-ico">{running ? (fb === 'ok' ? '✓' : fb === 'fail' ? '✗' : '?') : '?'}</div>
                  <div>
                    {running && fb === 'fail' ? (
                      <>
                        <div className="verdict-title">Not quite</div>
                        <div className="verdict-sub">{target} is {isLight(target) ? 'light' : 'dark'}.</div>
                      </>
                    ) : running ? (
                      <>
                        <div className="verdict-title">Light or dark?</div>
                        <div className="verdict-sub">Pick the colour of the named square.</div>
                      </>
                    ) : over ? (
                      <>
                        <div className="verdict-title">Session done</div>
                        <div className="verdict-sub">{correct} correct · {wrong} missed</div>
                      </>
                    ) : (
                      <>
                        <div className="verdict-title">Square colour</div>
                        <div className="verdict-sub">Is the named square light or dark?</div>
                      </>
                    )}
                  </div>
                </div>
                {!running && (
                  <div className="btn-row">
                    <button className="btn" onClick={begin}>{over ? 'Go again' : 'Start'}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
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
      <CoordsPanel sub={sub} onChangeSub={onChangeSub}>
        <div className="side-block">
          <div className="side-h">Game</div>
          <select className="ct-game-select" value={gameIdx} onChange={(e) => setGameIdx(Number(e.target.value))}>
            {FAMOUS_GAMES.map((g, i) => (
              <option key={g.id} value={i}>{g.title}{g.year ? ` · ${g.year}` : ''}</option>
            ))}
          </select>
          <div className="ct-game-players">{game.white} – {game.black}</div>
          <p className="ct-game-context">{game.context}</p>
        </div>
        <div className="side-block">
          <div className="side-h">Controls</div>
          <div className="ct-controls">
            <button type="button" className="ps-btn" onClick={showMove} disabled={done}>Show move</button>
            <button type="button" className="ps-btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>Flip board</button>
            <button type="button" className="ps-btn" onClick={restart} disabled={ply === 0}>Restart</button>
          </div>
        </div>
      </CoordsPanel>

      <div className="main">
        <div className="board-col">
          <div className="board-row">
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
            <div className="result-slot">
              <div className="pre-result">
                <div className="verdict idle">
                  <div className="verdict-ico">{done ? '♚' : sideToMove === 'w' ? '○' : '●'}</div>
                  <div>
                    <div className="verdict-title">
                      {done ? 'Game complete' : `${sideToMove === 'w' ? 'White' : 'Black'} to move`}
                    </div>
                    <div className="verdict-sub">
                      {done ? `Result: ${game.result}` : wrong ? "That wasn't it — try again." : 'Play the game’s next move.'}
                    </div>
                  </div>
                </div>
                <div className="ct-moves-block">
                  <div className="ct-moves-h">Moves · {Math.ceil(moves.length / 2)}</div>
                  <ol className="ct-moves" ref={movesRef}>
                    {rows.map((r) => (
                      <li className="ps-move-row" key={r.n}>
                        <span className="ps-move-no num">{r.n}.</span>
                        <span className={'ct-ply' + (r.wPly < ply ? ' done' : '') + (r.wPly === ply ? ' next' : '')}>{r.w}</span>
                        <span className={'ct-ply' + (r.b ? (r.bPly < ply ? ' done' : '') + (r.bPly === ply ? ' next' : '') : '')}>{r.b ?? ''}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
