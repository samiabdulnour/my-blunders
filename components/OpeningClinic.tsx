'use client';

import { useEffect, useMemo, useState } from 'react';
import { layoutTree, findByPath, hotspots, formatEval, CARD_W, type LaidNode } from '@/lib/opening-tree';
import { useClinic } from '@/lib/clinic-context';
import { fetchTheory, type Theory } from '@/lib/opening-explorer';
import { getWasmEngine } from '@/lib/engine/wasm-engine';
import { OpeningBoard, type BoardArrow } from '@/components/repertoire/OpeningBoard';
import { IconWarn } from '@/components/repertoire/icons';

/** Stockfish evaluation of a position: the correct continuation + how it scores. */
interface EngineEval { cp: number | null; mate: number | null; bestUci: string; bestSan: string }
const engineCache = new Map<string, EngineEval | null>();

/** Analyze a FEN with the WASM engine (cached per position). */
async function evalPosition(fen: string): Promise<EngineEval | null> {
  const hit = engineCache.get(fen);
  if (hit !== undefined) return hit;
  try {
    const res = await getWasmEngine().analyze({ fen, depth: 14 });
    const l = res.lines[0];
    const out: EngineEval | null = l ? { cp: l.cp, mate: l.mate, bestUci: l.pvUci[0] ?? '', bestSan: l.pvSan[0] ?? '' } : null;
    engineCache.set(fen, out);
    return out;
  } catch {
    engineCache.set(fen, null);
    return null;
  }
}

/** White-relative eval as a label: "+0.6", "-1.2", "#3". */
function evalText(e: EngineEval): string {
  if (e.mate !== null) return (e.mate > 0 ? '#' : '-#') + Math.abs(e.mate);
  const cp = (e.cp ?? 0) / 100;
  return (cp > 0 ? '+' : '') + cp.toFixed(1);
}

/** White-relative cp from an engine result (undefined = not computed yet). */
function whiteCp(e: EngineEval | null | undefined): number | null | undefined {
  if (e === undefined) return undefined;
  if (e === null) return null;
  if (e.mate !== null) return e.mate > 0 ? 10000 : -10000;
  return e.cp;
}

/** Colour a connector by how much eval the move (parent→child) loses for the
 *  side that played it: green = good, amber = risky, red = blunder, neutral when
 *  the eval isn't known. This draws the correct vs. wrong path through the tree. */
function edgeStroke(parentFen: string, parentEval: number | null, childEval: number | null): string {
  if (parentEval == null || childEval == null) return 'var(--border2)';
  const whiteToMove = parentFen.split(' ')[1] === 'w';
  const loss = whiteToMove ? parentEval - childEval : childEval - parentEval;
  if (loss >= 200) return 'var(--red)';
  if (loss >= 90) return 'var(--yellow)';
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
 * Opening Clinic — the "Opening" mode of the trainer. Turns your imported games
 * into a top-down opening tree (left) and, for the selected position, shows what
 * you play from here and the right continuation from Lichess theory (right).
 * Uses the main app's tokens so it matches the trainer and inherits dark mode.
 */
export function OpeningClinic() {
  const { ready, fetching, color, focus, setFocus, selectedId, setSelectedId, tree } = useClinic();

  // Focus re-roots the tree at one node (an opening, or any clicked node) so you
  // can drill in; otherwise the whole tree. Path ids are absolute, so a focus
  // node's children keep walking deeper.
  const layout = useMemo(() => {
    if (focus) {
      const node = findByPath(tree, focus);
      if (node) {
        const parent = focus.split('/').slice(0, -1).join('/');
        return layoutTree(tree, { topNodes: [node], basePath: parent });
      }
    }
    return layoutTree(tree);
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
        if (n.eval != null || engineCache.has(n.fen)) continue;
        await evalPosition(n.fen);
        if (!cancelled) setTick((t) => t + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [layout]);
  const evalOf = (n: LaidNode): number | null | undefined => n.eval ?? whiteCp(engineCache.get(n.fen));

  // Default selection: the worst hotspot, else the top-left (shallowest) node.
  const defaultSel = useMemo(() => {
    const hot = layout.nodes.filter((n) => n.hotspot).sort((a, b) => b.blunders - a.blunders);
    if (hot[0]) return hot[0];
    return [...layout.nodes].sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
  }, [layout]);
  const selected = (selectedId && byId[selectedId]) || defaultSel;

  // Drill = re-root the tree at a node. Used by the breadcrumb, the sidebar, and
  // the continuation list — but NOT by clicking a board (that only selects).
  const drill = (pathId: string) => { setFocus(pathId); setSelectedId(pathId); };

  // Whole-tree stats (not just the rows currently drawn).
  const allHot = useMemo(() => hotspots(tree).length, [tree]);
  const allGaps = useMemo(() => {
    let c = 0;
    const w = (n: typeof tree) => { if (n.gap) c++; n.children.forEach(w); };
    tree.children.forEach(w);
    return c;
  }, [tree]);

  // Breadcrumb from the focus path (each crumb re-roots to that level).
  const crumbs = useMemo(() => {
    if (!focus) return [] as { path: string; label: string }[];
    const out: { path: string; label: string }[] = [];
    let acc = '';
    for (const s of focus.split('/')) {
      acc = acc ? `${acc}/${s}` : s;
      out.push({ path: acc, label: findByPath(tree, acc)?.label ?? s });
    }
    return out;
  }, [tree, focus]);

  return (
    <div className="clinic">
      <div className="clinic-tree">
        <div className="clinic-bar">
          <nav className="clinic-crumbs">
            <button className={'crumb' + (focus ? '' : ' on')} onClick={() => { setFocus(null); setSelectedId(null); }}>
              All openings
            </button>
            {crumbs.map((c) => (
              <span key={c.path} className="crumb-wrap">
                <span className="crumb-sep">›</span>
                <button className={'crumb' + (c.path === focus ? ' on' : '')} onClick={() => drill(c.path)}>{c.label}</button>
              </span>
            ))}
          </nav>
          <div className="clinic-legend">
            <span className="cleg"><i className="ln good" /> good</span>
            <span className="cleg"><i className="ln risk" /> risky</span>
            <span className="cleg"><i className="ln bad" /> blunder</span>
            {allHot > 0 && <span className="cleg"><i className="sw hot" /> {allHot} hotspot{allHot === 1 ? '' : 's'}</span>}
            {allGaps > 0 && <span className="cleg"><i className="sw gap" /> {allGaps} gap{allGaps === 1 ? '' : 's'}</span>}
            {fetching && <span className="clinic-loading">loading games…</span>}
          </div>
        </div>

        {!ready ? null : !hasGames ? (
          <div className="clinic-empty">
            <h3>No {color === 'w' ? 'White' : 'Black'} games mapped yet</h3>
            <p>{fetching ? 'Pulling your games from Lichess…' : 'Import your games from the sidebar to build your opening tree.'}</p>
          </div>
        ) : (
          <div className="clinic-canvas" style={{ width: LEFT_PAD + layout.width, height: TOP_PAD + layout.height }}>
            <svg className="clinic-conn" width={LEFT_PAD + layout.width} height={TOP_PAD + layout.height}>
              {layout.edges.map((e, i) => {
                const a = byId[e.from];
                const b = byId[e.to];
                if (!a || !b) return null;
                const stroke = edgeStroke(a.fen, evalOf(a) ?? null, evalOf(b) ?? null);
                return <path key={i} d={connectorPath(a, b)} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />;
              })}
            </svg>
            {layout.nodes.map((n) => (
              <ClinicNode key={n.pathId} node={n} color={color} displayEval={evalOf(n)} selected={selected?.pathId === n.pathId} onSelect={() => setSelectedId(n.pathId)} />
            ))}
          </div>
        )}
      </div>

      <DetailPanel node={selected} color={color} onPickMove={(san) => {
        // Drill into a played continuation by SAN, if it's in the tree.
        if (!selected) return;
        const child = selected.children.find((c) => c.san === san);
        if (child) drill(`${selected.pathId}/${child.san}`);
      }} />
    </div>
  );
}

function ClinicNode({ node, color, displayEval, selected, onSelect }: { node: LaidNode; color: 'w' | 'b'; displayEval: number | null | undefined; selected: boolean; onSelect: () => void }) {
  // Frame is neutral now; move-quality lives on the connecting lines. Only gap
  // (rarely played), hotspot (blunder spot), and selection still tint the frame.
  const cls =
    'cnode-frame' +
    (node.gap ? ' gap' : '') +
    (node.hotspot ? ' hotspot' : '') +
    (selected ? ' sel' : '');
  const evalLabel = displayEval === undefined ? '…' : formatEval(displayEval) || '·';
  return (
    <div className="cnode" style={{ left: LEFT_PAD + node.x, top: TOP_PAD + node.y, width: CARD_W }}>
      <button className="cnode-btn" onClick={onSelect}>
        <div className={cls}>
          {node.blunders > 0 && <span className="cnode-warn"><IconWarn size={10} /> {node.blunders}</span>}
          {node.more > 0 && <span className="cnode-more">+{node.more}</span>}
          <OpeningBoard fen={node.fen} hl={node.hl} sqSize={12} orient={color} />
        </div>
      </button>
      <div className="cnode-label">
        {node.name && <span className="cnode-name">{node.name}</span>}
        <span className="cnode-move">{node.label}</span>
        <span className="cnode-eval num">{evalLabel}</span>
      </div>
    </div>
  );
}

function DetailPanel({ node, color, onPickMove }: { node: LaidNode | null; color: 'w' | 'b'; onPickMove: (san: string) => void }) {
  const [theory, setTheory] = useState<Theory | null>(null);
  const [theoryLoading, setTheoryLoading] = useState(false);
  const [engine, setEngine] = useState<EngineEval | null>(null);
  const [engineLoading, setEngineLoading] = useState(false);

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

  if (!node) {
    return (
      <aside className="clinic-detail">
        <div className="cd-empty">Select a position to see the right continuation.</div>
      </aside>
    );
  }

  // Whose move is it here? The "your move" framing only applies on your turn —
  // in the White tree, the node after 1.e4 has Black (the opponent) to move.
  const userTurn = (node.fen.split(' ')[1] ?? 'w') === color;
  const yours = [...node.children].sort((a, b) => b.games - a.games);
  const yourMain = yours[0];

  // Green = the right move: the engine's best (authoritative, works even where
  // theory runs out), falling back to theory's main line. Red = the move you
  // got wrong here (a blundered or off-book continuation) — only on your turn.
  const greenUci = engine?.bestUci || theory?.moves[0]?.uci || '';
  const greenSan = engine?.bestSan || theory?.moves[0]?.san;
  const blunderChild = yours.filter((c) => c.blunders > 0).sort((a, b) => b.blunders - a.blunders)[0];
  const offBook = !!yourMain && !!theory && !theory.moves.some((m) => m.san === yourMain.san);
  const wrong = userTurn ? blunderChild ?? (offBook ? yourMain : undefined) : undefined;
  const arrows: BoardArrow[] = [];
  if (greenUci) arrows.push({ from: greenUci.slice(0, 2), to: greenUci.slice(2, 4), kind: 'good' });
  if (wrong?.hl && wrong.san !== greenSan) arrows.push({ from: wrong.hl[0], to: wrong.hl[1], kind: 'bad' });

  return (
    <aside className="clinic-detail">
      <div className="cd-board-sec">
        <div className="cd-board"><OpeningBoard fen={node.fen} hl={node.hl} sqSize={30} orient={color} arrows={arrows} /></div>
        {arrows.length > 0 && (
          <div className="cd-legend">
            {greenSan && <span className="cd-leg good">the move — {greenSan}</span>}
            {wrong && wrong.san !== greenSan && <span className="cd-leg bad">you play — {wrong.san}</span>}
          </div>
        )}
        <div className="cd-head">
          {node.name && <div className="cd-name">{node.name}</div>}
          <div className="cd-move">{node.label}</div>
          {node.blunders > 0 && (
            <div className="cd-sub num"><span className="cd-blund">blundered {node.blunders}×</span></div>
          )}
        </div>
      </div>

      <div className="cd-sec">
        <div className="cd-eyebrow">{userTurn ? 'Right continuation' : 'Best move here'} <span className="cd-src">stockfish</span></div>
        {engine ? (
          <>
            <div className="cd-engine">
              <span className="ce-move">{engine.bestSan || '—'}</span>
              <span className="ce-eval num">{evalText(engine)}</span>
              <span className="ce-tag">engine best</span>
            </div>
            {userTurn && yourMain && (
              <div className="cd-verdict">
                {yourMain.san === engine.bestSan
                  ? <>You play the top engine move — <b className="good">{yourMain.san}</b>. ✓</>
                  : <>You play <b className={wrong ? 'bad' : ''}>{yourMain.san}</b>; the engine prefers <b className="good">{engine.bestSan}</b> ({evalText(engine)}).</>}
              </div>
            )}
          </>
        ) : engineLoading ? (
          <div className="cd-note">Analyzing position…</div>
        ) : (
          <div className="cd-note">Engine unavailable.</div>
        )}
      </div>

      {(theoryLoading || (theory && theory.moves.length > 0)) && (
        <div className="cd-sec">
          <div className="cd-eyebrow">Played in practice <span className="cd-src">{theory ? `lichess ${theory.db}` : ''}</span></div>
          {theoryLoading && !theory ? (
            <div className="cd-note">Looking up theory…</div>
          ) : (
            <ul className="theory-list">
              {theory!.moves.slice(0, 5).map((m) => {
                const mine = userTurn && m.san === yourMain?.san;
                const isBest = m.san === greenSan;
                return (
                  <li key={m.uci} className={'theory-row' + (isBest ? ' best' : '') + (mine ? ' mine' : '')}>
                    <span className="t-san">{m.san}{mine && <span className="t-tag you">you</span>}</span>
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
                  <span className="c-san">{c.san}</span>
                  <span className="c-meta num">
                    {c.eval != null && <span className="c-eval">{formatEval(c.eval)}</span>}
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
