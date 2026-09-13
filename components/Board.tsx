'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chess, Move } from 'chess.js';
import { Piece } from './Piece';
import { play as playCue } from '@/lib/sound';

interface BoardProps {
  chess: Chess;
  /** From whose perspective to render. */
  orientation: 'white' | 'black';
  /** Currently selected source square, if any. */
  selected: string | null;
  /** Legal moves grouped by `from` square. */
  legalFrom: Record<string, Move[]>;
  /** Square highlighted as "last move from". */
  lastFrom: string | null;
  /** Square highlighted as "last move to". */
  lastTo: string | null;
  /** Square persistently painted green (user's correct move or revealed best move). */
  flashOk: string | null;
  /** Square persistently painted red (user's wrong move). */
  flashFail: string | null;
  /** Rewind a wrong move: the piece now on `.from` came back from `.to`. */
  bounceBack: { from: string; to: string } | null;
  /** Replay a move the board can't infer — the puzzle-load intro, where the
   *  position jumps by several plies and the opponent's last move should still
   *  be shown arriving. Ignored when the piece was already carried across
   *  (then it's gliding under its own steam). */
  introMove: { from: string; to: string } | null;
  /** If true, input is disabled (puzzle already answered, or the board
   *  is mid-bounce from a wrong move). */
  revealed: boolean;
  /** Click handler. */
  onSquareClick: (square: string) => void;
  /** Drag handler. Receives the legal Move to apply. */
  onDragMove: (move: Move) => void;
}

/** Pixels of pointer movement before a press becomes a drag. Below the
 *  threshold the gesture is still a tap, so a quick press selects a piece
 *  without accidentally dragging it. */
const DRAG_THRESHOLD_PX = 5;

/** How far a press may wander and still count as a tap. Deliberately looser
 *  than the drag threshold: a thumb rolls several pixels on even a decisive
 *  tap, and swallowing those is what makes a board feel like it ignores you. */
const TAP_SLOP_PX = 12;

/** Duration of a piece's travel. Keep in sync with `--move-anim` in
 *  globals.css; CSS owns the real timing, this is the fallback that clears
 *  leftover animation state if `animationend` never arrives. */
export const MOVE_ANIM_MS = 200;

type Board2D = ReturnType<Chess['board']>;

/** Half-move index of a position, read off the FEN. The board is handed a
 *  position, not a history, so this is how it tells "one move was just played"
 *  apart from "the board jumped somewhere else entirely". */
function plyOf(fen: string): number {
  const [, turn, , , , fullmove] = fen.split(' ');
  const full = parseInt(fullmove, 10);
  return ((Number.isNaN(full) ? 1 : full) - 1) * 2 + (turn === 'b' ? 1 : 0);
}

const fileOf = (sq: string) => sq.charCodeAt(0) - 97;
const sqName = (row: number, col: number) =>
  String.fromCharCode(97 + col) + (8 - row);

/** Which element belongs to which piece.
 *
 *  `ids` maps a square to the DOM element standing on it. Keeping that mapping
 *  stable across a move is the whole point: React then updates one element's
 *  coordinates instead of destroying it on one square and building it again on
 *  another, and the browser can animate it without first laying out, painting
 *  and compositing a brand-new image. */
interface PieceIds {
  fen: string;
  ply: number;
  /** square → element id */
  ids: Record<string, string>;
  /** ids that changed square in this step, and so should travel rather than
   *  simply appear. */
  moved: Record<string, true>;
  /** What the step was, for the sound. `none` covers every jump — a new game,
   *  a take-back, scrubbing a list — which should be silent as well as still.
   *  A rewound wrong move is silent too: the buzz already said it. */
  kind: 'none' | 'move' | 'capture' | 'castle';
  seq: number;
}

const EMPTY_IDS: PieceIds = { fen: '', ply: -1, ids: {}, moved: {}, kind: 'none', seq: 0 };

/**
 * Carry element ids from one position to the next.
 *
 * Only two things move an id between squares: a single half-move forward
 * (with the rook brought along on a castle), and a bounce-back rewinding one.
 * Everything else — a new game, a take-back, scrubbing a move list, loading a
 * puzzle — leaves ids attached to their own square, so pieces that ended up
 * somewhere else get fresh elements and simply appear there. That is what
 * keeps a jump from animating like a move.
 */
function carryIds(
  prev: PieceIds,
  board: Board2D,
  fen: string,
  lastFrom: string | null,
  lastTo: string | null,
  bounceBack: { from: string; to: string } | null
): PieceIds {
  const ply = plyOf(fen);
  const carried: Record<string, string> = { ...prev.ids };
  const crossed: Record<string, string> = {}; // id → square it came from
  let kind: PieceIds['kind'] = 'none';

  const hop = (from: string, to: string) => {
    const id = carried[from];
    if (!id) return;
    delete carried[from];
    carried[to] = id;
    crossed[id] = from;
  };

  if (bounceBack && carried[bounceBack.to]) {
    // The position rewound: walk the piece back the way it came.
    hop(bounceBack.to, bounceBack.from);
  } else if (ply === prev.ply + 1 && lastFrom && lastTo && carried[lastFrom]) {
    hop(lastFrom, lastTo);
    kind = 'move';
    // A castling king drags its rook along; nothing else in the move tells us
    // the rook moved, since `lastFrom`/`lastTo` only describe the king.
    const landed = board[8 - Number(lastTo[1])]?.[fileOf(lastTo)];
    if (landed?.type === 'k' && Math.abs(fileOf(lastTo) - fileOf(lastFrom)) === 2) {
      const rank = lastTo[1];
      const kingside = fileOf(lastTo) === 6;
      hop((kingside ? 'h' : 'a') + rank, (kingside ? 'f' : 'd') + rank);
      kind = 'castle';
    }
  }

  // Walk the new position and settle every occupied square on an id. Squares
  // that emptied drop out here, which is how a captured piece's element goes
  // away; ids carried onto an occupied square simply outrank whatever stood
  // there, which is the capture itself.
  const ids: Record<string, string> = {};
  const moved: Record<string, true> = {};
  let seq = prev.seq;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (!board[row][col]) continue;
      const sq = sqName(row, col);
      const id = carried[sq] ?? `p${++seq}`;
      ids[sq] = id;
      if (crossed[id] !== undefined && crossed[id] !== sq) moved[id] = true;
    }
  }
  // A piece fewer than before means one was taken — including en passant,
  // where the pawn that disappears is on neither of the move's squares.
  if (kind === 'move' && Object.keys(ids).length < Object.keys(prev.ids).length) {
    kind = 'capture';
  }
  return { fen, ply, ids, moved, kind, seq };
}

/** A press in flight. Everything here is sampled on every pointer event, so it
 *  lives in a ref — only the few fields that actually change what's painted
 *  are mirrored into React state. */
interface PressState {
  pointerId: number;
  /** Square the gesture started on — the tap target if it never becomes a drag. */
  from: string;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  /** Board rect captured at pointerdown, so locating the square under the
   *  pointer is pure arithmetic: no `elementFromPoint`, no layout read per
   *  sample, and no dependence on what happens to be painted on top. */
  rect: DOMRect;
  /** The press landed on a piece this side may move, so it can become a drag. */
  draggable: boolean;
  /** Past the drag threshold — this gesture is a drag, not a tap. */
  active: boolean;
  /** Square currently under the pointer (drives the drop-target ring). */
  over: string | null;
  /** The piece element being dragged. Its offset is written straight to the
   *  DOM: re-rendering the board on every pointer sample is what makes a drag
   *  stutter. */
  node: HTMLElement | null;
  /** Pending animation-frame handle for that write. */
  raf: number;
}

/** The parts of a drag that have to be painted by React. Updated only when one
 *  of them actually changes, which is a handful of renders per drag instead of
 *  one per pointer sample. */
interface DragView {
  from: string;
  over: string | null;
  active: boolean;
}

/** One square: its colour and whatever rings, dots or flashes it is wearing.
 *  Pieces live in a layer of their own above these, so a move never touches a
 *  square's markup. Memoized on primitives, so the two squares a move
 *  highlights are the only ones that re-render. */
const Square = memo(function Square({
  sqn,
  cls,
  showDot,
}: {
  sqn: string;
  cls: string;
  showDot: boolean;
}) {
  return (
    <div className={cls} data-sq={sqn}>
      {showDot && <div className="sq-dot-hint" />}
    </div>
  );
});

/** One piece, positioned by board coordinates rather than by DOM parentage.
 *
 *  `--x`/`--y` are the square it stands on; CSS turns those into a transform
 *  and transitions between them, so a move is a single animated property
 *  change on an element that never leaves the document. `--dx`/`--dy` are the
 *  drag offset, written imperatively — kept separate precisely so the pointer
 *  handlers and React can each own part of the same transform without
 *  overwriting one another. */
const PieceEl = memo(function PieceEl({
  sq,
  pc,
  x,
  y,
  cls,
  bx,
  by,
  onAnimEnd,
}: {
  sq: string;
  pc: string;
  x: number;
  y: number;
  cls: string;
  bx: number | null;
  by: number | null;
  onAnimEnd: (() => void) | undefined;
}) {
  const style: React.CSSProperties = { '--x': `${x}`, '--y': `${y}` } as React.CSSProperties;
  if (bx !== null) {
    (style as Record<string, string>)['--bx'] = `${bx}`;
    (style as Record<string, string>)['--by'] = `${by}`;
  }
  return (
    <div className={cls} style={style} data-pc={sq} onAnimationEnd={onAnimEnd}>
      <Piece color={pc[0] as 'w' | 'b'} type={pc[1] as 'p' | 'n' | 'b' | 'r' | 'q' | 'k'} />
    </div>
  );
});

/**
 * 8x8 board, tap-to-move AND drag-to-move through one Pointer Events
 * pipeline — mouse, touch, and pen all take the same path, and no HTML5
 * DnD, so mobile Safari behaves like desktop.
 *
 * Both gestures resolve on `pointerup`, never on `click`. That matters on
 * iOS: a synthesized click arrives later than the release that caused it,
 * and WebKit drops it entirely if the finger rolled a few pixels or the
 * press and release landed on different elements — which is exactly the
 * "I tapped the square and nothing happened" feel. Reading the release
 * directly makes a tap land the moment the finger lifts.
 *
 * Pieces are not children of their squares. They sit in one layer above the
 * board, each holding its own coordinates, because a piece that stays in the
 * document can start moving on the very next frame — whereas one rebuilt on
 * its destination square has to be laid out, painted and composited first,
 * and stands still for about three frames while that happens.
 */
export function Board({
  chess,
  orientation,
  selected,
  legalFrom,
  lastFrom,
  lastTo,
  flashOk,
  flashFail,
  bounceBack,
  introMove,
  revealed,
  onSquareClick,
  onDragMove,
}: BoardProps) {
  const flipped = orientation === 'black';
  const fen = chess.fen();
  const pos = useMemo(() => chess.board(), [chess]);
  const myColor = chess.turn();

  const gridRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<PressState | null>(null);
  const [dragView, setDragView] = useState<DragView | null>(null);

  // Element identity, recomputed once per position. Guarded on the FEN so a
  // repeated render (or React's development double-render) is a no-op.
  const idsRef = useRef<PieceIds>(EMPTY_IDS);
  if (idsRef.current.fen !== fen) {
    idsRef.current = carryIds(idsRef.current, pos, fen, lastFrom, lastTo, bounceBack);
  }
  const { ids, moved } = idsRef.current;

  // Sound. The board already knows what just happened — which piece travelled,
  // whether one came off, whether it was a castle — so the cue is derived here
  // rather than wired through every caller, and engine replies and replays are
  // audible for free.
  useEffect(() => {
    const { kind } = idsRef.current;
    if (kind === 'none') return;
    // Deferred past the next paint on purpose. Working out *which* cue this is
    // means asking chess.js whether the game is over, and that generates every
    // legal move — tens of milliseconds on a phone. Run inline it lands
    // squarely between the move committing and the piece starting to travel,
    // and the animation visibly hesitates. A cue one frame late is inaudible;
    // a move that stutters is not.
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (chess.isGameOver()) playCue('end');
        else if (chess.inCheck()) playCue('check');
        else playCue(kind);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
    // Keyed on the position: one cue per move, whatever else re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  // A wrong answer, in every mode that has one.
  useEffect(() => {
    if (flashFail) playCue('wrong');
  }, [flashFail]);

  /** Keyframe replay for a move the board couldn't carry an element through —
   *  currently just the puzzle-load intro, which jumps several plies at once. */
  const [replay, setReplay] = useState<{ to: string; dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (!replay) return;
    const t = setTimeout(() => setReplay(null), MOVE_ANIM_MS + 60);
    return () => clearTimeout(t);
  }, [replay]);
  const clearReplay = useCallback(() => setReplay(null), []);

  const hintSource = dragView?.from ?? selected;
  const legalTargets = useMemo(() => {
    if (!hintSource) return new Set<string>();
    return new Set((legalFrom[hintSource] ?? []).map((m) => m.to));
  }, [hintSource, legalFrom]);

  /** Board coordinates of a square, from the viewer's side. */
  const visual = useCallback(
    (sqn: string) => {
      const col = fileOf(sqn);
      const row = 8 - Number(sqn[1]);
      return { vc: flipped ? 7 - col : col, vr: flipped ? 7 - row : row };
    },
    [flipped]
  );

  // A replayed move is only meaningful while its destination holds a piece
  // that did NOT travel there on its own. Recomputed whenever the intro
  // changes; carried pieces glide instead and need no keyframe.
  const introKey = introMove ? `${introMove.from}${introMove.to}` : '';
  useEffect(() => {
    if (!introMove) {
      setReplay(null);
      return;
    }
    const id = idsRef.current.ids[introMove.to];
    if (!id || idsRef.current.moved[id]) {
      setReplay(null);
      return;
    }
    const f = visual(introMove.from);
    const t = visual(introMove.to);
    setReplay({ to: introMove.to, dx: f.vc - t.vc, dy: f.vr - t.vr });
    // `introKey` stands in for introMove so a re-render with an equal object
    // doesn't restart the keyframe mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey, fen, visual]);

  const ranks = [];
  for (let r = 0; r < 8; r++) ranks.push(flipped ? r + 1 : 8 - r);
  const files = flipped
    ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']
    : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  /** Square under a client point, from the board rect alone. Returns null
   *  outside the board (a release there cancels the gesture). */
  const squareFromPoint = useCallback(
    (clientX: number, clientY: number, rect: DOMRect): string | null => {
      if (
        clientX < rect.left ||
        clientX >= rect.right ||
        clientY < rect.top ||
        clientY >= rect.bottom
      ) {
        return null;
      }
      const vc = Math.min(7, Math.floor(((clientX - rect.left) / rect.width) * 8));
      const vr = Math.min(7, Math.floor(((clientY - rect.top) / rect.height) * 8));
      const bc = flipped ? 7 - vc : vc;
      const br = flipped ? 7 - vr : vr;
      return String.fromCharCode(97 + bc) + (8 - br);
    },
    [flipped]
  );

  /** Write the dragged piece's offset for this frame. Imperative on purpose —
   *  this runs at pointer rate and must not go through React. It touches only
   *  `--dx`/`--dy`, which React never sets, so the two can't fight. */
  const paintDrag = useCallback(() => {
    const p = pressRef.current;
    if (!p) return;
    p.raf = 0;
    if (!p.node || !p.active) return;
    p.node.style.setProperty('--dx', `${p.curX - p.startX}px`);
    p.node.style.setProperty('--dy', `${p.curY - p.startY}px`);
  }, []);

  /** Tear down a press: cancel any pending frame and hand the piece back to
   *  its coordinates. The offset has to be cleared by hand — React never set
   *  it, so React won't remove it either. */
  const endPress = useCallback(() => {
    const p = pressRef.current;
    pressRef.current = null;
    if (!p) return;
    if (p.raf) cancelAnimationFrame(p.raf);
    if (p.node) {
      p.node.style.removeProperty('--dx');
      p.node.style.removeProperty('--dy');
    }
    setDragView(null);
  }, []);

  // Unmounting mid-drag (puzzle swapped, mode changed) must not leave a
  // scheduled frame behind.
  useEffect(() => () => endPress(), [endPress]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const sqn = squareFromPoint(e.clientX, e.clientY, rect);
    if (!sqn) return;

    // A press already in flight (second finger) is abandoned rather than
    // interleaved — two fingers on a chessboard is never a real move.
    if (pressRef.current) endPress();

    const piece = pos[8 - Number(sqn[1])][fileOf(sqn)];
    const draggable = !revealed && piece !== null && piece.color === myColor;

    // Note: we deliberately do NOT call e.preventDefault() here — on touch it
    // suppresses the events we still want. Page-scroll suppression is handled
    // by `touch-action` in globals.css instead.

    if (draggable) {
      // Capture so the rest of the gesture keeps firing on the grid even once
      // the finger leaves it, which removes the need for document listeners.
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        /* Some browsers reject capture on an already-captured pointer. */
      }
    }

    pressRef.current = {
      pointerId: e.pointerId,
      from: sqn,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      rect,
      draggable,
      active: false,
      over: sqn,
      node: draggable
        ? grid.querySelector<HTMLElement>(`[data-pc="${sqn}"]`)
        : null,
      raf: 0,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    p.curX = e.clientX;
    p.curY = e.clientY;
    if (!p.draggable) return;

    const wasActive = p.active;
    if (!p.active && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > DRAG_THRESHOLD_PX) {
      p.active = true;
    }
    if (!p.active) return;

    const over = squareFromPoint(e.clientX, e.clientY, p.rect);
    const overChanged = over !== p.over;
    p.over = over;
    // React only hears about the drag when something it paints changed —
    // the piece itself follows the pointer through `paintDrag`.
    if (!wasActive || overChanged) {
      setDragView({ from: p.from, over, active: true });
    }
    if (!p.raf) p.raf = requestAnimationFrame(paintDrag);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    p.curX = e.clientX;
    p.curY = e.clientY;
    endPress();

    if (p.active) {
      const target = squareFromPoint(e.clientX, e.clientY, p.rect);
      // Let the piece settle back if it left the board or landed somewhere
      // illegal — dropping the offset above already sends it home.
      if (!target) return;
      if (target !== p.from) {
        const cands = (legalFrom[p.from] ?? []).filter((m) => m.to === target);
        if (cands.length === 0) return;
        onDragMove(cands.find((m) => m.promotion === 'q') ?? cands[0]);
        return;
      }
      // Picked the piece up and set it down again. Almost always this is a
      // tap whose thumb rolled a few pixels on the way up — the drag
      // threshold has to be small to feel responsive, which means decisive
      // taps cross it all the time. Falling through to the tap below is what
      // keeps those presses from vanishing.
    }

    // A tap. Resolved here rather than waiting for the synthesized click,
    // which is both later and, on iOS, easily lost.
    if (!p.active && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > TAP_SLOP_PX) {
      return;
    }
    onSquareClick(p.from);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    endPress();
  };

  /* ── Squares ── */
  const cells: React.ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const br = flipped ? 7 - row : row;
      const bc = flipped ? 7 - col : col;
      const sqn = sqName(br, bc);
      const piece = pos[br][bc];

      const classes = ['sq', (br + bc) % 2 === 0 ? 'sq-l' : 'sq-d'];
      if (sqn === lastFrom || sqn === lastTo) classes.push('lm');
      if (sqn === selected || sqn === dragView?.from) classes.push('sel');
      if (!revealed && piece && legalTargets.has(sqn)) classes.push('cap-ring');
      // Drop-target ring follows the dragged piece so the user can see
      // where it would land.
      if (
        dragView?.active &&
        dragView.over === sqn &&
        sqn !== dragView.from &&
        legalTargets.has(sqn)
      ) {
        classes.push('drop-target');
      }
      if (sqn === flashOk) classes.push('flash-ok');
      if (sqn === flashFail) classes.push('flash-fail');

      cells.push(
        <Square
          key={sqn}
          sqn={sqn}
          cls={classes.join(' ')}
          showDot={!revealed && !piece && legalTargets.has(sqn)}
        />
      );
    }
  }

  /* ── Pieces ──
     Emitted in id order so the DOM order of the layer stays put as pieces move
     around; React then only ever updates attributes, never reshuffles nodes. */
  const pieces: React.ReactNode[] = [];
  const entries: { sq: string; id: string }[] = [];
  for (const sq of Object.keys(ids)) entries.push({ sq, id: ids[sq] });
  entries.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const { sq, id } of entries) {
    const piece = pos[8 - Number(sq[1])][fileOf(sq)];
    if (!piece) continue;
    const { vc, vr } = visual(sq);
    const isDragging = dragView?.active === true && dragView.from === sq;
    const isReplaying = replay !== null && replay.to === sq && !moved[id];
    let cls = 'pc';
    if (isDragging) cls += ' dragging';
    else if (isReplaying) cls += ' replaying';
    pieces.push(
      <PieceEl
        key={id}
        sq={sq}
        pc={piece.color + piece.type}
        x={vc}
        y={vr}
        cls={cls}
        bx={isReplaying ? replay.dx : null}
        by={isReplaying ? replay.dy : null}
        onAnimEnd={isReplaying ? clearReplay : undefined}
      />
    );
  }

  return (
    <div className="bwrap">
      <div className="ranks">
        {ranks.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="bcol">
        <div
          className="board-grid"
          ref={gridRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {cells}
          <div className="piece-layer">{pieces}</div>
        </div>
        <div className="files">
          {files.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
