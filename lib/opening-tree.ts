import type { ParsedGame } from './pgn';
import { ecoName } from './eco-names';

/**
 * Opening repertoire model for the Opening Clinic.
 *
 * The trainer already imports a player's games to mine blunder puzzles; this
 * module turns those same games into a per-colour **opening tree**: from the
 * starting position, follow each game ply-by-ply into a trie, tallying at every
 * node how often the player reached it, how they scored from there, and how
 * often they blundered the move out of it. The clinic renders that tree as a
 * top-down grid of mini-boards, loudest at the blunder hotspots.
 *
 * A compact `OpeningGame` summary (one per imported game) is what we persist —
 * the tree itself is derived on demand so pruning/heuristics can evolve without
 * a re-import.
 */

/** Plies (half-moves) of each game we keep for the opening tree. */
export const OPENING_PLIES = 16;
/** Eval drop (centipawns, side-relative) that counts as a blunder out of a node. */
const BLUNDER_CP = 200;

/** Score-% thresholds for the performance colour of a node. */
const PERF = { green: 52, amber: 44 };
/** A node becomes a "hotspot" at this many blundered visits. */
const HOTSPOT_BLUNDERS = 3;
/** Pruning / collapsing knobs that keep the tree legible. */
const MAX_DEPTH = 6; // plies deep we render before collapsing
const MAX_CHILDREN = 3; // siblings rendered per node; the rest fold into +N
const MIN_NODE_GAMES = 2; // drop branches seen fewer times than this
/** A sibling played less than this fraction of the main line is a "gap". */
const GAP_RATIO = 0.5;

export type Perf = 'green' | 'amber' | 'red';
export type GapKind = 'unmapped' | 'leaky';

/** A compact, persistable summary of one imported game for the opening tree. */
export interface OpeningGame {
  gameId: string;
  /** The colour the user played. */
  color: 'w' | 'b';
  /** Result from the user's point of view. */
  result: 'win' | 'loss' | 'draw';
  eco: string;
  /** SAN moves from the start, capped to OPENING_PLIES. */
  moves: string[];
  /** Indices into `moves` where the *user* blundered (drop ≥ BLUNDER_CP, or a
   *  Lichess "Blunder" judgment). The node blamed is the position before it. */
  blunderPlies: number[];
}

/** A node in the rendered opening tree. */
export interface TreeNode {
  /** Stable id = the move path joined by '/', '' for the (virtual) root. */
  id: string;
  /** SAN of the move that reached this node (''for the root). */
  san: string;
  /** Opening name from ECO, shown only where it changes from the parent. */
  name: string;
  /** Pretty move label with number, e.g. "3.e5" / "3…Bf5". */
  label: string;
  /** Full FEN of the position after the move (OpeningBoard slices the board
   *  field; the clinic uses the full FEN to query opening theory). */
  fen: string;
  /** From/to squares of the reaching move, for the last-move highlight. */
  hl: [string, string] | null;
  /** Ply depth (1 = first half-move). Root is 0. */
  depth: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Score % from the user's POV, (wins + draws/2) / games · 100. */
  score: number;
  perf: Perf;
  /** Times the user blundered the move out of this node. */
  blunders: number;
  hotspot: boolean;
  /** Thin/leaky side branch, when set (renders as a dashed gap node). */
  gap: GapKind | null;
  /** Branches folded away under this node (renders as a +N badge). */
  collapsed: number;
  children: TreeNode[];
}

/* ── chess.js is used to walk SANs into FENs + from/to squares. Imported
 *    lazily-ish at call time so this module stays a pure data helper. ── */
import { Chess } from 'chess.js';

function userResult(result: string, color: 'w' | 'b'): 'win' | 'loss' | 'draw' | null {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return null; // '*' or unknown — skip the game
}

function isUser(name: string, username: string): boolean {
  return name.trim().toLowerCase() === username.trim().toLowerCase();
}

/** Cap-able eval, mate clamped to ±10000, white-positive. */
function evalCp(m: { evalCp: number | null; mate: number | null }): number {
  if (m.mate !== null) return m.mate > 0 ? 10000 : -10000;
  return m.evalCp ?? 0;
}

/**
 * Summarize one parsed game into the compact form the tree builder consumes.
 * Returns null when the user isn't in the game or the game has no usable result.
 */
export function summarizeGame(game: ParsedGame, username: string): OpeningGame | null {
  let color: 'w' | 'b' | null = null;
  if (isUser(game.white, username)) color = 'w';
  else if (isUser(game.black, username)) color = 'b';
  if (!color) return null;

  const result = userResult(game.headers['result'] ?? '', color);
  if (!result) return null;

  const plies = game.moves.slice(0, OPENING_PLIES);
  const moves = plies.map((m) => m.san);

  const sign = color === 'w' ? 1 : -1;
  const blunderPlies: number[] = [];
  for (let i = 0; i < plies.length; i++) {
    const mv = plies[i];
    if (mv.color !== color) continue;
    if (mv.judgment === 'Blunder') {
      blunderPlies.push(i);
      continue;
    }
    if (i === 0) continue;
    const drop = (evalCp(plies[i - 1]) - evalCp(mv)) * sign;
    if (drop >= BLUNDER_CP) blunderPlies.push(i);
  }

  return { gameId: game.gameId ?? `${game.white}-${game.black}-${game.date}`, color, result, eco: game.eco, moves, blunderPlies };
}

function perfOf(score: number): Perf {
  if (score >= PERF.green) return 'green';
  if (score >= PERF.amber) return 'amber';
  return 'red';
}

const MOVE_NO = (ply: number) => Math.floor((ply - 1) / 2) + 1;
const moveLabel = (ply: number, san: string) =>
  ply % 2 === 1 ? `${MOVE_NO(ply)}.${san}` : `${MOVE_NO(ply)}…${san}`;

/** Mutable accumulator while building the trie. */
interface RawNode {
  san: string;
  ply: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  blunders: number;
  /** ECO code → count, for the modal opening name at this node. */
  ecos: Map<string, number>;
  children: Map<string, RawNode>;
}

const emptyRaw = (san: string, ply: number): RawNode => ({
  san, ply, games: 0, wins: 0, draws: 0, losses: 0, blunders: 0, ecos: new Map(), children: new Map(),
});

function bumpEco(n: RawNode, eco: string) {
  if (eco) n.ecos.set(eco, (n.ecos.get(eco) ?? 0) + 1);
}

/** Most common ECO code at a node, or '' if none recorded. */
function modalEco(n: RawNode): string {
  let best = '';
  let max = 0;
  for (const [eco, c] of n.ecos) if (c > max) { max = c; best = eco; }
  return best;
}

/**
 * Build the opening tree for one colour from the game summaries: a trie of
 * positions with per-node tallies, then pruned/collapsed and laid out as
 * `TreeNode`s (FENs + move labels resolved with chess.js).
 */
export function buildOpeningTree(games: OpeningGame[], color: 'w' | 'b'): TreeNode {
  const root = emptyRaw('', 0);
  for (const g of games) {
    if (g.color !== color) continue;
    const blunders = new Set(g.blunderPlies);
    let node = root;
    node.games++;
    bump(node, g.result);
    bumpEco(node, g.eco);
    for (let i = 0; i < g.moves.length; i++) {
      if (blunders.has(i)) node.blunders++; // blundered the move out of this node
      const san = g.moves[i];
      let child = node.children.get(san);
      if (!child) { child = emptyRaw(san, i + 1); node.children.set(san, child); }
      child.games++;
      bump(child, g.result);
      bumpEco(child, g.eco);
      node = child;
    }
  }
  // Resolve to TreeNodes with FEN/highlight, pruning + collapsing as we go.
  return resolve(root, new Chess());
}

function bump(n: RawNode, r: 'win' | 'loss' | 'draw') {
  if (r === 'win') n.wins++;
  else if (r === 'loss') n.losses++;
  else n.draws++;
}

function resolve(raw: RawNode, chess: Chess, parentEco = ''): TreeNode {
  const score = raw.games ? ((raw.wins + raw.draws / 2) / raw.games) * 100 : 0;
  let hl: [string, string] | null = null;
  if (raw.san) {
    try {
      const mv = chess.move(raw.san);
      hl = [mv.from, mv.to];
    } catch {
      /* illegal/odd SAN — leave board as-is */
    }
  }
  // Full FEN (not just the board field) so the Opening Clinic can query the
  // Lichess opening explorer for this exact position. OpeningBoard slices off
  // the board field itself.
  const fen = chess.fen();

  // Show the opening name only where it changes from the parent, so the spine
  // is named once at the top rather than repeating down every node.
  const eco = modalEco(raw);
  const name = eco && eco !== parentEco ? (ecoName(eco) ?? '') : '';

  const node: TreeNode = {
    id: '', san: raw.san, name, label: raw.san ? moveLabel(raw.ply, raw.san) : 'Start',
    fen, hl, depth: raw.ply,
    games: raw.games, wins: raw.wins, draws: raw.draws, losses: raw.losses,
    score: Math.round(score), perf: perfOf(score),
    blunders: raw.blunders, hotspot: raw.blunders >= HOTSPOT_BLUNDERS,
    gap: null, collapsed: 0, children: [],
  };

  if (raw.ply < MAX_DEPTH) {
    const kids = [...raw.children.values()].sort((a, b) => b.games - a.games);
    const kept = kids.filter((k) => k.games >= MIN_NODE_GAMES).slice(0, MAX_CHILDREN);
    node.collapsed = kids.length - kept.length;
    const mainGames = kept.length ? kept[0].games : 0; // kept is sorted desc
    for (const k of kept) {
      // Root's children always get a clean baseline so the spine is named.
      const child = resolve(k, new Chess(chess.fen()), raw.ply === 0 ? '' : eco);
      // Gap = a side branch played far less than the main line from this
      // position (a repertoire hole): leaky if it also scores poorly, else
      // just unmapped. The main line itself is never a gap.
      if (kept.length > 1 && k.games < mainGames * GAP_RATIO) {
        child.gap = child.score < 45 ? 'leaky' : 'unmapped';
      }
      node.children.push(child);
    }
  } else {
    node.collapsed = raw.children.size;
  }

  if (raw.san) chess.undo();
  node.id = raw.san; // refined to full path below
  return node;
}

/* ── Tidy top-down layout: depth = row, leaves packed left→right, parents
 *    centered over their children. Connectors are parent-bottom → child-top. ── */
export const CARD_W = 104;
const COL_GAP = 22;
const ROW_H = 180;

export interface LaidNode extends TreeNode { x: number; y: number; pathId: string; }
export interface LaidEdge { from: string; to: string; }
export interface Layout { nodes: LaidNode[]; edges: LaidEdge[]; width: number; height: number; maxDepth: number; }

/**
 * Lay the tree out for rendering. The virtual root isn't drawn; its children
 * are the top row. Returns absolute x/y per node plus parent→child edges.
 */
export function layoutTree(root: TreeNode): Layout {
  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  let cursor = 0; // next free leaf column (in card+gap units)
  let maxDepth = 0;

  const place = (node: TreeNode, depth: number, path: string): number => {
    const pathId = path ? `${path}/${node.san}` : node.san || 'root';
    maxDepth = Math.max(maxDepth, depth);
    let x: number;
    if (node.children.length === 0) {
      x = cursor * (CARD_W + COL_GAP);
      cursor++;
    } else {
      const xs = node.children.map((c) => place(c, depth + 1, pathId));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    const laid: LaidNode = { ...node, x, y: depth * ROW_H, pathId, children: node.children };
    nodes.push(laid);
    for (const c of node.children) edges.push({ from: pathId, to: `${pathId}/${c.san}` });
    return x;
  };

  // Draw the root's children as the top row (skip the virtual start node).
  for (const c of root.children) place(c, 0, '');

  const width = Math.max(CARD_W, cursor * (CARD_W + COL_GAP) - COL_GAP) + CARD_W;
  const height = (maxDepth + 1) * ROW_H;
  return { nodes, edges, width, height, maxDepth };
}

/** Pull every blunder hotspot out of the tree, worst first — feeds the drill queue. */
export function hotspots(root: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => { if (n.hotspot) out.push(n); n.children.forEach(walk); };
  walk(root);
  return out.sort((a, b) => b.blunders - a.blunders || a.score - b.score);
}

/** Path id for a node = its move SANs from the root joined by '/', matching
 *  the ids `layoutTree` assigns. */
export type OpeningEntry = { name: string; games: number; pathId: string };

/**
 * The distinct named openings in the tree (deduped by name, keeping the most-
 * played occurrence), most-played first — drives the clinic's opening filter.
 */
export function namedOpenings(root: TreeNode): OpeningEntry[] {
  const best = new Map<string, OpeningEntry>();
  const walk = (n: TreeNode, path: string) => {
    if (n.name) {
      const cur = best.get(n.name);
      if (!cur || n.games > cur.games) best.set(n.name, { name: n.name, games: n.games, pathId: path });
    }
    for (const c of n.children) walk(c, path ? `${path}/${c.san}` : c.san);
  };
  for (const c of root.children) walk(c, c.san);
  return [...best.values()].sort((a, b) => b.games - a.games);
}

/** Find a node by its path id (SANs joined by '/'), or null. */
export function findByPath(root: TreeNode, pathId: string): TreeNode | null {
  const sans = pathId.split('/');
  let node: TreeNode | undefined = root.children.find((c) => c.san === sans[0]);
  for (let i = 1; node && i < sans.length; i++) node = node.children.find((c) => c.san === sans[i]);
  return node ?? null;
}
