'use client';

import { useEffect, useMemo, useState } from 'react';
import { layoutTree, findByPath, CARD_W, type LaidNode } from '@/lib/opening-tree';
import { useClinic } from '@/lib/clinic-context';
import { fetchTheory, type Theory } from '@/lib/opening-explorer';
import { OpeningBoard, type BoardArrow } from '@/components/repertoire/OpeningBoard';
import { IconWarn } from '@/components/repertoire/icons';

const TOP_PAD = 26;
const LEFT_PAD = 24;
const ROW_H = 176;
const CARD_BOTTOM = 124;

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
  const { ready, fetching, color, focus, setFocus, selectedId, setSelectedId, tree, openings } = useClinic();

  // Focus narrows the tree to one opening's subtree; otherwise the whole tree.
  const layout = useMemo(() => {
    if (focus) {
      const node = findByPath(tree, focus);
      if (node) return layoutTree({ ...tree, children: [node] });
    }
    return layoutTree(tree);
  }, [tree, focus]);
  const hasGames = tree.games > 0;

  const byId = useMemo(() => {
    const m: Record<string, LaidNode> = {};
    for (const n of layout.nodes) m[n.pathId] = n;
    return m;
  }, [layout]);

  // Default selection: the worst hotspot, else the first move.
  const defaultSel = useMemo(() => {
    const hot = layout.nodes.filter((n) => n.hotspot).sort((a, b) => b.blunders - a.blunders);
    return hot[0] ?? layout.nodes[0] ?? null;
  }, [layout]);
  const selected = (selectedId && byId[selectedId]) || defaultSel;

  const gaps = layout.nodes.filter((n) => n.gap).length;
  const hotspotCount = layout.nodes.filter((n) => n.hotspot).length;
  const focusName = focus ? openings.find((o) => o.pathId === focus)?.name : null;

  return (
    <div className="clinic">
      <div className="clinic-tree">
        <div className="clinic-bar">
          <div className="clinic-bar-meta">
            <span><b>{layout.nodes.length}</b> mapped</span>
            <span><b>{gaps}</b> gaps</span>
            <span className={hotspotCount ? 'hot' : ''}><b>{hotspotCount}</b> hotspots</span>
            {fetching && <span className="clinic-loading">loading games…</span>}
          </div>
          {focus && (
            <button className="clinic-clear" onClick={() => { setFocus(null); setSelectedId(null); }}>
              {focusName ?? 'focused'} ✕
            </button>
          )}
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
                return <path key={i} d={connectorPath(a, b)} fill="none" stroke="var(--border2)" strokeWidth="1.5" />;
              })}
            </svg>
            {layout.nodes.map((n) => (
              <ClinicNode
                key={n.pathId}
                node={n}
                selected={selected?.pathId === n.pathId}
                onSelect={() => setSelectedId(n.pathId)}
              />
            ))}
          </div>
        )}
      </div>

      <DetailPanel node={selected} color={color} onPickMove={(san) => {
        // Navigate to the child node for a played move, if it's in the tree.
        if (!selected) return;
        const child = selected.children.find((c) => c.san === san);
        if (child) setSelectedId(`${selected.pathId}/${child.san}`);
      }} />
    </div>
  );
}

function ClinicNode({ node, selected, onSelect }: { node: LaidNode; selected: boolean; onSelect: () => void }) {
  const cls =
    'cnode-frame ' +
    (node.gap ? 'gap' : 'perf-' + node.perf) +
    (node.hotspot ? ' hotspot' : '') +
    (selected ? ' sel' : '');
  return (
    <div className="cnode" style={{ left: LEFT_PAD + node.x, top: TOP_PAD + node.y, width: CARD_W }}>
      <button className="cnode-btn" onClick={onSelect}>
        <div className={cls}>
          {node.blunders > 0 && <span className="cnode-warn"><IconWarn size={10} /> {node.blunders}</span>}
          {node.collapsed > 0 && <span className="cnode-more">+{node.collapsed}</span>}
          <OpeningBoard fen={node.fen} hl={node.hl} sqSize={10} />
        </div>
      </button>
      <div className="cnode-label">
        {node.name && <span className="cnode-name">{node.name}</span>}
        <span className="cnode-move">{node.label}</span>
        <span className="cnode-games num">{node.games} game{node.games === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

function DetailPanel({ node, color, onPickMove }: { node: LaidNode | null; color: 'w' | 'b'; onPickMove: (san: string) => void }) {
  const [theory, setTheory] = useState<Theory | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!node) { setTheory(null); return; }
    let cancelled = false;
    setLoading(true);
    setTheory(null);
    fetchTheory(node.fen)
      .then((t) => { if (!cancelled) setTheory(t); })
      .finally(() => { if (!cancelled) setLoading(false); });
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
  // Continuations from here, most played first (your moves on your turn).
  const yours = [...node.children].sort((a, b) => b.games - a.games);
  const yourMain = yours[0];
  const best = theory?.moves[0];
  const inTheory = theory?.moves.findIndex((m) => m.san === yourMain?.san) ?? -1;

  // Arrows: green = the right move (theory main line); red = the move you got
  // wrong here (a blundered or off-book continuation) — only on your turn.
  const blunderChild = yours.filter((c) => c.blunders > 0).sort((a, b) => b.blunders - a.blunders)[0];
  const offBook = !!yourMain && !!theory && !theory.moves.some((m) => m.san === yourMain.san);
  const wrong = userTurn ? blunderChild ?? (offBook ? yourMain : undefined) : undefined;
  const arrows: BoardArrow[] = [];
  if (best) arrows.push({ from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), kind: 'good' });
  if (wrong?.hl && wrong.san !== best?.san) arrows.push({ from: wrong.hl[0], to: wrong.hl[1], kind: 'bad' });

  return (
    <aside className="clinic-detail">
      <div className="cd-board-sec">
        <div className="cd-board"><OpeningBoard fen={node.fen} hl={node.hl} sqSize={30} orient={color} arrows={arrows} /></div>
        {arrows.length > 0 && (
          <div className="cd-legend">
            {best && <span className="cd-leg good">the move{best ? ` — ${best.san}` : ''}</span>}
            {wrong && wrong.san !== best?.san && <span className="cd-leg bad">you play{` — ${wrong.san}`}</span>}
          </div>
        )}
        <div className="cd-head">
          {node.name && <div className="cd-name">{node.name}</div>}
          <div className="cd-move">{node.label}</div>
          <div className="cd-sub num">
            reached {node.games} time{node.games === 1 ? '' : 's'}
            {node.blunders > 0 && <span className="cd-blund"> · blundered {node.blunders}</span>}
          </div>
        </div>
      </div>

      <div className="cd-sec">
        <div className="cd-eyebrow">{userTurn ? 'Right continuation' : 'Main line here'} <span className="cd-src">{theory ? `lichess ${theory.db}` : ''}</span></div>
        {loading ? (
          <div className="cd-note">Looking up theory…</div>
        ) : !theory || theory.moves.length === 0 ? (
          <div className="cd-note">No theory found for this position{theory ? '' : ' (offline?)'}.</div>
        ) : (
          <>
            <ul className="theory-list">
              {theory.moves.slice(0, 5).map((m, i) => {
                const mine = userTurn && m.san === yourMain?.san;
                return (
                  <li key={m.uci} className={'theory-row' + (i === 0 ? ' best' : '') + (mine ? ' mine' : '')}>
                    <span className="t-san">{m.san}{i === 0 && <span className="t-tag">main</span>}{mine && <span className="t-tag you">you</span>}</span>
                    <span className="t-bar"><span className="t-fill" style={{ width: m.share + '%' }} /></span>
                    <span className="t-share num">{m.share}%</span>
                  </li>
                );
              })}
            </ul>
            {userTurn && yourMain && (
              <div className="cd-verdict">
                {inTheory === 0
                  ? <>You play the main line here — <b>{yourMain.san}</b>. ✓</>
                  : inTheory > 0
                    ? <>You usually play <b>{yourMain.san}</b> (theory's #{inTheory + 1}). The main move is <b className="good">{theory!.moves[0].san}</b>.</>
                    : <>Your <b className="bad">{yourMain.san}</b> is off-book here — theory plays <b className="good">{theory!.moves[0].san}</b>.</>}
              </div>
            )}
          </>
        )}
      </div>

      <div className="cd-sec">
        <div className="cd-eyebrow">{userTurn ? 'What you play from here' : 'What you face here'}</div>
        {yours.length === 0 ? (
          <div className="cd-note">End of your mapped line{node.collapsed > 0 ? ` (+${node.collapsed} more below)` : ''}.</div>
        ) : (
          <ul className="cont-list">
            {yours.map((c) => (
              <li key={c.san}>
                <button className={'cont-row' + (c.blunders > 0 ? ' bad' : '')} onClick={() => onPickMove(c.san)}>
                  <span className="c-san">{c.san}</span>
                  <span className="c-meta num">
                    {c.games}× {c.blunders > 0 && <span className="c-warn"><IconWarn size={9} /> {c.blunders}</span>}
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
