'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { BoardControlsSlot, BoardTopSlot, useRegisterBoardNav, useRegisterBoardExtras } from '@/lib/board-nav';
import { FAMOUS_GAMES } from '@/lib/famous-games';
import { figurine } from '@/lib/figurine';

/**
 * Coordinate / board-vision trainer (Lichess-style), three modes:
 *  · Find the square — a coordinate is named above the board; click it.
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

/** Shared left sidebar using the same .side class as Puzzle mode. The mode
 *  switcher now lives in the board-control bracket, so this is just a frame for
 *  each mode's own controls. */
function CoordsPanel({ children }: {
  sub: SubMode;
  onChangeSub: (s: SubMode) => void;
  children?: React.ReactNode;
}) {
  return <div className="side">{children}</div>;
}

export function CoordsTrainer({ coords = false }: { coords?: boolean }) {
  const [sub, setSub] = useState<SubMode>('find');
  // The three modes live in the board-control bracket as a button block (like
  // the arrows), so they're reachable in every sub-mode without the sidebar.
  useRegisterBoardExtras(
    <div className="bc-modes">
      <button type="button" className={'bc-mode-btn' + (sub === 'find' ? ' on' : '')} onClick={() => setSub('find')}>Find</button>
      <button type="button" className={'bc-mode-btn' + (sub === 'color' ? ' on' : '')} onClick={() => setSub('color')}>Colour</button>
      <button type="button" className={'bc-mode-btn' + (sub === 'replay' ? ' on' : '')} onClick={() => setSub('replay')}>Games</button>
    </div>,
    [sub],
  );
  return sub === 'find' ? <FindMode sub={sub} onChangeSub={setSub} coords={coords} />
       : sub === 'color' ? <ColorMode sub={sub} onChangeSub={setSub} />
       : <ReplayMode sub={sub} onChangeSub={setSub} coords={coords} />;
}

function FindMode({ sub, onChangeSub, coords }: { sub: SubMode; onChangeSub: (s: SubMode) => void; coords: boolean }) {
  const { running, over, elapsed, correct, wrong, setCorrect, setWrong, start, finish } = useSession();
  // A scrolling strip of coordinates with the live target dead-centre. `seq`
  // holds every coordinate generated; `pos` indexes the current target. We show
  // a 5-wide window centred on `pos` — upcoming to the left, already-guessed to
  // the right — and on each hit roll the strip one cell right so the next target
  // slides into the middle while a fresh coordinate rolls in from the left.
  const [seq, setSeq] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [flash, setFlash] = useState<{ sq: string; ok: boolean } | null>(null);
  const nextAfter = (prev: string) => { let s = randomSquare(); while (s === prev) s = randomSquare(); return s; };

  const begin = () => {
    const s: string[] = [];
    while (s.length < 7) s.push(nextAfter(s[s.length - 1] ?? ''));
    setSeq(s); setPos(0); setFlash(null); setRolling(false); start();
  };
  const pick = (sq: string) => {
    if (!running || flash || rolling) return;
    if (sq === seq[pos]) {
      setCorrect((s) => s + 1);
      setFlash({ sq, ok: true });
      setRolling(true); // slide the strip one cell right
      window.setTimeout(() => {
        setFlash(null);
        setRolling(false);
        setSeq((s) => [...s, nextAfter(s[s.length - 1])]);
        setPos((p) => p + 1);
      }, 320);
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
          <div className="side-h">Board</div>
          <div className="ct-controls">
            <button
              type="button"
              className="ps-btn"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            >
              Flip — from {orientation === 'white' ? "White" : "Black"}&apos;s side
            </button>
          </div>
        </div>
      </CoordsPanel>

      <div className="main">
        <div className="board-col">
          <div className="board-row">
            <div className="board-stack">
              {/* Mode switcher (+ menu) portals in here, above the board. */}
              <BoardTopSlot className="ct-switcher-head" />
              <CoordBoard orientation={orientation} onPick={running ? pick : () => {}} flash={flash} interactive={running} showCoords={coords} />
              {/* Row of coordinates under the board with the square to guess dead
                  centre (black); upcoming ones dimmed to its left, guessed ones to
                  its right. Each hit rolls the strip right so the next target slides
                  into the middle and a fresh coord rolls in from the left. Seven
                  cells (5 shown + a buffer each side) make the roll seamless. */}
              {running && (
                <div className="ct-coord-row">
                  <div className={'ct-coord-track' + (rolling ? ' rolling' : '')}>
                    {[3, 2, 1, 0, -1, -2, -3].map((off) => {
                      const c = seq[pos + off];
                      // While the strip rolls, the cell one step to the left is the
                      // one sliding into the centre. Mark it current the instant you
                      // answer, so the next coordinate reads as active immediately
                      // rather than only once the animation lands.
                      const cur = off === (rolling ? 1 : 0);
                      return (
                        <span key={off} className={'ct-coord-cell' + (cur ? ' cur' : '') + (c ? '' : ' blank')}>
                          {c ?? ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="result-slot">
              <div className="pre-result">
                <div className="verdict idle">
                  <div>
                    {running ? (
                      <>
                        <div className="verdict-title">{correct} correct · {wrong} missed</div>
                        <div className="verdict-sub">Tap the square named below the board.</div>
                      </>
                    ) : over ? (
                      <>
                        <div className="verdict-title">Session done</div>
                        <div className="verdict-sub">
                          {correct} correct in {mmss(elapsed)}{wrong > 0 ? ` · ${wrong} missed` : ''}
                        </div>
                      </>
                    ) : (
                      <div className="verdict-title">Find the square</div>
                    )}
                  </div>
                </div>
                {!running && !over && (
                  <p className="ct-mode-note">
                    Knowing every square by name lets you read notation and follow engine
                    analysis without losing your place.
                  </p>
                )}
                <div className="btn-row">
                  {running ? (
                    <button className="btn" onClick={finish}>Finish</button>
                  ) : (
                    <button className="btn prim" onClick={begin}>{over ? 'Go again' : 'Start'}</button>
                  )}
                </div>
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
    if (!running || fb) return; // ignore taps during either feedback flash
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
      <CoordsPanel sub={sub} onChangeSub={onChangeSub} />

      <div className="main">
        <div className="board-col">
          <div className="board-row">
            <div className="ct-color-stack">
              {/* Mode switcher (+ menu) portals in here, above the coordinate. */}
              <BoardTopSlot className="ct-switcher-head" />
              {/* Board-sized white square in the board's position, with the
                  coordinate to guess shown inside it. */}
              <div className="ct-color-square">
                {/* Reserved hint row above the coordinate — a wrong answer fills
                    it in without shifting the coordinate. */}
                <div className="ct-color-hint">
                  {fb === 'fail' ? `${target} is ${isLight(target) ? 'light' : 'dark'}` : ''}
                </div>
                <div className={'ct-coord-big' + (fb === 'ok' ? ' ok' : fb === 'fail' ? ' fail' : '')}>
                  {running ? target : <span className="ct-coord-ghost">e4</span>}
                </div>
              </div>
              <div className="ct-color-btns">
                <button type="button" className="ct-color-btn light" onClick={() => answer(true)} disabled={!running}>Light</button>
                <button type="button" className="ct-color-btn dark" onClick={() => answer(false)} disabled={!running}>Dark</button>
              </div>
            </div>
            <div className="result-slot">
              <div className="pre-result">
                <div className="verdict idle">
                  <div>
                    {running && fb === 'fail' ? (
                      <>
                        <div className="verdict-title">Not quite</div>
                        <div className="verdict-sub">{target} is {isLight(target) ? 'light' : 'dark'}.</div>
                      </>
                    ) : running ? (
                      <>
                        <div className="verdict-title">{correct} correct · {wrong} missed</div>
                        <div className="verdict-sub">Light or dark?</div>
                      </>
                    ) : over ? (
                      <>
                        <div className="verdict-title">Session done</div>
                        <div className="verdict-sub">
                          {correct} correct in {mmss(elapsed)}{wrong > 0 ? ` · ${wrong} missed` : ''}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="verdict-title">Square colour</div>
                        <div className="verdict-sub">Is the named square light or dark?</div>
                      </>
                    )}
                  </div>
                </div>
                {!running && !over && (
                  <p className="ct-mode-note">
                    Spotting square colours at a glance sharpens your feel for bishop
                    endings and pawn structure.
                  </p>
                )}
                <div className="btn-row">
                  {running ? (
                    <button className="btn" onClick={finish}>Finish</button>
                  ) : (
                    <button className="btn prim" onClick={begin}>{over ? 'Go again' : 'Start'}</button>
                  )}
                </div>
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

function ReplayMode({ sub, onChangeSub, coords }: { sub: SubMode; onChangeSub: (s: SubMode) => void; coords: boolean }) {
  const [gameIdx, setGameIdx] = useState(0);
  const game = FAMOUS_GAMES[gameIdx];
  const moves = useMemo(() => game.san.trim().split(/\s+/), [game]);

  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [ply, setPly] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [wrong, setWrong] = useState<{ from: string; to: string } | null>(null);
  /** Piece slide for a replayed move, so it travels rather than reappears. */
  const [travel, setTravel] = useState<{ from: string; to: string } | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  /** "What is this" blurb — collapsible, since you only need it the first time. */
  const [aboutOpen, setAboutOpen] = useState(true);

  useEffect(() => {
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setPly(0); setSelected(null); setLastMove(null); setWrong(null);
  }, [gameIdx]);

  const movesRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const ol = movesRef.current;
    if (!ol) return;
    // At the start of a game the list must show move 1 at the top — otherwise
    // centering the "next" ply scrolls moves 1+ up out of view and the notation
    // looks like it begins mid-game. Only auto-follow once we're underway.
    if (ply === 0) { ol.scrollTop = 0; return; }
    // Keep the active move centred. Measure against the list's own box (not
    // offsetTop, whose offsetParent isn't the <ol> — that made it jump to the
    // very bottom on every move) and nudge only the list's own scroll.
    const active = ol.querySelector<HTMLElement>('.ct-ply.next');
    if (!active) { ol.scrollTop = ol.scrollHeight; return; } // game over → show the end
    const olBox = ol.getBoundingClientRect();
    const aBox = active.getBoundingClientRect();
    ol.scrollTop += (aBox.top - olBox.top) - ol.clientHeight / 2 + aBox.height / 2;
  }, [ply, gameIdx]);

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

  const advance = (mv: Move, fromDrag = false) => {
    setLastMove({ from: mv.from, to: mv.to });
    setFen(chessRef.current.fen());
    setPly((p) => p + 1);
    setSelected(null);
    setWrong(null);
    // A dragged piece is already under the finger; everything else travels.
    if (!fromDrag) {
      setTravel({ from: mv.from, to: mv.to });
      window.setTimeout(() => setTravel(null), 260);
    }
  };

  const tryMove = (m: { from: string; to: string; promotion?: string }, fromDrag = false) => {
    if (done) return;
    const g = chessRef.current;
    let mv: Move | null;
    try { mv = g.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' }); } catch { return; }
    if (!mv) return;
    if (mv.san === expected) {
      advance(mv, fromDrag);
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
    let mv: Move | null = null;
    try { mv = chessRef.current.move(expected); } catch { mv = null; }
    if (mv) advance(mv);
  };

  const undo = () => {
    if (ply === 0) return;
    const targetPly = ply - 1;
    const g = new Chess();
    let lastMv: Move | null = null;
    for (let i = 0; i < targetPly; i++) { try { lastMv = g.move(moves[i]); } catch { break; } }
    const undone = moves[targetPly] ? (() => {
      const probe = new Chess(g.fen());
      try { return probe.move(moves[targetPly]); } catch { return null; }
    })() : null;
    chessRef.current = g;
    setFen(g.fen());
    setLastMove(lastMv ? { from: lastMv.from, to: lastMv.to } : null);
    setPly(targetPly);
    setSelected(null);
    setWrong(null);
    // Rewind: the piece lands back on `from`, having come from `to`.
    if (undone) {
      setTravel({ from: undone.to, to: undone.from });
      window.setTimeout(() => setTravel(null), 260);
    }
  };

  const restart = () => {
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setPly(0); setSelected(null); setLastMove(null); setWrong(null);
  };

  /** Jump to the final position (used by the ▶▶ nav button). */
  const toEnd = () => {
    const g = new Chess();
    let last: Move | null = null;
    for (let i = 0; i < moves.length; i++) { try { last = g.move(moves[i]); } catch { break; } }
    chessRef.current = g;
    setFen(g.fen());
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setPly(moves.length); setSelected(null); setWrong(null);
  };

  // Drive the shared board-control arrows: step through the game move by move
  // (first = restart · prev = undo · next = play next · last = jump to end).
  useRegisterBoardNav(
    { canPrev: ply > 0, canNext: ply < moves.length, first: restart, prev: undo, next: showMove, last: toEnd },
    [ply, moves.length, gameIdx],
  );

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
          {/* Game name + blurb + turn indicator live in the sidebar. */}
          <div className="ct-game-info">
            <div className="ct-game-title">{game.white} – {game.black}</div>
            <p className="ct-game-context">{game.context}</p>
            {/* Only says something when there's something to say — whose turn it
                is is already obvious from the board. */}
            {(done || wrong) && (
              <div className="ct-game-status">
                {done ? `Game over · ${game.result}` : 'Not that move. Try another square.'}
              </div>
            )}
          </div>
        </div>
        <div className="side-block">
          <div className="side-h">Controls</div>
          <div className="ct-controls">
            {/* Step / undo / restart all live in the board arrows now — only the
                board flip has no equivalent there. */}
            <button type="button" className="ps-btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>Flip board</button>
          </div>
        </div>
      </CoordsPanel>

      <div className="main">
        <div className="board-col">
          {/* Games layout, top → bottom: mode switcher · board · arrows · notation. */}
          <div className="board-stack ct-replay-stack">
            <BoardTopSlot className="ct-switcher-head" />
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
              introMove={travel}
              revealed={done}
              onSquareClick={onSquareClick}
              onDragMove={(mv) => tryMove(mv, true)}
              coords={coords}
            />
            <BoardControlsSlot />
            {/* Says what this mode is for, like the note under Find / Colour. */}
            <div className="ct-replay-about">
              {/* Same collapsible-title pattern as the Play move list: title with a
                  trailing chevron, tap to fold the blurb away once you've read it. */}
              <button className="ps-moves-toggle" onClick={() => setAboutOpen((o) => !o)} aria-expanded={aboutOpen}>
                {game.white} vs {game.black}
                <span className="ps-moves-chevron">{aboutOpen ? '▾' : '▸'}</span>
              </button>
              {aboutOpen && (
                <div className="verdict-sub">
                  Step through a famous game with the arrows and read the moves off the notation.
                </div>
              )}
            </div>
            <div className="ct-notation">
              <div className="ct-moves-h">Moves · {Math.ceil(moves.length / 2)}{done ? ` · ${game.result}` : ''}</div>
              <ol className="ct-moves" ref={movesRef}>
                {rows.map((r) => (
                  <li className="ps-move-row" key={r.n}>
                    <span className="ps-move-no num">{r.n}.</span>
                    <span className={'ct-ply' + (r.wPly < ply ? ' done' : '') + (r.wPly === ply ? ' next' : '')}>{figurine(r.w, 'w')}</span>
                    <span className={'ct-ply' + (r.b ? (r.bPly < ply ? ' done' : '') + (r.bPly === ply ? ' next' : '') : '')}>{figurine(r.b ?? '', 'b')}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
