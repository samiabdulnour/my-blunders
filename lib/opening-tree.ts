import type { ParsedGame } from './pgn';
import { lookupOpening } from './opening-book';

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
export const OPENING_PLIES = 24;
/** Eval drop (centipawns, side-relative) that counts as a blunder out of a node. */
const BLUNDER_CP = 200;

/** Score-% thresholds for the performance colour of a node. */
const PERF = { green: 52, amber: 44 };
/** A node becomes a "hotspot" at this many blundered visits. */
const HOTSPOT_BLUNDERS = 3;
/** Pruning / collapsing knobs that keep the tree legible. */
const MAX_CHILDREN = 8; // siblings kept per node in the data; the rest fold into +N
// (the poster shows up to this many variations per position for a dense, busy
//  map; the on-screen clinic caps display lower via its own layout maxChildren)
const MIN_NODE_GAMES = 2; // drop branches seen fewer times than this
/** Rows (plies) drawn at once before deeper lines fold into a drill badge.
 *  20 plies ≈ move 10 for both colours; the trie holds OPENING_PLIES total. */
export const RENDER_ROWS = 20;
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
  /** White-relative eval (cp, mate clamped to ±10000) after each move, parallel
   *  to `moves`; null where the game has no Lichess analysis at that ply. */
  evals: (number | null)[];
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
  /** Opening name for this exact position (from the opening book), shown only
   *  where it changes from the parent's opening. */
  name: string;
  /** The line through this node is still following established theory — this
   *  position (or a continuation of it) is a recognised opening. Computed with
   *  look-ahead so the sparse spots the reference book skips between named
   *  positions don't read as leaving theory. */
  onBook: boolean;
  /** The move that reached this node left theory for good (the parent was on
   *  book, this node and its continuations aren't): the deviation point. */
  deviation: boolean;
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
  /** Average white-relative eval (cp) at this position across games, or null. */
  eval: number | null;
  /** Times the user blundered the move out of this node. */
  blunders: number;
  hotspot: boolean;
  /** Thin/leaky side branch, when set (renders as a dashed gap node). */
  gap: GapKind | null;
  /** Branches folded away under this node (renders as a +N badge). */
  collapsed: number;
  /** Set on the first node of a STUB: a line that didn't earn a column of its
   *  own, kept only as a few boards so the sheet still says "you tried this".
   *  Only a packed layout (`layoutTree({ pack })`) knows how to place one. */
  stub?: boolean;
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
  const evals = plies.map((m) => (m.mate !== null || m.evalCp !== null ? evalCp(m) : null));

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

  return { gameId: game.gameId ?? `${game.white}-${game.black}-${game.date}`, color, result, eco: game.eco, moves, evals, blunderPlies };
}

function perfOf(score: number): Perf {
  if (score >= PERF.green) return 'green';
  if (score >= PERF.amber) return 'amber';
  return 'red';
}

/** White-relative eval (cp) → a compact label: "+0.6", "-1.2", "#". */
export function formatEval(cp: number | null | undefined): string {
  if (cp == null) return '';
  if (cp >= 9000) return '#';
  if (cp <= -9000) return '-#';
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
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
  /** Sum + count of white-relative evals at this position (for the average). */
  evalSum: number;
  evalCount: number;
  children: Map<string, RawNode>;
}

const emptyRaw = (san: string, ply: number): RawNode => ({
  san, ply, games: 0, wins: 0, draws: 0, losses: 0, blunders: 0, evalSum: 0, evalCount: 0, children: new Map(),
});

/**
 * Build the opening tree for one colour from the game summaries: a trie of
 * positions with per-node tallies, then pruned/collapsed and laid out as
 * `TreeNode`s (FENs + move labels resolved with chess.js).
 *
 * `focusPath` (a `pathId`, i.e. a slash-joined SAN path) narrows the poster to
 * one opening: the tree still runs from the initial position, but every line in
 * the budget is opened below that node.
 */
export function buildOpeningTree(
  games: OpeningGame[],
  color: 'w' | 'b',
  minNodeGames: number = MIN_NODE_GAMES,
  maxNodes?: number,
  budget: PosterBudget = POSTER_BUDGET.portrait,
  focusPath?: string | null,
): TreeNode {
  const root = emptyRaw('', 0);
  for (const g of games) {
    if (g.color !== color) continue;
    const blunders = new Set(g.blunderPlies);
    let node = root;
    node.games++;
    bump(node, g.result);
    for (let i = 0; i < g.moves.length; i++) {
      if (blunders.has(i)) node.blunders++; // blundered the move out of this node
      const san = g.moves[i];
      let child = node.children.get(san);
      if (!child) { child = emptyRaw(san, i + 1); node.children.set(san, child); }
      child.games++;
      bump(child, g.result);
      const ev = g.evals?.[i];
      if (ev != null) { child.evalSum += ev; child.evalCount++; } // position eval after this move
      node = child;
    }
  }
  // Optional poster budget. A tidy tree gives every LEAF its own column, so
  // what fits an A1 at a readable board size is a LINE budget (~two dozen
  // columns), not a node count — and an unbounded once-played trie also runs to
  // thousands of nodes (each resolve() below spins up a chess.js instance,
  // which blew the WebView's memory). So spend the budget on LONG lines,
  // best-first: always extend the most-played branch point next, and when a
  // line is opened follow its principal continuation to the very end — the
  // once-played tail included, so main lines run to move 6, 7, 8, 9 … A couple
  // of dozen long parallel lines, breadth only where they part: dense and
  // readable. `maxNodes` stays as a hard memory cap.
  // `focusPath` posters one opening. The sheet still starts from the initial
  // position, so the line down to that opening is kept as a trunk — but the
  // budget is spent entirely BELOW it. Budgeting the whole repertoire and only
  // then narrowing gave a focused poster whatever share of the lines happened
  // to fall inside it, which for a side line was one.
  let focus: RawNode | null = null;
  const trunk: RawNode[] = [];
  if (focusPath) {
    let n: RawNode | undefined = root;
    for (const san of focusPath.split('/')) {
      n = n.children.get(san);
      if (!n) break;
      trunk.push(n);
    }
    focus = n ?? null;
    if (!focus) trunk.length = 0; // unknown path — poster the whole colour
  }

  let keep: Set<RawNode> | undefined;
  let stubRoots: Set<RawNode> | undefined;
  if (maxNodes && maxNodes > 0) {
    const kept = new Set<RawNode>([root, ...trunk]);
    keep = kept;
    const kidsOf = (n: RawNode) =>
      [...n.children.values()]
        .filter((k) => k.games >= minNodeGames)
        .sort((a, b) => b.games - a.games)
        .slice(0, MAX_CHILDREN);
    // First moves follow the poster's own trivia rule (≥2% of games), so a
    // line is never spent on an oddity the layout would drop anyway.
    const topFloor = Math.max(minNodeGames, Math.round(root.games * 0.02));
    const nextIdx = new Map<RawNode, number>(); // per branch point: next child to open
    // Only the focused node (or the root) may start a line, so nothing above it
    // competes for the budget.
    const start = focus ?? root;
    const frontier: RawNode[] = [start];
    let lines = 0;
    const openLine = (start: RawNode) => {
      let n = start;
      for (;;) {
        kept.add(n);
        frontier.push(n);
        if (n.ply >= budget.maxPly) break; // past the last drawn row
        const ks = kidsOf(n);
        if (!ks.length) break;
        nextIdx.set(n, 1); // this walk takes the principal child
        n = ks[0];
      }
      lines++;
    };
    // Which branch gets the next column. 'parent' (the default) asks "which
    // branch POINT is busiest?" and opens its next child whatever that child's
    // own count — so a 600-game 1.e4 opens every reply ever tried, one-offs
    // included, before a 565-game Sicilian gets its second line. 'branch' asks
    // "which BRANCH was played most?" and ranks by the child itself.
    const byBranch = budget.rank === 'branch';
    /** The next branch in rank order, consumed from its branch point. */
    const nextBranch = (): RawNode | null => {
      let best: RawNode | null = null;
      let bestKids: RawNode[] = [];
      let bestScore = -1;
      for (const f of frontier) {
        if (f.ply >= budget.maxPly) continue; // a split here would be invisible
        const ks = f === root ? kidsOf(f).filter((k) => k.games >= topFloor) : kidsOf(f);
        const i = nextIdx.get(f) ?? 0;
        if (i >= ks.length) continue;
        const score = byBranch ? ks[i].games : f.games;
        // Ties: 'parent' keeps its first-found order (unchanged behaviour);
        // 'branch' prefers the earlier split, which shapes more of the tree.
        if (!best || score > bestScore || (byBranch && score === bestScore && f.ply < best.ply)) {
          best = f; bestKids = ks; bestScore = score;
        }
      }
      if (!best) return null;
      const i = nextIdx.get(best) ?? 0;
      nextIdx.set(best, i + 1);
      return bestKids[i];
    };
    while (lines < budget.maxLines && kept.size < maxNodes) {
      const k = nextBranch();
      if (!k) break;
      openLine(k);
    }
    // Stubs: every branch that didn't earn a column, a few boards each — EARLIEST
    // split first, then most played. Early splits are whole openings (the
    // Nimzowitsch you tried once); deep ones are a sideline of something already
    // on the sheet. They only ever fill free space, so this order decides who
    // gets it, not what the frequent lines lose. A stub never joins the
    // frontier — nothing branches off one. (First moves keep the poster's own
    // ≥2% rule, so no stubs at ply 1.)
    if (budget.stubs) {
      stubRoots = new Set<RawNode>();
      const spare: RawNode[] = [];
      for (const f of frontier) {
        if (f === root || f.ply >= budget.maxPly) continue;
        for (const k of kidsOf(f)) if (!kept.has(k)) spare.push(k);
      }
      spare.sort((a, b) => a.ply - b.ply || b.games - a.games);
      for (const k of spare.slice(0, budget.stubs.count)) {
        if (kept.size >= maxNodes) break;
        stubRoots.add(k);
        let n = k;
        for (let len = 1; ; len++) {
          kept.add(n);
          if (len >= budget.stubs.plies || n.ply >= budget.maxPly) break;
          const ks = kidsOf(n);
          if (!ks.length) break;
          n = ks[0];
        }
      }
    }
  }
  // Resolve to TreeNodes with FEN/highlight, pruning + collapsing as we go.
  return resolve(root, new Chess(), '', minNodeGames, keep, stubRoots);
}

/** Node budget for the poster tree: the most an A1 can meaningfully show at a
 *  readable board size, and a safe bound on resolve() memory. */
export const POSTER_MAX_NODES = 1400;

/** A sheet's budget — see POSTER_BUDGET for the shipped values and the why. */
export interface PosterBudget {
  maxLines: number;
  maxPly: number;
  /** Which branch gets the next column: 'branch' = the most PLAYED branch,
   *  'parent' = the next child of the busiest branch point (the original rule,
   *  kept for comparison). See the selection loop in buildOpeningTree. */
  rank?: 'parent' | 'branch';
  /** After the line budget is spent, keep up to `count` of the next-ranked
   *  branches as stubs `plies` boards long (5 from a first reply = "stops after
   *  move 3"). They cost no column: a packed layout tucks them into the sheet's
   *  empty corners and drops any that would widen it. */
  stubs?: { count: number; plies: number };
}

/** What each A1 sheet shape holds, and how it is chosen.
 *
 *  SIZE. A full-depth line needs a column, so lines set the width and plies the
 *  height: `n` lines draw 116n - 12 units wide (the boards' own bounding box —
 *  what the poster fits) and `p` plies draw 18 + 140p units tall. Inside the
 *  margins, the 94pt move-number gutter and the header that is 1518 x 2221pt
 *  portrait, 2218 x 1521pt landscape:
 *
 *    portrait  20 x 24 → height-bound, boards ~63pt, width filled to within 1pt
 *    landscape 29 x 16 → width-bound,  boards ~63.5pt
 *
 *  Same board size either way; each ends on a COMPLETE move (12th / 8th).
 *  `maxPly` must match the rows the poster actually draws: a line budget spent
 *  on branches that diverge below the last drawn row buys columns you can't see.
 *
 *  CHOICE. `rank: 'branch'` gives the columns to the branches PLAYED most. The
 *  old rule ranked by how busy the branch POINT was, which on a real 1000-game
 *  Black repertoire spent 5 of 19 columns on replies tried once — each run to
 *  move 12 — and left out 1.d4 d5 (69 games) and 1.d4 c5 (63) entirely.
 *
 *  STUBS. What doesn't earn a column still appears, a few boards long ("the
 *  Nimzowitsch you tried once stops after move 3"). They cost no width: see
 *  packedLayout. 5 boards from a first reply reaches move 3; 40 is simply more
 *  candidates than ever fit. */
export const POSTER_BUDGET = {
  portrait: { maxLines: 20, maxPly: 24, rank: 'branch', stubs: { count: 40, plies: 5 } },
  landscape: { maxLines: 29, maxPly: 16, rank: 'branch', stubs: { count: 40, plies: 5 } },
} as const;

export type PosterShape = keyof typeof POSTER_BUDGET;

function bump(n: RawNode, r: 'win' | 'loss' | 'draw') {
  if (r === 'win') n.wins++;
  else if (r === 'loss') n.losses++;
  else n.draws++;
}

function resolve(raw: RawNode, chess: Chess, parentName = '', minNodeGames: number = MIN_NODE_GAMES, keep?: Set<RawNode>, stubRoots?: Set<RawNode>): TreeNode {
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

  // Name the node by its *exact position* (the opening book keys on EPD), not by
  // the game's single ECO header — so every position is named correctly and
  // transpositions fold onto the same name. Show the name only where it changes
  // from the parent's effective opening, so the spine is labelled where each
  // variation begins; deeper/unnamed positions inherit the parent's name.
  const found = lookupOpening(fen);
  const posName = found?.name ?? '';
  const effName = posName || parentName;
  const name = posName && posName !== parentName ? posName : '';

  // Whether *this exact position* is a named opening (the start counts as
  // theory). onBook is refined with look-ahead once children are resolved.
  const inBook = raw.ply === 0 ? true : !!found;

  const node: TreeNode = {
    id: '', san: raw.san, name, onBook: inBook, deviation: false, label: raw.san ? moveLabel(raw.ply, raw.san) : 'Start',
    fen, hl, depth: raw.ply,
    games: raw.games, wins: raw.wins, draws: raw.draws, losses: raw.losses,
    score: Math.round(score), perf: perfOf(score),
    eval: raw.evalCount ? Math.round(raw.evalSum / raw.evalCount) : null,
    blunders: raw.blunders, hotspot: raw.blunders >= HOTSPOT_BLUNDERS,
    gap: null, collapsed: 0, children: [],
  };
  if (stubRoots?.has(raw)) node.stub = true;

  // Build the full trie to OPENING_PLIES; the render-depth limit lives in
  // layoutTree, so deeper lines stay in the data and are revealed by drilling.
  const kids = [...raw.children.values()].sort((a, b) => b.games - a.games);
  const kept = kids.filter((k) => (keep ? keep.has(k) : k.games >= minNodeGames)).slice(0, MAX_CHILDREN);
  node.collapsed = kids.length - kept.length;
  const mainGames = kept.length ? kept[0].games : 0; // kept is sorted desc
  for (const k of kept) {
    // Children inherit this node's effective opening, so a name only re-appears
    // when the line enters a genuinely different variation.
    const child = resolve(k, new Chess(chess.fen()), effName, minNodeGames, keep, stubRoots);
    // Gap = a side branch played far less than the main line from this
    // position (a repertoire hole): leaky if it also scores poorly, else
    // just unmapped. The main line itself is never a gap.
    if (kept.length > 1 && k.games < mainGames * GAP_RATIO) {
      child.gap = child.score < 45 ? 'leaky' : 'unmapped';
    }
    node.children.push(child);
  }

  // Theory standard, with look-ahead: this node is "on book" if it's a named
  // position itself OR any kept continuation rejoins the book — so the sparse
  // gaps the reference book leaves between named positions (e.g. the move right
  // after a recapture) don't read as leaving theory. A child is the *deviation*
  // when this node is on book but that child (and all its continuations) isn't:
  // the point where the line leaves theory for good.
  node.onBook = inBook || node.children.some((c) => c.onBook);
  for (const c of node.children) c.deviation = node.onBook && !c.onBook;

  if (raw.san) chess.undo();
  node.id = raw.san; // refined to full path below
  return node;
}

/* ── Tidy top-down layout: depth = row, leaves packed left→right, parents
 *    centered over their children. Connectors are parent-bottom → child-top. ── */
export const CARD_W = 120;
export const COL_GAP = 22;
export const ROW_H = 188;

/** `more` = lines hidden below this node (pruned siblings + plies past the
 *  render limit) — drill into the node (re-root) to reveal them. pathId is the
 *  absolute move path, so it can become the focus root directly. */
export interface LaidNode extends TreeNode { x: number; y: number; pathId: string; more: number; }
export interface LaidEdge { from: string; to: string; }
export interface Layout { nodes: LaidNode[]; edges: LaidEdge[]; width: number; height: number; maxDepth: number; }

export interface LayoutOpts {
  /** Top row to draw (default: the tree's first moves). For a focused view,
   *  pass the focus node alone. */
  topNodes?: TreeNode[];
  /** Absolute path prefix for the top row's ids (the focus node's parent path). */
  basePath?: string;
  /** Plies to draw before deeper lines fold into a drill badge. */
  maxRows?: number;
  /** Spacing overrides (the PDF poster packs tighter than the on-screen clinic).
   *  Default to the module constants, so the clinic layout is unchanged. */
  cardW?: number;
  colGap?: number;
  rowH?: number;
  /** Drop children played fewer than this many games (the poster prunes
   *  insignificant lines; the clinic passes 0 = keep all). */
  minGames?: number;
  /** Cap the siblings drawn per node (most-played first). The poster narrows
   *  this for portrait ("longer lines, fewer branches"); the clinic leaves it
   *  unset = show all kept children. */
  maxChildren?: number;
  /** Past this depth (ply), follow only the single most-played child, so main
   *  lines keep running deep (move 6, 7, 8 …) instead of fanning out. The poster
   *  lowers this to make a tall, narrow tree that fills a PORTRAIT sheet without
   *  dropping depth; unset = branch at every level (landscape / clinic). */
  branchDepth?: number;
  /** Pack subtrees by their OUTLINES instead of giving every leaf a column, and
   *  place the tree's stubs (see PosterBudget.stubs) wherever they fit without
   *  making the sheet wider than `maxCols`. See packedLayout. */
  pack?: { maxCols: number };
}

/**
 * Lay the tree out for rendering. Top-down: depth = row, leaves packed left→
 * right, parents centred. Only `maxRows` plies are drawn; nodes at the limit
 * carry a `more` count so the UI can offer to drill deeper.
 */
export function layoutTree(root: TreeNode, opts: LayoutOpts = {}): Layout {
  const topNodes = opts.topNodes ?? root.children;
  const basePath = opts.basePath ?? '';
  const maxRows = opts.maxRows ?? RENDER_ROWS;
  const cardW = opts.cardW ?? CARD_W;
  const colGap = opts.colGap ?? COL_GAP;
  const rowH = opts.rowH ?? ROW_H;
  const minGames = opts.minGames ?? 0;
  const maxChildren = opts.maxChildren ?? Infinity;
  const branchDepth = opts.branchDepth ?? Infinity;
  if (opts.pack) {
    return packedLayout(topNodes, basePath, { maxRows, cardW, colGap, rowH, minGames, maxChildren, branchDepth, maxCols: opts.pack.maxCols });
  }
  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  let cursor = 0; // next free leaf column (in card+gap units)
  let maxDepth = 0;

  const place = (node: TreeNode, depth: number, path: string): number => {
    const pathId = path ? `${path}/${node.san}` : node.san || 'root';
    maxDepth = Math.max(maxDepth, depth);
    // Branch (up to maxChildren) only while shallow; past branchDepth follow just
    // the single main line, so long continuations run on without widening the
    // tree. Lines only include moves played ≥ minGames (once-played moves aren't
    // significant enough for the poster).
    const cap = depth < branchDepth ? maxChildren : 1;
    const renderKids =
      depth + 1 < maxRows
        ? node.children.filter((c) => c.games >= minGames).slice(0, cap)
        : [];
    let x: number;
    if (renderKids.length === 0) {
      x = cursor * (cardW + colGap);
      cursor++;
    } else {
      const xs = renderKids.map((c) => place(c, depth + 1, pathId));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    const more = node.collapsed + (node.children.length - renderKids.length);
    const laid: LaidNode = { ...node, x, y: depth * rowH, pathId, more, children: node.children };
    nodes.push(laid);
    for (const c of renderKids) edges.push({ from: pathId, to: `${pathId}/${c.san}` });
    return x;
  };

  for (const c of topNodes) place(c, 0, basePath);

  const width = Math.max(cardW, cursor * (cardW + colGap) - colGap) + cardW;
  const height = (maxDepth + 1) * rowH;
  return { nodes, edges, width, height, maxDepth };
}

/** One laid-out subtree: where each child sits relative to its parent, and the
 *  subtree's outline — leftmost/rightmost x at every row below the root, in
 *  columns, relative to the root. */
interface Shape { node: TreeNode; kids: Shape[]; rel: number[]; left: number[]; right: number[] }

/**
 * Tidy layout that packs by OUTLINE (Reingold–Tilford's idea) rather than
 * handing every leaf its own full-height column.
 *
 * In the column layout a line that stops early still owns its column to the
 * bottom of the sheet — the space under it is dead. Here a subtree is pushed
 * left until its outline meets its neighbour's, row by row; rows the neighbour
 * doesn't reach put up no resistance, so a deep line slides UNDER a short one.
 * Nothing ever crosses: subtrees keep their left-to-right order on every row
 * they share, and a parent sits within its own children's span.
 *
 * That is what makes stubs free. The most-played line is always the leftmost
 * child, so it steps left at every split and leaves an empty triangle at the
 * sheet's top-left — dead space on every poster. Stubs are ordered FIRST among
 * their siblings, which drops them into that triangle, and the main subtree
 * slides back underneath. Each stub is tried at its full length, then 3 boards,
 * then 1, and dropped if even that would widen the sheet past `maxCols`.
 */
function packedLayout(
  topNodes: TreeNode[],
  basePath: string,
  o: { maxRows: number; cardW: number; colGap: number; rowH: number; minGames: number; maxChildren: number; branchDepth: number; maxCols: number },
): Layout {
  /** Active stubs → how many boards of each to draw. */
  const stubLen = new Map<TreeNode, number>();

  // `room`: boards still allowed below this node — Infinity on a normal line,
  // counting down along a stub.
  const shape = (node: TreeNode, depth: number, room: number): Shape => {
    let kids: TreeNode[] = [];
    if (depth + 1 < o.maxRows && room > 0) {
      const cap = depth < o.branchDepth ? o.maxChildren : 1;
      const regular = node.children.filter((c) => !c.stub && c.games >= o.minGames).slice(0, cap);
      const stubs = room === Infinity ? node.children.filter((c) => c.stub && stubLen.has(c)) : [];
      kids = [...stubs, ...regular];
    }
    const subs = kids.map((k) => shape(k, depth + 1, k.stub ? (stubLen.get(k) ?? 1) - 1 : room === Infinity ? Infinity : room - 1));
    if (!subs.length) return { node, kids: [], rel: [], left: [0], right: [0] };
    const offs: number[] = [];
    const accL: number[] = [];
    const accR: number[] = [];
    subs.forEach((sb, i) => {
      let off = 0;
      if (i > 0) {
        off = -Infinity;
        for (let d = 0; d < sb.left.length && d < accR.length; d++) off = Math.max(off, accR[d] - sb.left[d] + 1);
      }
      offs.push(off);
      for (let d = 0; d < sb.left.length; d++) {
        accL[d] = Math.min(accL[d] ?? Infinity, sb.left[d] + off);
        accR[d] = Math.max(accR[d] ?? -Infinity, sb.right[d] + off);
      }
    });
    const mid = (offs[0] + offs[offs.length - 1]) / 2; // parent centred over first…last child
    return { node, kids: subs, rel: offs.map((v) => v - mid), left: [0, ...accL.map((v) => v - mid)], right: [0, ...accR.map((v) => v - mid)] };
  };

  // A virtual root holds the first moves so they pack against each other too.
  const virtualRoot = { children: topNodes, stub: false } as unknown as TreeNode;
  const build = () => shape(virtualRoot, -1, Infinity);
  const colsOf = (sh: Shape) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let d = 1; d < sh.left.length; d++) { lo = Math.min(lo, sh.left[d]); hi = Math.max(hi, sh.right[d]); }
    return Number.isFinite(lo) ? hi - lo + 1 : 1;
  };

  // Stubs, earliest split first (then most played) — the builder's own order:
  // each kept only if the sheet stays within the width it already had.
  const found: { node: TreeNode; depth: number }[] = [];
  const hunt = (n: TreeNode, depth: number) => {
    for (const c of n.children) {
      if (c.stub) found.push({ node: c, depth: depth + 1 });
      else hunt(c, depth + 1);
    }
  };
  hunt(virtualRoot, -1);
  found.sort((a, b) => a.depth - b.depth || b.node.games - a.node.games);
  const limit = Math.max(o.maxCols, colsOf(build())) + 1e-6;
  for (const st of found) {
    let full = 1;
    for (let n = st.node; n.children.length; n = n.children[0]) full++;
    for (const len of [...new Set([full, 3, 1])].filter((l) => l <= full)) {
      stubLen.set(st.node, len);
      if (colsOf(build()) <= limit) break;
      stubLen.delete(st.node);
    }
  }

  const top = build();
  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  const unit = o.cardW + o.colGap;
  let maxDepth = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  const emit = (sh: Shape, x: number, depth: number, path: string) => {
    const pathId = path ? `${path}/${sh.node.san}` : sh.node.san || 'root';
    maxDepth = Math.max(maxDepth, depth);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    const more = sh.node.collapsed + (sh.node.children.length - sh.kids.length);
    nodes.push({ ...sh.node, x, y: depth * o.rowH, pathId, more, children: sh.node.children });
    sh.kids.forEach((k, i) => {
      edges.push({ from: pathId, to: `${pathId}/${k.node.san}` });
      emit(k, x + sh.rel[i], depth + 1, pathId);
    });
  };
  top.kids.forEach((k, i) => emit(k, top.rel[i], 0, basePath));
  // Columns → layout units, shifted so the leftmost board sits at x = 0.
  const shift = Number.isFinite(minX) ? minX : 0;
  for (const n of nodes) n.x = (n.x - shift) * unit;
  const cols = Number.isFinite(minX) ? maxX - minX + 1 : 1;
  const width = Math.max(o.cardW, cols * unit - o.colGap) + o.cardW;
  return { nodes, edges, width, height: (maxDepth + 1) * o.rowH, maxDepth };
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
export type OpeningEntry = { name: string; games: number; pathId: string; score: number; perf: Perf };

/**
 * The distinct named openings in the tree (deduped by name, keeping the most-
 * played occurrence), most-played first — drives the clinic's opening filter.
 */
export function namedOpenings(root: TreeNode): OpeningEntry[] {
  const best = new Map<string, OpeningEntry>();
  const walk = (n: TreeNode, path: string) => {
    if (n.name) {
      const cur = best.get(n.name);
      if (!cur || n.games > cur.games) {
        best.set(n.name, { name: n.name, games: n.games, pathId: path, score: n.score, perf: n.perf });
      }
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

/** One position to practice in the Opening Drill (the user is to move). */
export interface DrillItem {
  fen: string;
  color: 'w' | 'b';
  /** Moves leading here, e.g. "1.e4 c6 2.d4 d5 3.e5 Bf5". */
  line: string;
  name: string;
  reached: number;
  blundered: number;
  /** The move you most often play from here (your habit — may be the leak). */
  usualSan: string | null;
}

/** Render a SAN path as a numbered line: "1.e4 c6 2.d4 d5 …". */
export function lineString(sans: string[]): string {
  let out = '';
  for (let i = 0; i < sans.length; i++) {
    const ply = i + 1;
    if (ply % 2 === 1) out += (out ? ' ' : '') + `${(ply + 1) / 2}.${sans[i]}`;
    else out += ` ${sans[i]}`;
  }
  return out;
}

/**
 * Positions worth drilling for one colour: nodes where it's the user's turn and
 * they have a leak — they blundered here, or their habitual move loses eval vs.
 * a played alternative. Worst first. The drill computes the exact best move with
 * the engine; this just picks the positions.
 */
export function weakSpots(root: TreeNode, color: 'w' | 'b'): DrillItem[] {
  const sign = color === 'w' ? 1 : -1;
  const out: (DrillItem & { weakness: number })[] = [];
  const walk = (n: TreeNode, sans: string[], name: string) => {
    const nm = n.name || name;
    const userToMove = (n.fen.split(' ')[1] ?? 'w') === color;
    if (n.san && userToMove && n.children.length > 0) {
      const usual = [...n.children].sort((a, b) => b.games - a.games)[0];
      const userEvals = n.children.filter((k) => k.eval != null).map((k) => (k.eval as number) * sign);
      let evalLoss = 0;
      if (usual.eval != null && userEvals.length) evalLoss = Math.max(...userEvals) - (usual.eval as number) * sign;
      if (n.blunders > 0 || evalLoss >= 40) {
        out.push({
          fen: n.fen, color, line: lineString(sans), name: nm,
          reached: n.games, blundered: n.blunders, usualSan: usual?.san ?? null,
          weakness: n.blunders * 1000 + Math.max(0, evalLoss),
        });
      }
    }
    for (const c of n.children) walk(c, [...sans, c.san], nm);
  };
  for (const c of root.children) walk(c, [c.san], c.name || '');
  return out
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, 24)
    .map(({ weakness: _weakness, ...d }) => d);
}
