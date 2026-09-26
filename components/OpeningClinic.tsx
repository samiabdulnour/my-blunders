'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutTree, findByPath, hotspots, weakSpots, lineString, formatEval, CARD_W, type LaidNode, type DrillItem } from '@/lib/opening-tree';
import { figurine } from '@/lib/figurine';
import { useClinic } from '@/lib/clinic-context';
import { fetchTheory, type Theory } from '@/lib/opening-explorer';
import { evalPosition, peekEval, whiteCp, type EngineEval } from '@/lib/opening-engine';
import { OpeningDrill } from '@/components/OpeningDrill';
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

const TOP_PAD = 26;
const LEFT_PAD = 24;
// Connectors leave the parent *below* its label (board ≈106 + label ≈46) so the
// line sits in the gap between rows and never crosses the move/eval text. The
// node name is truncated to one line so node height stays bounded.
const CARD_BOTTOM = 156;

function connectorPath(parent: LaidNode, child: LaidNode): string {
  const px = LEFT_PAD + parent.x + CARD_W / 2;
  const py = TOP_PAD + parent.y + CARD_BOTTOM;
  const cx = LEFT_PAD + child.x + CARD_W / 2;
  const cy = TOP_PAD + child.y;
  const my = py + (cy - py) * 0.5;
  return `M ${px} ${py} C ${px} ${my}, ${cx} ${my}, ${cx} ${cy}`;
}

/**
 * Opening Clinic. The "Opening" mode of the trainer. Turns your imported games
 * into a top-down opening tree (left) and, for the selected position, shows what
 * you play from here and the right continuation from Lichess theory (right).
 * Uses the main app's tokens so it matches the trainer and inherits dark mode.
 */
export function OpeningClinic() {
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
      // Keep the canvas point under the pinch midpoint stationary.
      const layoutX = (startScrollX + midX) / startZoom;
      const layoutY = (startScrollY + midY) / startZoom;
      pendingScrollRef.current = { x: layoutX * newZ - midX, y: layoutY * newZ - midY };
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
  const layout = useMemo(() => {
    // Cap the on-screen explorer at 3 variations per node (its established look);
    // the data now keeps more (MAX_CHILDREN) so the poster can show wider.
    if (focus) {
      const node = findByPath(tree, focus);
      if (node) {
        const parent = focus.split('/').slice(0, -1).join('/');
        return layoutTree(tree, { topNodes: [node], basePath: parent, maxChildren: 3 });
      }
    }
    return layoutTree(tree, { maxChildren: 3 });
  }, [tree, focus]);
  const hasGames = tree.games > 0;

  const byId = useMemo(() => {
    const m: Record<string, LaidNode> = {};
    for (const n of layout.nodes) m[n.pathId] = n;
    return m;
  }, [layout]);

  // Fill a Stockfish eval for any rendered node the games don't already carry
  // one for, so every board shows an eval. Cached per FEN, computed progressively
  // (the engine result re-renders via the tick).
  const [, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const n of layout.nodes) {
        if (cancelled) return;
        if (n.eval != null || peekEval(n.fen) !== undefined) continue;
        await evalPosition(n.fen);
        if (!cancelled) setTick((t) => t + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [layout]);
  const evalOf = (n: LaidNode): number | null | undefined => n.eval ?? whiteCp(peekEval(n.fen));

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
      el.scrollLeft = Math.max(0, center * zoomRef.current - el.clientWidth / 2);
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
    return <OpeningDrill items={drillItems} onExit={() => setDrillItems(null)} />;
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
            style={{ width: (LEFT_PAD + layout.width) * zoom, height: (TOP_PAD + layout.height) * zoom }}
          >
            <div
              className="clinic-canvas"
              style={{ width: LEFT_PAD + layout.width, height: TOP_PAD + layout.height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
            >
              <svg className="clinic-conn" width={LEFT_PAD + layout.width} height={TOP_PAD + layout.height}>
                {layout.edges.map((e, i) => {
                  const a = byId[e.from];
                  const b = byId[e.to];
                  if (!a || !b) return null;
                  const stroke = edgeStroke(a.fen, evalOf(a) ?? null, evalOf(b) ?? null);
                  // Dash the move that leaves theory, so the solid spine reads as
                  // the main line and deviations stand out (colour still = quality).
                  const dash = b.deviation ? '6 5' : undefined;
                  return <path key={i} d={connectorPath(a, b)} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash} />;
                })}
              </svg>
              {layout.nodes.map((n) => (
                <ClinicNode key={n.pathId} node={n} color={color} displayEval={evalOf(n)} selected={selected?.pathId === n.pathId} onSelect={() => { setSelectedId(n.pathId); setDetailOpen(true); }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {detailOpen && (
        <DetailPanel
          node={selected}
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
        />
      )}
    </div>
  );
}

function ClinicNode({ node, color, displayEval, selected, onSelect }: { node: LaidNode; color: 'w' | 'b'; displayEval: number | null | undefined; selected: boolean; onSelect: () => void }) {
  // Frame is neutral now; move-quality lives on the connecting lines. Only gap
  // (rarely played), hotspot (blunder spot), and selection still tint the frame.
  const cls =
    'cnode-frame' +
    (node.gap ? ' gap' : '') +
    (node.deviation ? ' dev' : '') +
    (node.hotspot ? ' hotspot' : '') +
    (selected ? ' sel' : '');
  const evalLabel = displayEval === undefined ? '…' : formatEval(displayEval) || '·';
  return (
    <div className="cnode" style={{ left: LEFT_PAD + node.x, top: TOP_PAD + node.y, width: CARD_W }}>
      <button className="cnode-btn" onClick={onSelect}>
        <div className={cls}>
          {node.blunders > 0 && <span className="cnode-warn"><IconWarn size={10} /> {node.blunders}</span>}
          {node.more > 0 && <span className="cnode-more">+{node.more}</span>}
          {node.deviation && <span className="cnode-off" title="Leaves opening theory">off-book</span>}
          <OpeningBoard fen={node.fen} hl={node.hl} sqSize={12} orient={color} />
        </div>
      </button>
      <div className="cnode-label">
        {node.name && <span className="cnode-name">{node.name}</span>}
        <span className="cnode-move">{figurine(node.label, node.depth % 2 === 1 ? 'w' : 'b')}</span>
        <span className="cnode-eval num">{evalLabel}</span>
      </div>
    </div>
  );
}

function DetailPanel({ node, parentFen, color, onClose, onPickMove, onDrill }: { node: LaidNode | null; parentFen: string | null; color: 'w' | 'b'; onClose: () => void; onPickMove: (san: string) => void; onDrill: (items: DrillItem[]) => void }) {
  const [theory, setTheory] = useState<Theory | null>(null);
  const [theoryLoading, setTheoryLoading] = useState(false);
  const [engine, setEngine] = useState<EngineEval | null>(null);
  const [engineLoading, setEngineLoading] = useState(false);
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
    setEngineLoading(true); setEngine(null);
    evalPosition(node.fen).then((e) => { if (!cancelled) setEngine(e); }).finally(() => { if (!cancelled) setEngineLoading(false); });
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
  const yourMain = yours[0];

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

  return (
    <aside className="clinic-detail">
      <button className="cd-close" onClick={onClose} aria-label="Close panel" title="Close panel">×</button>
      <div className="cd-board-sec">
        <div className="cd-board"><OpeningBoard fen={node.fen} hl={node.hl} sqSize={22} orient={color} arrows={arrows} /></div>
        <div className="cd-head">
          {node.name && <div className="cd-name">{node.name}</div>}
          <div className="cd-move">{figurine(node.label, node.depth % 2 === 1 ? 'w' : 'b')}</div>
          {node.depth > 0 && (
            <div className={'cd-theory ' + (node.onBook ? 'book' : 'off')}>
              {node.onBook ? 'Main line' : 'Off-book'}
            </div>
          )}
          <div className="cd-record num" title="Your score from this position (wins + ½ draws)">
            <span className={'cd-score ' + node.perf}>{node.score}%</span>
            <span className="cd-wdl">{node.wins}W · {node.draws}D · {node.losses}L</span>
          </div>
          {node.blunders > 0 && (
            <div className="cd-sub num"><span className="cd-blund">blundered {node.blunders}×</span></div>
          )}
        </div>
        {userTurn && (
          <button
            className="od-start cd-drill"
            onClick={() => {
              const sans = node.pathId.split('/');
              const usual = [...node.children].sort((a, b) => b.games - a.games)[0];
              onDrill([{ fen: node.fen, color, line: lineString(sans), name: node.name || '', reached: node.games, blundered: node.blunders, usualSan: usual?.san ?? null }]);
            }}
          >
            Drill this position →
          </button>
        )}
      </div>

      <div className="cd-sec">
        <div className="cd-eyebrow">{node.depth > 0 ? 'Best move here' : 'Best first move'}</div>
        {node.depth > 0 ? (
          parentEngine ? (
            <>
              <div className="cd-engine">
                <span className="ce-move">{figurine(parentEngine.bestSan || '—', movedColor ?? 'w')}</span>
                <span className="ce-eval num">{evalText(parentEngine)}</span>
              </div>
              {/* Only the part the headline above doesn't already say — the move
                  and its eval are right there, so don't repeat them. */}
              <div className="cd-verdict">
                {playedBest
                  ? <>{reachedByUser ? 'You' : 'Opponent'} played it <b className="good">✓</b></>
                  : <>{reachedByUser ? 'You' : 'Opponent'} played <b className={node.deviation ? 'bad' : ''}>{figurine(node.san, movedColor ?? 'w')}</b></>}
              </div>
            </>
          ) : (
            <div className="cd-note">Analyzing the move…</div>
          )
        ) : engine ? (
          <div className="cd-engine">
            <span className="ce-move">{figurine(engine.bestSan || '—', stm)}</span>
            <span className="ce-eval num">{evalText(engine)}</span>
          </div>
        ) : engineLoading ? (
          <div className="cd-note">Analyzing position…</div>
        ) : (
          <div className="cd-note">Engine unavailable.</div>
        )}
      </div>

      {(theoryLoading || (theory && theory.moves.length > 0)) && (
        <div className="cd-sec">
          <div className="cd-eyebrow">Played in practice</div>
          {theoryLoading && !theory ? (
            <div className="cd-note">Looking up theory…</div>
          ) : (
            <ul className="theory-list">
              {theory!.moves.slice(0, 5).map((m) => {
                const mine = userTurn && m.san === yourMain?.san;
                const isBest = m.san === greenSan;
                return (
                  <li key={m.uci} className={'theory-row' + (isBest ? ' best' : '') + (mine ? ' mine' : '')}>
                    <span className="t-san">{figurine(m.san, stm)}{mine && <span className="t-tag you">you</span>}</span>
                    <span className="t-bar"><span className="t-fill" style={{ width: m.share + '%' }} /></span>
                    <span className="t-share num">{m.share}%</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="cd-sec">
        <div className="cd-eyebrow">{userTurn ? 'What you play from here' : 'What you face here'}</div>
        {yours.length === 0 ? (
          <div className="cd-note">End of your mapped line{node.more > 0 ? ` (+${node.more} more below)` : ''}.</div>
        ) : (
          <ul className="cont-list">
            {yours.map((c) => (
              <li key={c.san}>
                <button className={'cont-row' + (c.blunders > 0 ? ' bad' : '')} onClick={() => onPickMove(c.san)}>
                  <span className="c-san">{figurine(c.san, stm)}</span>
                  <span className="c-meta num">
                    {c.eval != null && <span className="c-eval">{formatEval(c.eval)}</span>}
                    <span className={'c-score ' + c.perf} title={`Your score down this line: ${c.wins}W · ${c.draws}D · ${c.losses}L`}>{c.score}%</span>
                    {c.blunders > 0 && <span className="c-warn"><IconWarn size={9} /> {c.blunders}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
