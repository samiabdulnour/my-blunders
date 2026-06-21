'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { loadOpeningGames, loadUsername } from '@/lib/storage';
import {
  buildOpeningTree,
  layoutTree,
  hotspots,
  CARD_W,
  type OpeningGame,
  type LaidNode,
  type TreeNode,
} from '@/lib/opening-tree';
import { OpeningBoard } from '@/components/repertoire/OpeningBoard';
import { BrandMark, NavIcon, IconWarn, IconTarget, IconArrow, type NavIconName } from '@/components/repertoire/icons';

const NAV: { id: string; label: string; icon: NavIconName; href: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid', href: '/' },
  { id: 'games', label: 'Games', icon: 'stack', href: '/' },
  { id: 'repertoire', label: 'Repertoire X-ray', icon: 'branch', href: '/repertoire' },
  { id: 'puzzles', label: 'Puzzles', icon: 'target', href: '/' },
  { id: 'insights', label: 'Insights', icon: 'bars', href: '/' },
];

/** Vertical offsets so badges (which sit at top:-10px) aren't clipped and the
 *  ply gutter clears the left edge. */
const TOP_PAD = 26;
const LEFT_PAD = 24;
const ROW_H = 180;
/** Distance from a node's top to where its connector leaves the bottom of the
 *  label block (board frame ≈ 94px + label ≈ 36px). */
const CARD_BOTTOM = 130;

const GUTTER = ['opening', 'response', 'variation', 'your move', 'deep line', 'endgame'];

function connectorPath(parent: LaidNode, child: LaidNode): string {
  const px = LEFT_PAD + parent.x + CARD_W / 2;
  const py = TOP_PAD + parent.y + CARD_BOTTOM;
  const cx = LEFT_PAD + child.x + CARD_W / 2;
  const cy = TOP_PAD + child.y;
  const my = py + (cy - py) * 0.5;
  return `M ${px} ${py} C ${px} ${my}, ${cx} ${my}, ${cx} ${cy}`;
}

export default function RepertoirePage() {
  const [games, setGames] = useState<OpeningGame[]>([]);
  const [username, setUsername] = useState('');
  const [color, setColor] = useState<'w' | 'b'>('w');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const g = loadOpeningGames();
    setGames(g);
    setUsername(loadUsername());
    // Default to whichever colour the player has more games in.
    const whites = g.filter((x) => x.color === 'w').length;
    const blacks = g.length - whites;
    setColor(blacks > whites ? 'b' : 'w');
    setReady(true);
  }, []);

  const { layout, hs, stats, hasGames } = useMemo(() => {
    const tree = buildOpeningTree(games, color);
    const layout = layoutTree(tree);
    const hs = hotspots(tree);
    const gaps = layout.nodes.filter((n) => n.gap).length;
    return {
      layout,
      hs,
      stats: { mapped: layout.nodes.length, gaps, hotspots: hs.length },
      hasGames: tree.games > 0,
    };
  }, [games, color]);

  const byId = useMemo(() => {
    const m: Record<string, LaidNode> = {};
    for (const n of layout.nodes) m[n.pathId] = n;
    return m;
  }, [layout]);

  const initials = (username || 'You').slice(0, 2).toUpperCase();

  return (
    <div className="xray">
      <div className="site-root">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="side-brand">
            <BrandMark size={24} />
            <span className="brand-word">myblunders</span>
          </div>
          <nav className="side-nav">
            {NAV.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={'side-item' + (n.id === 'repertoire' ? ' on' : '')}
              >
                <NavIcon name={n.icon} />
                <span>{n.label}</span>
                {n.id === 'puzzles' && stats.hotspots > 0 && (
                  <span className="side-count">{stats.hotspots}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="side-foot">
            <div className="avatar">{initials}</div>
            <div className="side-user">
              <div className="su-name">{username || 'Your games'}</div>
              <div className="su-rate num">repertoire</div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="site-main">
          <div className="site-head">
            <div className="sh-text">
              <div className="sh-eyebrow">Repertoire X-ray</div>
              <h1 className="sh-title">
                {color === 'w' ? 'White' : 'Black'} <span className="vs">repertoire</span>
                <span className="sh-note"> — how you actually play it</span>
              </h1>
            </div>
            <div className="sh-stats">
              <div className="sh-stat"><span className="v num">{stats.mapped}</span><span className="k">mapped</span></div>
              <div className="sh-stat"><span className="v num">{stats.gaps}</span><span className="k">gaps</span></div>
              <div className="sh-stat"><span className={'v num' + (stats.hotspots ? ' red' : '')}>{stats.hotspots}</span><span className="k">hotspots</span></div>
            </div>
            <div className="seg" role="tablist" aria-label="Repertoire colour">
              <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>White</button>
              <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>Black</button>
            </div>
          </div>

          <div className="site-cols">
            <div className="tree-wrap">
              {!ready ? null : !hasGames ? (
                <div className="empty-xray">
                  <h2>No {color === 'w' ? 'White' : 'Black'} games mapped yet</h2>
                  <p>
                    Import your Lichess games on the <Link href="/">trainer</Link> to build your
                    repertoire X-ray — every game becomes part of the tree.
                  </p>
                </div>
              ) : (
                <div
                  className="tree-canvas"
                  style={{ width: LEFT_PAD + layout.width, height: TOP_PAD + layout.height }}
                >
                  {Array.from({ length: layout.maxDepth + 1 }).map((_, d) => (
                    <div key={d} className="ply-mark" style={{ top: TOP_PAD + d * ROW_H + 40 }}>
                      {String(d + 1).padStart(2, '0')} · {GUTTER[d] ?? 'line'}
                    </div>
                  ))}
                  <svg className="conn-svg" width={LEFT_PAD + layout.width} height={TOP_PAD + layout.height}>
                    {layout.edges.map((e, i) => {
                      const a = byId[e.from];
                      const b = byId[e.to];
                      if (!a || !b) return null;
                      return (
                        <path key={i} d={connectorPath(a, b)} fill="none" stroke="var(--xblue)" strokeOpacity="0.55" strokeWidth="1.5" />
                      );
                    })}
                  </svg>
                  {layout.nodes.map((n) => (
                    <TreeNode key={n.pathId} node={n} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Puzzles rail ── */}
            <aside className="puzzles-rail">
              <div className="pr-head">
                <div className="pr-eyebrow"><IconTarget /> Puzzles from your blunders</div>
                <p className="pr-lead">Generated from the positions where you keep dropping points. Hotspot first.</p>
              </div>
              <div className="pr-list">
                {hs.length === 0 ? (
                  <div className="pr-empty">No blunder hotspots in this repertoire yet — keep importing games.</div>
                ) : (
                  hs.map((h, i) => <PuzzleCard key={h.fen + i} node={h} hot={i === 0} />)
                )}
              </div>
              <div className="pr-foot">
                <button className="start-btn" disabled={hs.length === 0}>
                  Start session <IconArrow />
                </button>
                <div className="pr-foot-note num">
                  {hs.length} puzzle{hs.length === 1 ? '' : 's'}
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function TreeNode({ node }: { node: LaidNode }) {
  const perfClass = node.gap ? 'gap' : 'perf-' + node.perf;
  const scoreClass = node.perf;
  return (
    <div className="xnode" style={{ left: LEFT_PAD + node.x, top: TOP_PAD + node.y, width: CARD_W }}>
      <div className="xnode-board-btn">
        <div className={'xframe ' + perfClass + (node.hotspot ? ' hotspot' : '')}>
          {node.blunders > 0 && (
            <span className="badge-blunder"><IconWarn size={10} /> {node.blunders}</span>
          )}
          {node.collapsed > 0 && <span className="badge-collapse">+{node.collapsed}</span>}
          {node.hotspot && (
            <span className="badge-drill"><IconTarget size={10} /> drill</span>
          )}
          <OpeningBoard fen={node.fen} hl={node.hl} sqSize={10} />
        </div>
      </div>
      <div className="xlabel">
        <div className="xname">
          {node.name && <>{node.name} </>}
          <span className="mv">{node.label}</span>
        </div>
        {node.gap ? (
          <div className="gap-tag"><span className="gdot" />{node.gap}</div>
        ) : (
          <div className="xstat">
            <span className="num">{node.games}g</span>
            <span className="dot-sep" />
            <span className={'score num ' + scoreClass}>{node.score}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PuzzleCard({ node, hot }: { node: TreeNode; hot: boolean }) {
  return (
    <button className={'pz-card' + (hot ? ' hot' : '')}>
      <div className={'pz-thumb' + (hot ? ' hot' : '')}>
        <OpeningBoard fen={node.fen} hl={node.hl} sqSize={7} />
      </div>
      <div className="pz-meta">
        <div className="pz-name">
          {node.name && <>{node.name} </>}
          <span className="mv">{node.label}</span>
        </div>
        <div className="pz-tag">opening</div>
        <div className="pz-rec num">
          reached <b>{node.games}</b> · lost <b className={hot ? 'bad' : ''}>{node.blunders}</b>
        </div>
      </div>
      <div className={'pz-badge' + (hot ? ' hot' : '')}>
        {hot ? <><IconWarn size={10} /> {node.blunders}</> : node.blunders}
      </div>
    </button>
  );
}
