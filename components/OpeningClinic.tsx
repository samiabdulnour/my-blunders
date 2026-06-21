'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildOpeningTree,
  layoutTree,
  CARD_W,
  type OpeningGame,
  type LaidNode,
} from '@/lib/opening-tree';
import { loadOpeningGames, loadUsername } from '@/lib/storage';
import { importOpeningGames } from '@/lib/opening-import';
import { fetchTheory, type Theory } from '@/lib/opening-explorer';
import { OpeningBoard } from '@/components/repertoire/OpeningBoard';
import { IconWarn } from '@/components/repertoire/icons';

const TOP_PAD = 26;
const LEFT_PAD = 24;
const ROW_H = 176;
const CARD_BOTTOM = 124;
const FETCHED_KEY = 'bt.openingFetchedUser';

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
  const [games, setGames] = useState<OpeningGame[]>([]);
  const [username, setUsername] = useState('');
  const [color, setColor] = useState<'w' | 'b'>('w');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const fetchStarted = useRef(false);

  useEffect(() => {
    const g = loadOpeningGames();
    setGames(g);
    setUsername(loadUsername());
    const whites = g.filter((x) => x.color === 'w').length;
    setColor(g.length - whites > whites ? 'b' : 'w');
  }, []);

  // Once per user, pull a big engine-free batch so the clinic has real breadth.
  useEffect(() => {
    if (!username || fetchStarted.current) return;
    if (typeof window !== 'undefined' && window.localStorage.getItem(FETCHED_KEY) === username) return;
    fetchStarted.current = true;
    setFetching(true);
    importOpeningGames(username)
      .then(() => {
        setGames(loadOpeningGames());
        try {
          window.localStorage.setItem(FETCHED_KEY, username);
        } catch {
          /* ignore quota */
        }
      })
      .finally(() => setFetching(false));
  }, [username]);

  const { layout, hasGames } = useMemo(() => {
    const tree = buildOpeningTree(games, color);
    return { layout: layoutTree(tree), hasGames: tree.games > 0 };
  }, [games, color]);

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

  return (
    <div className="clinic">
      <div className="clinic-tree">
        <div className="clinic-bar">
          <div className="clinic-seg" role="tablist" aria-label="Repertoire colour">
            <button className={color === 'w' ? 'on' : ''} onClick={() => { setColor('w'); setSelectedId(null); }}>White</button>
            <button className={color === 'b' ? 'on' : ''} onClick={() => { setColor('b'); setSelectedId(null); }}>Black</button>
          </div>
          <div className="clinic-bar-meta">
            <span><b>{layout.nodes.length}</b> mapped</span>
            <span><b>{gaps}</b> gaps</span>
            <span className={hotspotCount ? 'hot' : ''}><b>{hotspotCount}</b> hotspots</span>
            {fetching && <span className="clinic-loading">loading games…</span>}
          </div>
        </div>

        {!hasGames ? (
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

  // Your continuations from here, most played first.
  const yours = [...node.children].sort((a, b) => b.games - a.games);
  const yourMain = yours[0];
  // Where does your main move rank in theory?
  const inTheory = theory?.moves.findIndex((m) => m.san === yourMain?.san) ?? -1;

  return (
    <aside className="clinic-detail">
      <div className="cd-board-sec">
        <div className="cd-board"><OpeningBoard fen={node.fen} hl={node.hl} sqSize={30} orient={color} /></div>
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
        <div className="cd-eyebrow">Right continuation <span className="cd-src">{theory ? `lichess ${theory.db}` : ''}</span></div>
        {loading ? (
          <div className="cd-note">Looking up theory…</div>
        ) : !theory || theory.moves.length === 0 ? (
          <div className="cd-note">No theory found for this position{theory ? '' : ' (offline?)'}.</div>
        ) : (
          <>
            <ul className="theory-list">
              {theory.moves.slice(0, 5).map((m, i) => {
                const mine = m.san === yourMain?.san;
                return (
                  <li key={m.uci} className={'theory-row' + (i === 0 ? ' best' : '') + (mine ? ' mine' : '')}>
                    <span className="t-san">{m.san}{i === 0 && <span className="t-tag">main</span>}{mine && <span className="t-tag you">you</span>}</span>
                    <span className="t-bar"><span className="t-fill" style={{ width: m.share + '%' }} /></span>
                    <span className="t-share num">{m.share}%</span>
                  </li>
                );
              })}
            </ul>
            {yourMain && (
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
        <div className="cd-eyebrow">What you play from here</div>
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
