'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Chess, Move } from 'chess.js';
import { Piece } from './Piece';

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
  /** If set, the piece at `.from` gets a CSS bounce-back animation
   *  starting from the `.to` square — used to rewind a wrong move. */
  bounceBack: { from: string; to: string } | null;
  /** If set, the piece at `.to` gets a slide-in animation starting
   *  from `.from` — used on puzzle load to replay the opponent's move
   *  and on the user's correct move / show-solution to animate the
   *  piece forward into place. */
  introMove: { from: string; to: string } | null;
  /** Animate moves without the caller choreographing anything: whenever the
   *  position advances by exactly one half-move, the piece slides from
   *  `lastFrom` to `lastTo`. Jumps of any other size (new game, take-back,
   *  scrubbing a move list, loading a position) are left un-animated, and a
   *  move the user dragged into place is skipped — the piece is already where
   *  they dropped it. Callers that choreograph their own sequences drive
   *  `introMove` instead and leave this off. */
  autoAnimate?: boolean;
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

/** Duration of the piece-slide animation. Keep in sync with `--move-anim`
 *  in globals.css — CSS owns the real timing, this is the fallback used to
 *  clear the animation state if `animationend` never arrives (interrupted
 *  render, backgrounded webview). */
export const MOVE_ANIM_MS = 180;

/** `useLayoutEffect` in the browser, `useEffect` when prerendering (where it
 *  warns and does nothing anyway). Auto-animation has to be decided before
 *  the browser paints: a plain effect would show the piece at its destination
 *  for one frame and only then start sliding it in from the origin. */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Half-move index of a position, read off the FEN. The board is handed a
 *  position, not a history, so this is how it tells "one move was just played"
 *  apart from "the board jumped somewhere else entirely". */
function plyOf(chess: Chess): number {
  const [, turn, , , , fullmove] = chess.fen().split(' ');
  const full = parseInt(fullmove, 10);
  return ((Number.isNaN(full) ? 1 : full) - 1) * 2 + (turn === 'b' ? 1 : 0);
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
  /** The `.piece-wrap` being dragged. Its transform is written straight to the
   *  DOM: re-rendering 64 cells per pointer sample is what makes a drag stutter. */
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
  autoAnimate = false,
  revealed,
  onSquareClick,
  onDragMove,
}: BoardProps) {
  const flipped = orientation === 'black';
  const pos = useMemo(() => chess.board(), [chess]);
  const myColor = chess.turn();

  const gridRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<PressState | null>(null);
  const [dragView, setDragView] = useState<DragView | null>(null);

  /* ── Self-driven move animation (opt-in via `autoAnimate`) ── */
  const [autoMove, setAutoMove] = useState<{ from: string; to: string } | null>(null);
  const prevPlyRef = useRef<number | null>(null);
  /** The move this board just dropped into place, as `fromto`. The piece is
   *  already under the user's finger at the destination, so sliding it in
   *  would mean yanking it back to the origin first. Matched against the move
   *  that actually lands (and cleared on the next press) so a drop the parent
   *  rejects can't swallow a later animation. */
  const droppedRef = useRef<string | null>(null);
  const ply = useMemo(() => plyOf(chess), [chess]);

  useIsomorphicLayoutEffect(() => {
    if (!autoAnimate) return;
    const prev = prevPlyRef.current;
    prevPlyRef.current = ply;
    const dropped = droppedRef.current === `${lastFrom}${lastTo}`;
    droppedRef.current = null;
    if (prev === null || ply !== prev + 1 || dropped || !lastFrom || !lastTo) {
      setAutoMove(null);
      return;
    }
    setAutoMove({ from: lastFrom, to: lastTo });
  }, [autoAnimate, ply, lastFrom, lastTo]);

  // Belt-and-braces clear: `animationend` on the piece normally ends the
  // animation exactly on time, but it never fires if the piece is unmounted
  // mid-slide or the webview was backgrounded.
  useEffect(() => {
    if (!autoMove) return;
    const t = setTimeout(() => setAutoMove(null), MOVE_ANIM_MS + 60);
    return () => clearTimeout(t);
  }, [autoMove]);

  /** The move being animated. An explicit `introMove` from the caller wins —
   *  it's choreographing a sequence and knows better than the ply heuristic. */
  const slideMove = introMove ?? autoMove;

  // During a drag OR a regular selection, both kinds of "source" contribute
  // to the target-hint set. The drag source takes precedence since the user
  // is actively holding a piece.
  const hintSource = dragView?.from ?? selected;
  const legalTargets = useMemo(() => {
    if (!hintSource) return new Set<string>();
    const moves = legalFrom[hintSource] ?? [];
    return new Set(moves.map((m) => m.to));
  }, [hintSource, legalFrom]);

  // Shared visual-coord helper used by both animation paths.
  const visual = useMemo(
    () => (sqn: string) => {
      const col = sqn.charCodeAt(0) - 97;
      const row = 8 - parseInt(sqn[1], 10);
      return {
        vc: flipped ? 7 - col : col,
        vr: flipped ? 7 - row : row,
      };
    },
    [flipped]
  );

  // Bounce-back offset (square units). Piece sits at `from` in the DOM
  // and animates from translate(to-from) back to (0,0).
  const bounceDelta = useMemo(() => {
    if (!bounceBack) return null;
    const f = visual(bounceBack.from);
    const t = visual(bounceBack.to);
    return { dx: t.vc - f.vc, dy: t.vr - f.vr };
  }, [bounceBack, visual]);

  // Slide-in / forward-move offset (square units). Piece sits at `to` in
  // the DOM and animates from translate(from-to) back to (0,0) so it
  // appears to slide in from its origin.
  const slideDelta = useMemo(() => {
    if (!slideMove) return null;
    const f = visual(slideMove.from);
    const t = visual(slideMove.to);
    return { dx: f.vc - t.vc, dy: f.vr - t.vr };
  }, [slideMove, visual]);

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

  /** Write the dragged piece's transform for this frame. Imperative on
   *  purpose — this runs at pointer rate and must not go through React. */
  const paintDrag = useCallback(() => {
    const p = pressRef.current;
    if (!p) return;
    p.raf = 0;
    if (!p.node || !p.active) return;
    p.node.style.transform = `translate3d(${p.curX - p.startX}px, ${
      p.curY - p.startY
    }px, 0) scale(1.08)`;
  }, []);

  /** Tear down a press: cancel any pending frame and put the piece back in
   *  its square. The inline transform has to be cleared by hand — React never
   *  set it, so React won't remove it either, and the node is reused for
   *  whatever piece occupies that square next. */
  const endPress = useCallback(() => {
    const p = pressRef.current;
    pressRef.current = null;
    if (!p) return;
    if (p.raf) cancelAnimationFrame(p.raf);
    if (p.node) p.node.style.transform = '';
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
    droppedRef.current = null;

    const col = sqn.charCodeAt(0) - 97;
    const row = 8 - parseInt(sqn[1], 10);
    const piece = pos[row][col];
    const draggable =
      !revealed && piece !== null && piece.color === myColor;

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
        ? ((e.target as HTMLElement).closest?.('.piece-wrap') as HTMLElement | null)
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
      // Put the piece back if it left the board or landed somewhere illegal.
      if (!target) return;
      if (target !== p.from) {
        const cands = (legalFrom[p.from] ?? []).filter((m) => m.to === target);
        if (cands.length === 0) return;
        const mv = cands.find((m) => m.promotion === 'q') ?? cands[0];
        droppedRef.current = mv.from + mv.to;
        onDragMove(mv);
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

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const br = flipped ? 7 - row : row;
      const bc = flipped ? 7 - col : col;
      const light = (br + bc) % 2 === 0;
      const sqn = String.fromCharCode(97 + bc) + (8 - br);
      const piece = pos[br][bc];

      const classes = ['sq', light ? 'sq-l' : 'sq-d'];
      if (sqn === lastFrom || sqn === lastTo) classes.push('lm');
      if (sqn === selected || sqn === dragView?.from) classes.push('sel');
      if (!revealed && legalTargets.has(sqn)) {
        if (piece) classes.push('cap-ring');
      }
      // Drop-target ring follows the dragged piece so the user can see
      // where it would land.
      if (dragView?.active && dragView.over === sqn && sqn !== dragView.from) {
        if (legalTargets.has(sqn)) classes.push('drop-target');
      }
      // The cell holding the piece being dragged must outrank every other cell.
      // `.sel` (applied to the drag source) and `.drop-target` set z-index:2,
      // making those cells stacking contexts — which traps the dragged piece's
      // z-index inside this cell and lets squares/pieces later in DOM order
      // paint over it. Lifting the whole source cell keeps the piece on top.
      if (dragView?.active && dragView.from === sqn) classes.push('drag-origin');
      if (sqn === flashOk) classes.push('flash-ok');
      if (sqn === flashFail) classes.push('flash-fail');

      const isBouncing =
        bounceBack !== null && sqn === bounceBack.from && piece !== null;
      const isSliding = slideMove !== null && sqn === slideMove.to && piece !== null;
      const isDragActive = dragView?.active === true && dragView.from === sqn && piece !== null;

      // Compose the piece-wrap class + inline CSS vars.
      // Three states share the wrap:
      //   · animating (bounce-back OR slide-in) → CSS keyframe
      //   · drag-active → the wrap floats above the board and its transform
      //     is written imperatively from the pointer handlers, so nothing
      //     transform-related is passed through React here
      //   · drag-source (pre-threshold) → stays put, opacity unchanged
      let wrapClass = 'piece-wrap';
      let wrapStyle: React.CSSProperties | undefined;
      const activeDelta =
        isBouncing && bounceDelta
          ? bounceDelta
          : isSliding && slideDelta
            ? slideDelta
            : null;
      if (activeDelta && !isDragActive) {
        wrapClass += ' animating';
        wrapStyle = {
          '--bx': `${activeDelta.dx}`,
          '--by': `${activeDelta.dy}`,
        } as React.CSSProperties;
      }
      if (isDragActive) wrapClass += ' dragging';

      cells.push(
        <div key={sqn} className={classes.join(' ')} data-sq={sqn}>
          {!revealed && legalTargets.has(sqn) && !piece && (
            <div className="sq-dot-hint" />
          )}
          {piece && (
            <div
              className={wrapClass}
              style={wrapStyle}
              onAnimationEnd={
                isSliding && autoMove ? () => setAutoMove(null) : undefined
              }
            >
              <Piece color={piece.color} type={piece.type} />
            </div>
          )}
        </div>
      );
    }
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
