'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutTree, findByPath, hotspots, weakSpots, lineString, formatEval, type LaidNode, type DrillItem } from '@/lib/opening-tree';
import { figurine } from '@/lib/figurine';
import { useClinic } from '@/lib/clinic-context';
import { fetchTheory, type Theory } from '@/lib/opening-explorer';
import { evalPosition, peekEval, whiteCp, type EngineEval } from '@/lib/opening-engine';
import { OpeningDrill } from '@/components/OpeningDrill';
import { BestLinePopup } from '@/components/BestLinePopup';
import { OpeningBoard, type BoardArrow } from '@/components/repertoire/OpeningBoard';
import { IconWarn } from '@/components/repertoire/icons';
import { BoardTopSlot } from '@/lib/board-nav';
import { isNativeApp } from '@/lib/platform';

/** White-relative eval as a label: "+0.6", "-1.2", "#3". */
function evalText(e: EngineEval): string {
  if (e.mate !== null) return (e.mate > 0 ? '#' : '-#') + Math.abs(e.mate);
  const cp = (e.cp ?? 0) / 100;
  return (cp > 0 ? '+' : '') + cp.toFixed(1);
}

/** White's win probability from a white-relative centipawn eval. A logistic
 *  (Elo-style expected score): cp 0 → .50, +300 → ~.85, −300 → ~.15. This is what
 *  makes the marking precise: an equal centipawn loss means very different things
 *  near a decided position (+6.0→+5.0 is nothing) versus near equality
 *  (+0.5→−0.5 throws the game), and win probability captures that where raw
 *  centipawns can't. */
function winProb(cp: number): number {
  return 1 / (1 + Math.pow(10, -cp / 400));
}

/** Colour a connector by how much the move (parent→child) hurt the side that
 *  played it. The drop in *that side's* win probability, not raw centipawns.
 *  green = held the position, amber = an inaccuracy that let the advantage slip,
 *  red = a mistake/blunder. Neutral when the eval isn't known. Thresholds are in
 *  win-probability points (~Lichess: ≥0.10 inaccuracy, ≥0.20 mistake). */
function edgeStroke(parentFen: string, parentEval: number | null, childEval: number | null): string {
  if (parentEval == null || childEval == null) return 'var(--border2)';
  const whiteToMove = parentFen.split(' ')[1] === 'w';
  const before = whiteToMove ? winProb(parentEval) : 1 - winProb(parentEval);
  const after = whiteToMove ? winProb(childEval) : 1 - winProb(childEval);
  const drop = before - after;
  if (drop >= 0.2) return 'var(--red)';
  if (drop >= 0.1) return 'var(--yellow)';
  return 'var(--green)';
}

/* The tree is drawn like the A1 poster, scaled for a screen: small boards
 * close together, the opening name in a band ABOVE the board, two lines under
 * it (move + eval, then games played), elbow connectors, outline packing, and
 * the move numbers in a gutter down the left. Rows are as tall as their
 * longest name needs, so a name is never cut short; the layout itself only
 * fixes each node's column and depth, and `rowGeometry` turns depths into
 * pixels. */
const TOP_PAD = 10;
const LEFT_PAD = 8;
const SQ = 10; // board square, px
const BOARD = SQ * 8 + 2; // + the 1px frame each side
const CARD_W = 88;
const COL_GAP = 10;
/** Name band: one Label-style line per line of name, plus room for the arrow. */
const NAME_LINE = 12;
const NAME_BAND_PAD = 10;
/** A row with no names keeps just enough band for the arrow to land in. */
const BAND_EMPTY = 10;
/** The two lines under the board: move + eval, then games played. */
const LABEL_H = 38;
/** Label bottom → next row's band; the connectors' bus runs midway. */
const LINK_GAP = 22;
/** Move-number gutter: pinned to the left edge of the pane while you pan. */
const GUTTER = 30;
/** Where a row's move number sits down White's board (as on the poster). */
const MOVE_NO_AT = 0.275;
/** Canvas drawn past each edge of the visible pane, and the step the visible
 *  window moves in — so panning re-renders every few hundred px, not per frame. */
const CULL_MARGIN = 500;
const CULL_STEP = 250;

/** Pixel rows: each depth's top, and its name band's height. */
interface Rows { top: number[]; band: number[]; height: number }

/** The part of an opening's name that is new at this node. Names nest
 *  ("Sicilian Defense: Closed, Traditional"), and the family is already printed
 *  higher up the same line, so a node shows only what its ancestor's name
 *  doesn't say; a different family, or a top-level name, is shown in full. */
function newPart(name: string, above: string): string {
  if (!above) return name;
  const split = (s: string) => s.split(/: |, /);
  const a = split(above);
  const n = split(name);
  let k = 0;
  while (k < a.length && k < n.length - 1 && a[k] === n[k]) k++;
  return k > 0 ? n.slice(k).join(', ') : name;
}

/** Lines a name wraps to in the band (Label style: 11px bold uppercase,
 *  tracked 0.14em) at the card's width. Errs long — a hyphen can also break —
 *  so the band is never shorter than the text. */
function nameLines(text: string, ctx: CanvasRenderingContext2D | null): number {
  if (!text) return 0;
  const words = text.toUpperCase().split(/\s+/);
  const w = (t: string) => (ctx ? ctx.measureText(t).width : t.length * 7.5) + t.length * 11 * 0.14;
  let lines = 0;
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && w(next) <= CARD_W) line = next;
    else {
      // A new line — plus the extra ones a word wider than the card takes
      // where it can break ("SMITH-MORRA" splits at its hyphen; a word with
      // no hyphen stays on its line, a touch wider than the card).
      lines += 1 + (word.includes('-') ? Math.floor(w(word) / CARD_W) : 0);
      line = word;
    }
  }
  return lines;
}

/** Elbow connector, as on the poster: down from the parent to one shared bus
 *  per parent, across to the child's column, down into the child — landing
 *  above the child's name band when it has one, so it never crosses the name. */
function connectorPath(parent: LaidNode, child: LaidNode, rows: Rows): { d: string; tip: [number, number]; box: [number, number, number, number] } {
  const px = LEFT_PAD + parent.x + CARD_W / 2;
  const py = TOP_PAD + rows.top[parent.y] + rows.band[parent.y] + BOARD + LABEL_H;
  const busY = py + LINK_GAP / 2;
  const cx = LEFT_PAD + child.x + CARD_W / 2;
  const cy = TOP_PAD + rows.top[child.y] + (child.name ? 1 : rows.band[child.y] - 2);
  return { d: `M ${px} ${py} V ${busY} H ${cx} V ${cy}`, tip: [cx, cy], box: [Math.min(px, cx), py, Math.max(px, cx), cy] };
}

/**
 * Opening Clinic. The "Opening" mode of the trainer. Turns your imported games
 * into a top-down opening tree (left) and, for the selected position, shows what
 * you play from here and the right continuation from Lichess theory (right).
 * Uses the main app's tokens so it matches the trainer and inherits dark mode.
 */
export function OpeningClinic({ coords = false, evalBar = false }: { coords?: boolean; evalBar?: boolean }) {
  const { ready, fetching, color, focus, setFocus, selectedId, setSelectedId, tree, openings } = useClinic();
  const [drillItems, setDrillItems] = useState<DrillItem[] | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const zoomBy = (d: number) => setZoom((z) => Math.min(1.6, Math.max(0.1, Math.round((z + d) * 10) / 10)));
  // The tree-zoom control is only handy on the web; the native app drops it.
  // Detect after mount so the prerendered HTML and first client render agree
  // (no hydration mismatch), then hide it on device.
  const [nativeApp, setNativeApp] = useState(false);
  useEffect(() => { setNativeApp(isNativeApp()); }, []);
  // The scrolling tree pane + a live mirror of the zoom (so the centering
  // effect can read the current zoom without re-running on every zoom change).
  const treeRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Pending scroll position to apply after a pinch-zoom re-render (useLayoutEffect
  // reads it once the DOM has updated its new scrollable dimensions).
  const pendingScrollRef = useRef<{ x: number; y: number } | null>(null);
  // What view we last auto-centred (colour|focus). Re-centre only when the view
  // changes. Not on every incremental fetch, which would yank the canvas back.
  const centeredKeyRef = useRef<string | null>(null);
  // Set once the user pans or pinches. Until then the auto-centre keeps pulling
  // the canvas back to the root as the tree fills in — the tree loads async, so
  // a single centre on mount would land on a half-built (or empty) layout and
  // leave you looking at the wrong place when you open the tab.
  const userMovedRef = useRef(false);

  // After a pinch-zoom re-render, apply the stored scroll position so the pinch
  // midpoint stays anchored in place (canvas dimensions have updated by now).
  useLayoutEffect(() => {
    const el = treeRef.current;
    if (!el || !pendingScrollRef.current) return;
    el.scrollLeft = Math.max(0, pendingScrollRef.current.x);
    el.scrollTop = Math.max(0, pendingScrollRef.current.y);
    pendingScrollRef.current = null;
  }, [zoom]);

  // Pinch-to-zoom + mouse drag-to-pan on the tree canvas.
  // Non-passive touchmove lets us preventDefault during pinch.
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;

    // ── Touch pinch-to-zoom ─────────────────────────────────────────────────
    let pinching = false;
    let startDist = 0;
    let startZoom = 1;
    let startScrollX = 0;
    let startScrollY = 0;
    let midX = 0;
    let midY = 0;

    const pinchDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) { pinching = false; return; }
      pinching = true;
      userMovedRef.current = true; // user took over the canvas
      startDist = pinchDist(e.touches);
      startZoom = zoomRef.current;
      startScrollX = el.scrollLeft;
      startScrollY = el.scrollTop;
      const rect = el.getBoundingClientRect();
      midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length < 2) return;
      e.preventDefault();
      const d = pinchDist(e.touches);
      const newZ = Math.min(1.6, Math.max(0.1, startZoom * (d / startDist)));
      // Keep the canvas point under the pinch midpoint stationary. The canvas
      // starts after the (unscaled) move-number gutter.
      const layoutX = (startScrollX + midX - GUTTER) / startZoom;
      const layoutY = (startScrollY + midY) / startZoom;
      pendingScrollRef.current = { x: layoutX * newZ + GUTTER - midX, y: layoutY * newZ - midY };
      setZoom(newZ);
    };

    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinching = false; };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    // ── Mouse drag-to-pan ───────────────────────────────────────────────────
    let panStart: { x: number; y: number; scrollLeft: number; scrollTop: number } | null = null;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Ignore clicks on interactive elements and node cards.
      const target = e.target as Element;
      if (target.closest('.cnode, button, a, input, select, textarea')) return;
      panStart = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
      userMovedRef.current = true; // user took over the canvas
      document.body.classList.add('panning');
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!panStart) return;
      el.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
      el.scrollTop = panStart.scrollTop - (e.clientY - panStart.y);
    };

    const onMouseUp = () => {
      if (!panStart) return;
      panStart = null;
      document.body.classList.remove('panning');
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('panning');
    };
  }, []);

  // Focus re-roots the tree at one node (an opening, or any clicked node) so you
  // can drill in; otherwise the whole tree. Path ids are absolute, so a focus
  // node's children keep walking deeper.
  const { layout, firstPly } = useMemo(() => {
    // Cap the on-screen explorer at 3 variations per node (its established look);
    // the data now keeps more (MAX_CHILDREN) so the poster can show wider. Packed
    // by outline like the poster, so a deep line slides under a short one
    // instead of every leaf owning a full-height column.
    // rowH 1: the layout's y is the node's depth; rowGeometry sizes the rows.
    const metrics = { maxChildren: 3, cardW: CARD_W, colGap: COL_GAP, rowH: 1, pack: { maxCols: 0 } };
    if (focus) {
      const node = findByPath(tree, focus);
      if (node) {
        const parent = focus.split('/').slice(0, -1).join('/');
        return { layout: layoutTree(tree, { ...metrics, topNodes: [node], basePath: parent }), firstPly: node.depth };
      }
    }
    return { layout: layoutTree(tree, metrics), firstPly: 1 };
  }, [tree, focus]);
  const hasGames = tree.games > 0;

  const byId = useMemo(() => {
    const m: Record<string, LaidNode> = {};
    for (const n of layout.nodes) m[n.pathId] = n;
    return m;
  }, [layout]);

  // Each named node's label: the part of its name that's new on this line.
  const labels = useMemo(() => {
    const out = new Map<string, string>();
    for (const n of layout.nodes) {
      if (!n.name) continue;
      const segs = n.pathId.split('/');
      let above = '';
      for (let i = segs.length - 1; i >= 1 && !above; i--) above = findByPath(tree, segs.slice(0, i).join('/'))?.name ?? '';
      out.set(n.pathId, newPart(n.name, above));
    }
    return out;
  }, [layout, tree]);

  // Row heights follow the longest name in each row, measured in the UI face
  // once it's loaded (a fallback face would wrap differently).
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => { if (live) setFontsReady(true); });
    return () => { live = false; };
  }, []);
  const rows = useMemo<Rows>(() => {
    const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    if (ctx) ctx.font = `700 11px ${getComputedStyle(document.body).fontFamily}`;
    const lines: number[] = new Array(layout.maxDepth + 1).fill(0);
    for (const n of layout.nodes) {
      const label = labels.get(n.pathId);
      if (label) lines[n.y] = Math.max(lines[n.y], nameLines(label, ctx));
    }
    const band = lines.map((l) => (l ? l * NAME_LINE + NAME_BAND_PAD : BAND_EMPTY));
    const top: number[] = [];
    let y = 0;
    for (let d = 0; d < band.length; d++) {
      top.push(y);
      y += band[d] + BOARD + LABEL_H + LINK_GAP;
    }
    return { top, band, height: y - LINK_GAP };
    // fontsReady: re-measure once the real face is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, labels, fontsReady]);

  // Fill a Stockfish eval for every drawn node the games don't already carry
  // one for, top rows first and nearest the main line first (what you see when
  // the tab opens). Results land in a FEN-keyed cache; the tree re-renders to
  // pick them up at most a few times a second — a re-render per eval used to
  // repaint every board in the tree hundreds of times while the pass ran.
  const [, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let last = 0;
    let timer = 0;
    const bump = () => {
      const now = performance.now();
      if (now - last > 400) { last = now; setTick((t) => t + 1); }
      else if (!timer) timer = window.setTimeout(() => { timer = 0; last = performance.now(); if (!cancelled) setTick((t) => t + 1); }, 400);
    };
    const top = layout.nodes.filter((n) => n.y === 0);
    const mainX = top.reduce((a, b) => (b.games > a.games ? b : a), top[0] ?? { x: 0, games: 0 }).x;
    const order = [...layout.nodes].sort((a, b) => a.y - b.y || Math.abs(a.x - mainX) - Math.abs(b.x - mainX));
    (async () => {
      for (const n of order) {
        if (cancelled) return;
        if (n.eval != null || peekEval(n.fen) !== undefined) continue;
        await evalPosition(n.fen);
        if (!cancelled) bump();
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [layout]);
  const evalOf = (n: LaidNode): number | null | undefined => n.eval ?? whiteCp(peekEval(n.fen));

  // Only what's on screen (plus a margin) is drawn: a big repertoire is
  // hundreds of boards of 64 squares each, and the pane shows a dozen. The
  // window is measured against the pane and snapped to CULL_STEP, so panning
  // re-renders in steps rather than every frame.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  useLayoutEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    let raf = 0;
    const snap = (v: number, up: boolean) => (up ? Math.ceil(v / CULL_STEP) : Math.floor(v / CULL_STEP)) * CULL_STEP;
    const measure = () => {
      raf = 0;
      const c = canvasRef.current;
      if (!c) return;
      const cr = c.getBoundingClientRect();
      const pr = el.getBoundingClientRect();
      const z = zoomRef.current;
      const next = {
        x0: snap((pr.left - cr.left) / z - CULL_MARGIN, false),
        y0: snap((pr.top - cr.top) / z - CULL_MARGIN, false),
        x1: snap((pr.right - cr.left) / z + CULL_MARGIN, true),
        y1: snap((pr.bottom - cr.top) / z + CULL_MARGIN, true),
      };
      setView((v) => (v && v.x0 === next.x0 && v.y0 === next.y0 && v.x1 === next.x1 && v.y1 === next.y1 ? v : next));
    };
    const onChange = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    el.addEventListener('scroll', onChange, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onChange) : null;
    ro?.observe(el);
    window.addEventListener('resize', onChange);
    return () => {
      el.removeEventListener('scroll', onChange);
      ro?.disconnect();
      window.removeEventListener('resize', onChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [layout, rows, zoom, ready, tree]);
  const inView = (x0: number, y0: number, x1: number, y1: number) =>
    !!view && x1 >= view.x0 && x0 <= view.x1 && y1 >= view.y0 && y0 <= view.y1;

  const select = useCallback((pathId: string) => { setSelectedId(pathId); setDetailOpen(true); }, [setSelectedId]);

  /** Select a node and bring its board into view, at a readable size: a
   *  zoomed-out tree first zooms back to 100%, then scrolls once that's laid out. */
  const pendingRevealRef = useRef<string | null>(null);
  const revealNode = (pathId: string) => {
    if (!byId[pathId]) return;
    userMovedRef.current = true; // don't let the auto-centre pull it back
    setSelectedId(pathId);
    if (zoomRef.current < 1) {
      pendingRevealRef.current = pathId;
      setZoom(1);
    } else scrollToNode(pathId);
  };
  useLayoutEffect(() => {
    const id = pendingRevealRef.current;
    if (!id) return;
    pendingRevealRef.current = null;
    scrollToNode(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);
  /** Scroll the tree so this node's board sits in the visible part of the
   *  pane, centred across and just under the sticky header. */
  const scrollToNode = (pathId: string) => {
    const el = treeRef.current;
    const c = canvasRef.current;
    const n = byId[pathId];
    if (!el || !c || !n) return;
    const cr = c.getBoundingClientRect();
    const pr = el.getBoundingClientRect();
    const z = zoomRef.current;
    const cx = cr.left - pr.left + el.scrollLeft + (LEFT_PAD + n.x + CARD_W / 2) * z;
    const ty = cr.top - pr.top + el.scrollTop + (TOP_PAD + rows.top[n.y]) * z;
    const header = (el.querySelector('.clinic-drill') ?? el.querySelector('.clinic-bar'))?.getBoundingClientRect();
    const below = header ? header.bottom - pr.top + 12 : 0;
    el.scrollTo({ left: Math.max(0, cx - el.clientWidth / 2), top: Math.max(0, ty - below), behavior: 'smooth' });
  };

  // Open the canvas *on the opening*, not on blank space: a wide repertoire's
  // root sits centred over its subtree, so scroll-0 shows empty canvas. Centre
  // the first row (the opening's first moves). But only when the *view* changes
  // (colour or focused opening), or on first population. Re-centring on every
  // games update would fight the user's scroll while the background fetch fills
  // the tree in.
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    const top = layout.nodes.filter((n) => n.y === 0);
    if (top.length === 0) return;
    const key = `${color}|${focus ?? ''}`;
    const newView = centeredKeyRef.current !== key;
    // A new view (opening the tab, switching colour, drilling) takes control back
    // and re-centres. Within the same view we keep re-centring as the tree fills,
    // but stop the moment the user pans — never yank the canvas out from under them.
    if (newView) userMovedRef.current = false;
    else if (userMovedRef.current) return;
    centeredKeyRef.current = key;
    // Centre on the *main* (most-played) first move. Centring on the span
    // midpoint would land in the blank gap between two wide openings (e.g. e4
    // and d4), so pick the busiest root and show that opening's tree.
    const main = top.reduce((a, b) => (b.games > a.games ? b : a), top[0]);
    const center = LEFT_PAD + main.x + CARD_W / 2;
    const id = requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, GUTTER + center * zoomRef.current - el.clientWidth / 2);
      el.scrollTop = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [layout, color, focus]);

  // Default selection: the worst hotspot, else the top-left (shallowest) node.
  const defaultSel = useMemo(() => {
    const hot = layout.nodes.filter((n) => n.hotspot).sort((a, b) => b.blunders - a.blunders);
    if (hot[0]) return hot[0];
    return [...layout.nodes].sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
  }, [layout]);
  const selected = (selectedId && byId[selectedId]) || defaultSel;

  // The opening the selected position belongs to: a name is only stored where
  // it changes, so take the nearest one at or above it.
  const selectedOpening = useMemo(() => {
    if (!selected) return '';
    const segs = selected.pathId.split('/');
    for (let i = segs.length; i >= 1; i--) {
      const name = findByPath(tree, segs.slice(0, i).join('/'))?.name;
      if (name) return name;
    }
    return '';
  }, [selected, tree]);

  // FEN of the position *before* the selected node's move. So the detail panel
  // can show the best move for the player who made that move.
  const parentFen = useMemo(() => {
    if (!selected) return null;
    const segs = selected.pathId.split('/');
    if (segs.length <= 1) return tree.fen; // parent is the start position
    return findByPath(tree, segs.slice(0, -1).join('/'))?.fen ?? null;
  }, [selected, tree]);

  // Drill = re-root the tree at a node. Used by the breadcrumb, the sidebar, and
  // the continuation list. But NOT by clicking a board (that only selects).
  const drill = (pathId: string) => { setFocus(pathId); setSelectedId(pathId); };

  // Weak spots to drill (whole tree, this colour).
  const weak = useMemo(() => weakSpots(tree, color), [tree, color]);

  // Whole-tree stats (not just the rows currently drawn).
  const allHot = useMemo(() => hotspots(tree).length, [tree]);
  const allGaps = useMemo(() => {
    let c = 0;
    const w = (n: typeof tree) => { if (n.gap) c++; n.children.forEach(w); };
    tree.children.forEach(w);
    return c;
  }, [tree]);

  // Breadcrumb from the focus path (each crumb re-roots to that level).
  /* When the focus sits inside an opening picked from the sidebar filter, that
     opening's name becomes the root crumb in place of "All openings". */
  const focusOpening = useMemo(() => {
    if (!focus) return null;
    return openings.find((o) => focus === o.pathId || focus.startsWith(`${o.pathId}/`)) ?? null;
  }, [openings, focus]);

  if (drillItems && drillItems.length > 0) {
    return <OpeningDrill items={drillItems} coords={coords} evalBar={evalBar} onExit={() => setDrillItems(null)} />;
  }

  return (
    <div className="clinic">
      <div className="clinic-tree" ref={treeRef}>
        <div className="clinic-bar">
          <div className="clinic-bar-left">
            <nav className="clinic-crumbs">
              <button
                className={'crumb' + (focus && !(focusOpening && focus === focusOpening.pathId) ? '' : ' on')}
                onClick={() => {
                  // Named opening: this crumb is its root. Otherwise it clears the filter.
                  if (focusOpening && focus !== focusOpening.pathId) {
                    setFocus(focusOpening.pathId);
                    setSelectedId(focusOpening.pathId);
                  } else {
                    setFocus(null);
                    setSelectedId(null);
                  }
                }}
              >
                {focusOpening ? focusOpening.name : 'All openings'}
              </button>
            </nav>
            <div className="clinic-legend">
              <span className="cleg"><i className="ln good" /> good</span>
              <span className="cleg"><i className="ln risk" /> risky</span>
              <span className="cleg"><i className="ln bad" /> blunder</span>
              <span className="cleg"><i className="ln dev" /> off-book</span>
              {/* These are legend keys, not counters — they name what the swatch
                  means. The count lives on the nodes themselves. */}
              {allHot > 0 && <span className="cleg" title={`${allHot} hotspot${allHot === 1 ? '' : 's'}`}><i className="sw hot" /> hotspots</span>}
              {allGaps > 0 && <span className="cleg" title={`${allGaps} gap${allGaps === 1 ? '' : 's'}`}><i className="sw gap" /> gaps</span>}
              {fetching && <span className="clinic-loading">loading games…</span>}
            </div>
          </div>
          {/* Tools pinned top-right: settings/menu button always, plus a zoom
              control on the web (handy on a big screen, dropped in the app). */}
          <div className="clinic-tools">
            {!nativeApp && (
              <div className="clinic-zoom">
                <button onClick={() => zoomBy(-0.2)} aria-label="Zoom out" disabled={zoom <= 0.1}>−</button>
                <span className="num">{Math.round(zoom * 100)}%</span>
                <button onClick={() => zoomBy(0.2)} aria-label="Zoom in" disabled={zoom >= 1.6}>+</button>
              </div>
            )}
            <BoardTopSlot />
          </div>
        </div>

        {/* Standalone below the bracket, so the header stays the same 54px as every
            other tab and the drill call-to-action reads as its own control. */}
        {weak.length > 0 && (
          <button className="od-start clinic-drill" onClick={() => setDrillItems(weak)}>
            Drill {weak.length} weak spot{weak.length === 1 ? '' : 's'} →
          </button>
        )}

        {!ready ? null : !hasGames ? (
          <div className="clinic-empty">
            <h3>No {color === 'w' ? 'White' : 'Black'} games mapped yet</h3>
            <p>{fetching ? 'Pulling your games from Lichess…' : 'Import your games from the sidebar to build your opening tree.'}</p>
          </div>
        ) : (
          <div
            className="clinic-canvas-wrap"
            style={{ width: GUTTER + (LEFT_PAD + layout.width) * zoom, height: (TOP_PAD + rows.height) * zoom }}
          >
            {/* Move numbers, one per full move beside White's row, pinned to
                the pane's left edge while the tree pans under them. A view that
                starts on a Black move labels its first row "7…". */}
            <div className="clinic-gutter" style={{ height: (TOP_PAD + rows.height) * zoom }} aria-hidden="true">
              {Array.from({ length: layout.maxDepth + 1 }, (_, r) => {
                const ply = firstPly + r;
                const whiteMove = ply % 2 === 1;
                if (!whiteMove && r > 0) return null;
                const top = (TOP_PAD + rows.top[r] + rows.band[r] + BOARD * MOVE_NO_AT) * zoom;
                return (
                  <span key={r} className="clinic-move-no num" style={{ top }}>
                    {Math.floor((ply - 1) / 2) + 1}{whiteMove ? '.' : '…'}
                  </span>
                );
              })}
            </div>
            <div className="clinic-canvas-box" style={{ width: (LEFT_PAD + layout.width) * zoom }}>
              <div
                ref={canvasRef}
                className="clinic-canvas"
                style={{ width: LEFT_PAD + layout.width, height: TOP_PAD + rows.height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
              >
                <svg className="clinic-conn" width={LEFT_PAD + layout.width} height={TOP_PAD + rows.height}>
                  {layout.edges.map((e) => {
                    const a = byId[e.from];
                    const b = byId[e.to];
                    if (!a || !b) return null;
                    const { d, tip: [tx, ty], box } = connectorPath(a, b, rows);
                    if (!inView(...box)) return null;
                    const stroke = edgeStroke(a.fen, evalOf(a) ?? null, evalOf(b) ?? null);
                    // Dash the move that leaves theory, so the solid spine reads as
                    // the main line and deviations stand out (colour still = quality).
                    const dash = b.deviation ? '5 4' : undefined;
                    return (
                      <g key={e.to}>
                        <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeDasharray={dash} />
                        <path d={`M ${tx - 3} ${ty - 4.5} L ${tx + 3} ${ty - 4.5} L ${tx} ${ty} Z`} fill={stroke} />
                      </g>
                    );
                  })}
                </svg>
                {layout.nodes.map((n) => {
                  const x = LEFT_PAD + n.x;
                  const y = TOP_PAD + rows.top[n.y];
                  if (!inView(x, y, x + CARD_W, y + rows.band[n.y] + BOARD + LABEL_H)) return null;
                  return (
                    <ClinicNode
                      key={n.pathId}
                      node={n}
                      label={labels.get(n.pathId) ?? ''}
                      top={y}
                      band={rows.band[n.y]}
                      color={color}
                      displayEval={evalOf(n)}
                      selected={selected?.pathId === n.pathId}
                      onSelect={select}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {detailOpen && (
        <DetailPanel
          node={selected}
          openingName={selectedOpening}
          parentFen={parentFen}
          color={color}
          onClose={() => setDetailOpen(false)}
          onPickMove={(san) => {
            // Drill into a played continuation by SAN, if it's in the tree.
            if (!selected) return;
            const child = selected.children.find((c) => c.san === san);
            if (child) drill(`${selected.pathId}/${child.san}`);
          }}
          onDrill={setDrillItems}
          onShowInTree={() => selected && revealNode(selected.pathId)}
        />
      )}
    </div>
  );
}

/** One card. Memoised: the tree re-renders as evals arrive and as you pan,
 *  and a card whose own props didn't change (most of them) skips its board. */
const ClinicNode = memo(function ClinicNode({ node, label, top, band, color, displayEval, selected, onSelect }: {
  node: LaidNode;
  /** The part of the opening's name that's new here (see newPart). */
  label: string;
  top: number;
  band: number;
  color: 'w' | 'b';
  displayEval: number | null | undefined;
  selected: boolean;
  onSelect: (pathId: string) => void;
}) {
  // Frame is neutral now; move-quality lives on the connecting lines. Only gap
  // (rarely played), hotspot (blunder spot), and selection still tint the frame.
  const cls =
    'cnode-frame' +
    (node.gap ? ' gap' : '') +
    (node.deviation ? ' dev' : '') +
    (node.hotspot ? ' hotspot' : '') +
    (selected ? ' sel' : '');
  const evalLabel = displayEval === undefined ? '…' : formatEval(displayEval) || '·';
  // Poster card: the name band above the board, and nothing ON the board —
  // under it, the move (its number is in the gutter) and eval, then how often
  // you reached it, lines hidden below (+N), and blunders made from here.
  return (
    <div className="cnode" style={{ left: LEFT_PAD + node.x, top, width: CARD_W }}>
      <div className="cnode-name" style={{ height: band }} title={node.name || undefined}>
        {label && <span>{label}</span>}
      </div>
      <button className="cnode-btn" onClick={() => onSelect(node.pathId)} aria-label={`${node.label}${node.name ? `, ${node.name}` : ''}`}>
        <div className={cls}>
          <OpeningBoard fen={node.fen} hl={node.hl} sqSize={SQ} orient={color} />
        </div>
      </button>
      <div className="cnode-label">
        <div className="cnode-line">
          <span className="cnode-move">{figurine(node.san, node.depth % 2 === 1 ? 'w' : 'b')}</span>
          <span className="cnode-eval num">{evalLabel}</span>
        </div>
        <div className="cnode-line cnode-meta num">
          <span>{node.games} {node.games === 1 ? 'game' : 'games'}</span>
          {node.more > 0 && <span>+{node.more}</span>}
          {node.blunders > 0 && <span className="cnode-warn"><IconWarn size={9} />{node.blunders}</span>}
        </div>
      </div>
    </div>
  );
});

function DetailPanel({ node, openingName, parentFen, color, onClose, onPickMove, onDrill, onShowInTree }: {
  node: LaidNode | null;
  /** The opening this position belongs to: its own name, else the nearest above. */
  openingName: string;
  parentFen: string | null;
  color: 'w' | 'b';
  onClose: () => void;
  onPickMove: (san: string) => void;
  onDrill: (items: DrillItem[]) => void;
  /** Bring this position into view in the tree (the "You played" card). */
  onShowInTree: () => void;
}) {
  // The engine's best line, replayed on a small board.
  const [popup, setPopup] = useState(false);
  // A new position opens the panel at its top — its scroll would otherwise
  // carry over from the last one and cut the board off.
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setPopup(false);
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [node?.fen]);
  const [theory, setTheory] = useState<Theory | null>(null);
  const [theoryLoading, setTheoryLoading] = useState(false);
  const [engine, setEngine] = useState<EngineEval | null>(null);
  // Engine eval of the position *before* this node's move. The best move the
  // player who moved here should have chosen.
  const [parentEngine, setParentEngine] = useState<EngineEval | null>(null);

  useEffect(() => {
    if (!node) { setTheory(null); return; }
    let cancelled = false;
    setTheoryLoading(true); setTheory(null);
    fetchTheory(node.fen).then((t) => { if (!cancelled) setTheory(t); }).finally(() => { if (!cancelled) setTheoryLoading(false); });
    return () => { cancelled = true; };
  }, [node?.fen]);

  useEffect(() => {
    if (!node) { setEngine(null); return; }
    let cancelled = false;
    setEngine(null);
    evalPosition(node.fen).then((e) => { if (!cancelled) setEngine(e); });
    return () => { cancelled = true; };
  }, [node?.fen]);

  // Analyse the parent for *every* move (your moves and the opponent's), so the
  // best-vs-played arrows are consistent on every node; skip only the root.
  const movedColor = node ? ((node.fen.split(' ')[1] ?? 'w') === 'w' ? 'b' : 'w') : null;
  const reachedByUser = !!node && node.depth > 0 && movedColor === color;
  useEffect(() => {
    if (!node || node.depth === 0 || !parentFen) { setParentEngine(null); return; }
    let cancelled = false;
    setParentEngine(null);
    evalPosition(parentFen).then((e) => { if (!cancelled) setParentEngine(e); });
    return () => { cancelled = true; };
  }, [node?.fen, parentFen]);

  if (!node) {
    return (
      <aside className="clinic-detail">
        <button className="cd-close" onClick={onClose} aria-label="Close panel" title="Close panel">×</button>
        <div className="cd-empty">Select a position to see the right continuation.</div>
      </aside>
    );
  }

  // Whose move is it here? The "your move" framing only applies on your turn —
  // in the White tree, the node after 1.e4 has Black (the opponent) to move.
  const userTurn = (node.fen.split(' ')[1] ?? 'w') === color;
  // Side to move at this node — the colour of any move played *from* here.
  const stm: 'w' | 'b' = (node.fen.split(' ')[1] ?? 'w') === 'w' ? 'w' : 'b';
  const yours = [...node.children].sort((a, b) => b.games - a.games);

  // Best move at the current position (for tagging the "played in practice" list).
  const greenSan = engine?.bestSan || theory?.moves[0]?.san;
  // Did the move that reached this node match the engine's best at the parent?
  const parentBestUci = parentEngine?.bestUci || '';
  const playedBest = !!parentBestUci && !!node.hl && parentBestUci.slice(0, 2) === node.hl[0] && parentBestUci.slice(2, 4) === node.hl[1];
  // Consistent arrows on every node: green = the best move the player who moved
  // here could have made (yours OR the opponent's), red = what they actually
  // played, when it wasn't the best. Derived from the position *before* the move.
  const arrows: BoardArrow[] = [];
  if (node.depth > 0) {
    if (parentBestUci) arrows.push({ from: parentBestUci.slice(0, 2), to: parentBestUci.slice(2, 4), kind: 'good' });
    if (node.hl && !playedBest) arrows.push({ from: node.hl[0], to: node.hl[1], kind: 'bad' });
  }

  const who = reachedByUser ? 'You' : 'Opponent';
  const mover = movedColor ?? 'w';
  // What "Drill this position" practises: on your move, this position; on the
  // opponent's, the position you just moved from — find the best move where
  // you played this one.
  const sans = node.pathId.split('/');
  const drillItem: DrillItem | null = userTurn
    ? {
        fen: node.fen, color, line: lineString(sans), name: openingName, reached: node.games, blundered: node.blunders,
        usualSan: [...node.children].sort((a, b) => b.games - a.games)[0]?.san ?? null,
      }
    : parentFen
      ? { fen: parentFen, color, line: lineString(sans.slice(0, -1)), name: openingName, reached: node.games, blundered: 0, usualSan: node.san }
      : null;

  return (
    <aside className="clinic-detail" ref={panelRef}>
      <button className="cd-close" onClick={onClose} aria-label="Close panel" title="Close panel">×</button>
      <div className="cd-board-sec">
        <div className="cd-board"><OpeningBoard fen={node.fen} hl={node.hl} sqSize={22} orient={color} arrows={arrows} /></div>
      </div>

      {/* One bracket, built like a puzzle's result: title, one body line, the
          best / played cards, the moves from here, and the drill as the main
          action at the bottom. */}
      <div className="result cd-result">
        <div>
          <div className="verdict-title">{openingName || 'Starting position'}</div>
          <div className="verdict-sub num cd-facts">
            <span>{figurine(node.label, mover)}</span>
            {node.depth > 0 && <span className={'cd-theory ' + (node.onBook ? 'book' : 'off')}>{node.onBook ? 'Main line' : 'Off-book'}</span>}
            <span title="Your score from this position (wins + ½ draws)"><span className={'cd-score ' + node.perf}>{node.score}%</span> {node.wins}W {node.draws}D {node.losses}L</span>
            {node.blunders > 0 && <span className="cd-blund">Blundered here {node.blunders}×</span>}
          </div>
        </div>

        {node.depth > 0 && (
          <div className="rf-cards">
            <button
              type="button"
              className="btn rf-card"
              onClick={() => setPopup(true)}
              disabled={!parentEngine?.bestSan}
              aria-label="Best move here. Watch where it leads."
            >
              <span className="rf-lbl">Best move</span>
              <span className="rf-v best">{parentEngine ? figurine(parentEngine.bestSan || '—', mover) : '…'}</span>
            </button>
            <button
              type="button"
              className="btn rf-card"
              onClick={onShowInTree}
              aria-label={`${who} played ${node.san}. Show this position in the tree.`}
            >
              <span className="rf-lbl">{who} played</span>
              <span className={'rf-v' + (playedBest ? ' best' : '')}>{figurine(node.san, mover)}</span>
            </button>
          </div>
        )}

        {yours.length > 0 && (
          <>
            <div className="rf-lbl">{userTurn ? 'What you play from here' : 'What you face here'}</div>
            <div className="rf-cards cd-moves">
              {yours.map((c) => (
                <button
                  key={c.san}
                  type="button"
                  className={'btn rf-card' + (c.blunders > 0 ? ' bad' : '')}
                  onClick={() => onPickMove(c.san)}
                  title={`${c.wins}W ${c.draws}D ${c.losses}L${c.blunders > 0 ? ` · blundered ${c.blunders}×` : ''}`}
                >
                  <span className="rf-v">{figurine(c.san, stm)}</span>
                  <span className="cd-card-meta num">
                    {c.eval != null && <>{formatEval(c.eval)} </>}
                    <span className={'cd-score ' + c.perf}>{c.score}%</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {theory && theory.moves.length > 0 && (
          <>
            <div className="rf-lbl">Played in practice</div>
            <div className="rf-cards cd-moves">
              {theory.moves.slice(0, 4).map((m) => (
                <div key={m.uci} className="btn rf-card cd-static">
                  <span className={'rf-v' + (m.san === greenSan ? ' best' : '')}>{figurine(m.san, stm)}</span>
                  <span className="cd-card-meta num">{m.share}%</span>
                </div>
              ))}
            </div>
          </>
        )}
        {theoryLoading && !theory && <div className="verdict-sub">Looking up theory…</div>}

        {drillItem && (
          <button type="button" className="btn prim" onClick={() => onDrill([drillItem])}>
            Drill this position →
          </button>
        )}
      </div>

      {popup && parentFen && (
        <BestLinePopup
          fen={parentFen}
          pvSan={parentEngine?.pv ?? []}
          orient={color}
          lead="Best was"
          tail={parentEngine ? evalText(parentEngine) : undefined}
          note="The position before the move, then the engine’s best line. Tap a move to jump to it."
          onClose={() => setPopup(false)}
        />
      )}
    </aside>
  );
}
