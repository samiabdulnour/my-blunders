/**
 * Export the opening tree as an A1 PDF poster — the whole repertoire for one
 * colour on a single sheet. Everything is drawn as vector primitives (board
 * squares, connector curves, move/eval text) except the pieces, which are the
 * app's cburnett SVGs rasterised once each and referenced by alias, so the file
 * stays small no matter how many boards it holds.
 *
 * The geometry comes straight from `layoutTree` (the same layout the on-screen
 * clinic uses); the padding/row constants below mirror OpeningClinic so the
 * poster reads exactly like the tree you see in the app.
 *
 * Delivery: the native share sheet when the platform can share files (this is
 * what surfaces "Save to Files" / Print inside the iOS app), falling back to a
 * plain download on desktop web.
 */
import { layoutTree, findByPath, formatEval, POSTER_BUDGET, RENDER_ROWS, type TreeNode, type LaidNode } from './opening-tree';
import { loadUsername } from './storage';

// The poster packs far tighter than the on-screen clinic — small boards nearly
// touching, a compact score under each, orthogonal connectors — so it defines
// its own layout metrics (passed to layoutTree) rather than the clinic's looser
// ones. layoutTree() gives node x/y; these place the board + score within.
const TOP_PAD = 18;
const LEFT_PAD = 16;
const BOARD_SQ = 12;
const BOARD = BOARD_SQ * 8; // 96
const CARD_W = 104; // board + slim side padding, so columns sit close together
const COL_GAP = 12; // tight gap between sibling columns
const ROW_H = 140; // name band + board + score + connector gap
const TOP_INSET = 22; // reserved above the board for the arrow + up to 2 name lines
const CARD_BOTTOM = 132; // a connector leaves the parent here (below board + score)
const FILES = 'abcdefgh';

// Print palette (fixed, not theme-driven — a poster is a poster).
const C_LIGHT = '#ecebde';
const C_DARK = '#93a97f';
const C_HL = '#e6dd86';
const C_FRAME = '#cfc9ba';
const C_TEXT = '#1b1a16';
const C_DIM = '#6d6656';
const C_GREEN = '#3f9b57';
const C_YELLOW = '#d3a139';
const C_RED = '#d5533f';
const C_NEUTRAL = '#c7c0b2';
const C_PAPER = '#ffffff'; // pure white — this gets printed
const C_HEAD_DIM = '#929291'; // neutral grey for the header table, rules and move numbers

/* ── Poster furniture ──────────────────────────────────────────────────────
 * Measured from the InDesign layout this poster is set to (A1 portrait,
 * 1683.78 x 2383.94pt). All y values are from the PAGE TOP, matching jsPDF.
 * The header is a two-row stats table on the left, three headings plus the
 * legend on the right, under one rule; move numbers run down a left gutter.  */
const PAGE_MARGIN = 36;
/** Move-number column; the tree starts at PAGE_MARGIN + this. */
const GUTTER_W = 136;
/** Layout origin for the tree — puts row 0's board top at ~176pt, clear of the
 *  header rule at 129pt. */
const TREE_TOP = 149.3;

const HEAD_SIZE = 24;
const LEG_SIZE = 12;
const HEAD_TITLE_BASE = 55.2027; // bold headings
const HEAD_STAT1_BASE = 59.2027; // nickname / games / overall
const HEAD_STAT2_BASE = 105.191; // W / D / L
const HEAD_LEG1_BASE = 101.3116;
const HEAD_LEG2_BASE = 115.7115;
const HEAD_COL_X = [40, 204.3596, 368.7191]; // left stats columns
const HEAD_DIV_X = [195.1181, 359]; // rules between them
const HEAD_DIV_TOP = 36.003;
const HEAD_RULE_Y = 128.9796; // the rule under the whole header
const RULE_W = 2;
/** Right-hand block, held as offsets from the right content edge so it stays
 *  anchored to the margin whatever the sheet width. */
const HEAD_R_TITLE = 912.75; // "<COLOUR> REPERTOIRE" + the legend below it
const HEAD_R_MID = 541.41; // "OPENING TREE"
/** InDesign tracks the bold caps ~0.02em; jsPDF calls this char spacing. */
const HEAD_TRACK = 0.02;
/** Gruezi cap height as a fraction of font size — a move number's cap top sits
 *  on its row's board top. */
const CAP_RATIO = 0.708;

/** The app's own typeface, embedded so the sheet is set in it rather than
 *  Helvetica. jsPDF can only embed TrueType, so these are TTF conversions of the
 *  OTFs the UI loads; fetched at print time rather than bundled (~75KB each). */
const FONT = 'Gruezi';
const FONT_FILES: [string, string][] = [
  ['RL-Gruezi-C-Bold.ttf', 'bold'],
  ['RL-Gruezi-C-Regular.ttf', 'normal'],
];
/** Where `scripts/otf2ttf.py` publishes the family's tabular figures — its
 *  `tnum` glyphs, all 600 units wide — in the embedded faces. PDF text can't
 *  ask for an OpenType feature, so a column that has to line up addresses those
 *  glyphs directly; everything else keeps the proportional figures, as the
 *  InDesign layout this poster follows does. */
const TAB_ZERO = 0xe030;
const tabular = (s: string) => s.replace(/\d/g, (d) => String.fromCharCode(TAB_ZERO + +d));

let fontData: { file: string; style: string; b64: string }[] | null = null;
async function loadPosterFonts() {
  if (fontData) return fontData;
  const out: { file: string; style: string; b64: string }[] = [];
  for (const [file, style] of FONT_FILES) {
    const buf = await fetch(`/fonts/${file}`).then((r) => r.arrayBuffer());
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    out.push({ file, style, b64: btoa(bin) });
  }
  fontData = out;
  return out;
}

function winProb(cp: number): number {
  return 1 / (1 + Math.pow(10, -cp / 400));
}

/** Connector colour: how much the parent→child move hurt the side that played
 *  it (mirrors edgeStroke in OpeningClinic). */
function edgeColor(parentFen: string, pe: number | null, ce: number | null): string {
  if (pe == null || ce == null) return C_NEUTRAL;
  const whiteToMove = parentFen.split(' ')[1] === 'w';
  const before = whiteToMove ? winProb(pe) : 1 - winProb(pe);
  const after = whiteToMove ? winProb(ce) : 1 - winProb(ce);
  const drop = before - after;
  if (drop >= 0.2) return C_RED;
  if (drop >= 0.1) return C_YELLOW;
  return C_GREEN;
}

/** The most-played named opening within a subtree (its "headline"), or null —
 *  used to title each first-move branch sheet ("Sicilian Defense", …). */
function dominantName(node: TreeNode): string | null {
  let bestName: string | null = null;
  let bestGames = -1;
  const walk = (n: TreeNode) => {
    if (n.name && n.games > bestGames) {
      bestName = n.name;
      bestGames = n.games;
    }
    for (const c of n.children) walk(c);
  };
  // Skip the branch root's own (usually generic) name — "King's Pawn Game" for
  // 1.e4 — and title by the opening actually played beneath it (e.g. Sicilian).
  for (const c of node.children) walk(c);
  return bestName;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** FEN board field → 8×8 grid, row 0 = rank 8, col 0 = a-file. */
function fenGrid(fen: string): (string | null)[][] {
  return fen.split(' ')[0].split('/').map((row) => {
    const out: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push(ch);
    }
    return out;
  });
}

/** Rasterise the 12 cburnett pieces to PNG data-URIs (once). Keyed by FEN char
 *  (uppercase = white). Failures are skipped — a missing piece just isn't drawn. */
async function rasterizePieces(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const raster = (svg: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const S = 128;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = S;
        cv.height = S;
        const ctx = cv.getContext('2d');
        if (!ctx) return reject(new Error('no 2d context'));
        ctx.drawImage(img, 0, 0, S, S);
        resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('svg load failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  const jobs: Promise<void>[] = [];
  for (const P of ['P', 'N', 'B', 'R', 'Q', 'K']) {
    for (const c of ['w', 'b'] as const) {
      const key = c === 'w' ? P : P.toLowerCase();
      jobs.push(
        fetch(`/pieces/cburnett/${c}${P}.svg`)
          .then((r) => r.text())
          .then(raster)
          .then((png) => void map.set(key, png))
          .catch(() => {})
      );
    }
  }
  await Promise.all(jobs);
  return map;
}

async function saveOrShare(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & {
    canShare?: (d: unknown) => boolean;
    share?: (d: unknown) => Promise<void>;
  };
  // Native share sheet first — this is how the iOS app hands off a file (Save to
  // Files, Print, AirDrop…). Only used when the platform reports it can share files.
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return;
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return; // user cancelled
      // otherwise fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface OpeningPdfOpts {
  /** Print only this node's subtree (its pathId); omit/null for the whole tree. */
  focusPath?: string | null;
  /** Opening name for the heading + filename when focused. */
  focusName?: string | null;
  /** Depth cap in plies, or 'auto' (default) to fit A1 at a readable board size.
   *  RENDER_ROWS = 20 = 10 full moves is the deepest the tree renders. */
  maxPlies?: number | 'auto';
  /** Sheet orientation (default 'portrait'). */
  orientation?: 'portrait' | 'landscape';
  /** Engine evals by FEN (white-relative cp), overriding the sparse per-game
   *  evals so every board can show one. See fillPosterEvals(). */
  evals?: Map<string, number>;
}

/** What a build produced: the PDF blob plus how to name/announce it. */
export interface BuiltPdf {
  blob: Blob;
  filename: string;
  title: string;
  /** Number of A1 sheets in the document. */
  pages: number;
  /** For 'full' (export all): the branch each sheet covers, in order. */
  branches: string[];
}

/**
 * Draw the A1 poster of `tree` into a jsPDF-shaped document from `makeDoc`
 * (a real jsPDF for the PDF, or a CanvasPdf for the on-screen preview). By
 * default it's the whole repertoire for `color`; `focusPath` posters one
 * opening's subtree, `maxPlies` controls depth, `orientation` the page.
 */
async function renderPoster(
  makeDoc: (orient: 'portrait' | 'landscape') => Promise<any> | any, // eslint-disable-line @typescript-eslint/no-explicit-any
  tree: TreeNode,
  color: 'w' | 'b',
  opts: OpeningPdfOpts
): Promise<{ doc: any; filename: string; title: string; pages: number; branches: string[]; fens: string[] }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const focusNode = opts.focusPath ? findByPath(tree, opts.focusPath) : null;

  // Player nickname + a small account snapshot for the header. Totals are summed
  // over the repertoire's first moves — i.e. every game the tree was built from.
  const nickname = (loadUsername() || '').trim();
  const acctGames = tree.children.reduce((s, c) => s + c.games, 0);
  const acctW = tree.children.reduce((s, c) => s + c.wins, 0);
  const acctD = tree.children.reduce((s, c) => s + c.draws, 0);
  const acctL = tree.children.reduce((s, c) => s + c.losses, 0);
  const acctScore = acctGames ? Math.round(((acctW + acctD / 2) / acctGames) * 100) : 0;
  // The header table reads as two rows of three: who/how many/how well, then
  // the W-D-L split beneath each.
  const statCells: [string, string][] = [
    [nickname || '—', `${acctW}W`],
    [`${acctGames} games`, `${acctD}D`],
    [`${acctScore}% overall`, `${acctL}L`],
  ];
  // ── One sheet, standardised board size ────────────────────────────────────
  // The whole repertoire (or focused opening) on ONE A1 sheet. Boards are drawn
  // at a fixed size (below), the SAME on every poster so White and Black read as
  // a matching pair — we fit by reducing how much of the tree shows, never by
  // shrinking the boards.

  // Drop trivial first moves — rare openings that go nowhere (1.g4, 1.d3 …) and
  // would sit as isolated move-1 boards, wasting space better spent on the main
  // lines' deeper continuations. Keep any first move played in ≥2% of games.
  const totalGames = acctGames;
  const TRIVIAL_TOP = Math.max(2, Math.round(totalGames * 0.02));
  const topMoves = tree.children.filter((c) => c.games >= TRIVIAL_TOP);

  const layoutAt = (o: {
    mg: number;
    maxRows: number;
    maxChildren?: number;
    branchDepth?: number;
  }) =>
    layoutTree(tree, {
      topNodes: focusNode ? [focusNode] : topMoves,
      basePath: '',
      maxRows: o.maxRows,
      cardW: CARD_W,
      colGap: COL_GAP,
      rowH: ROW_H,
      minGames: o.mg,
      maxChildren: o.maxChildren,
      branchDepth: o.branchDepth,
    });

  const orient: 'portrait' | 'landscape' = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
  const portrait = orient === 'portrait';
  const doc = await makeDoc(orient);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // Embed the app's typeface (real PDF only — the canvas preview uses the web
  // font by family name). Falls back to the built-in face if the files 404.
  if (typeof doc.addFileToVFS === 'function') {
    try {
      for (const f of await loadPosterFonts()) {
        doc.addFileToVFS(f.file, f.b64);
        doc.addFont(f.file, FONT, f.style);
      }
    } catch { /* keep the default face */ }
  }
  // The tree sits right of the move-number gutter and below the header rule.
  const treeLeft = PAGE_MARGIN + GUTTER_W;
  const avail = { w: pageW - PAGE_MARGIN - treeLeft, h: pageH - PAGE_MARGIN - TREE_TOP };

  const scaleFit = (lay: { width: number; height: number }) =>
    Math.min(avail.w / (LEFT_PAD + lay.width), avail.h / (TOP_PAD + lay.height));

  // Fill the sheet. Board size is chosen to fit the shaped tree as large as it
  // will go, so a poster is never half-empty. Shape the tree to the sheet first:
  //   • PORTRAIT (tall): keep full depth; narrow the branch depth while the sheet
  //     is width-bound, so long main lines run top-to-bottom and fill the height;
  //   • LANDSCAPE (wide): keep breadth, run shallower, prune least-played to fit.
  // Then boards scale up to the largest size that fits — filling the sheet — with
  // a readable floor below which we prune the least-played lines instead.
  const DEEP = RENDER_ROWS + 4;
  const MIN_BOARD_PT = 26; // allow a dense, busy map (small boards) before pruning
  // Rows come from the same budget the tree was built against, so the sheet
  // never draws fewer plies than the lines were spent on (that mismatch left
  // landscape two-thirds empty).
  const maxRows = POSTER_BUDGET[orient].maxPly;
  const branchDepth = DEEP;
  let minGames = 1; // show every line you've played (the poster tree keeps ≥1)
  const build = () => layoutAt({ mg: minGames, maxRows, maxChildren: 8, branchDepth });
  let layout = build();
  // Shape the tree to the sheet's aspect so scale-to-fit fills BOTH dimensions
  // instead of leaving half the sheet blank:
  // No branch-depth narrowing: the poster tree is already budgeted to a couple
  // of dozen long lines (see buildOpeningTree's line budget), which fit the
  // sheet side by side at a readable size — so every kept line is drawn and
  // scale-to-fit sizes the boards. (Narrowing only ever made sense for an
  // unbounded tree; on a budgeted one it just threw lines away.)
  // (Landscape keeps its natural breadth+depth: an opening tree is deep, so it's
  //  portrait-shaped and can't fill a wide sheet without splitting into separate
  //  side-by-side trees — which reads worse. Portrait is the fuller orientation.)

  // Very large repertoire: if boards are still below the readable floor, prune the
  // least-played lines until they clear it.
  while (scaleFit(layout) * BOARD < MIN_BOARD_PT && minGames <= 400 && layout.nodes.length > 3) {
    minGames = Math.round(minGames * 1.7) + 2;
    layout = build();
  }
  // Fill the sheet, but cap the boards at native size so a small repertoire gets
  // a full, well-proportioned sheet instead of a few giant boards.
  const MAX_BOARD_PT = 96;
  const S = Math.min(scaleFit(layout), MAX_BOARD_PT / BOARD);

  const pieces = await rasterizePieces();

  const named = layout.nodes.filter((n) => n.name).length;
  const title = focusNode
    ? opts.focusName || focusNode.name || 'Opening line'
    : `${color === 'w' ? 'White' : 'Black'} repertoire`;
  const legendLine1 =
    'Under each board: the move, the engine eval in pawns (+ favours White), then your record from that position as wins/draws/losses. Games played is top-left.';
  const legendLine2 =
    'Green strong · amber even · red weak. Connector colour grades the move: green good · amber risky · red blunder.';
  const branches: string[] = [];

  // layout.width carries a trailing card of padding and LEFT_PAD leads it, so
  // centring on it leaves visibly different margins. Centre the BOARDS' own
  // bounding box on the page instead, for equal borders left and right.
  const nodeMinX = layout.nodes.reduce((m, n) => Math.min(m, n.x), Infinity);
  const nodeMaxX = layout.nodes.reduce((m, n) => Math.max(m, n.x), -Infinity);
  const contentW = Number.isFinite(nodeMinX) ? nodeMaxX - nodeMinX + CARD_W : layout.width;
  const treeW = LEFT_PAD + layout.width;
  const treeH = TOP_PAD + layout.height;
  // Scale-to-fit fills the binding axis; centre the slack on the other so the
  // tree sits balanced on the sheet.
  const offX = treeLeft + Math.max(0, (avail.w - contentW * S) / 2) - (LEFT_PAD + nodeMinX) * S;
  const offY = TREE_TOP;
  const X = (lx: number) => offX + lx * S;
  const Y = (ly: number) => offY + ly * S;
  const L = (len: number) => len * S;

  const fill = (hex: string) => { const [r, g, b] = hexToRgb(hex); doc.setFillColor(r, g, b); };
  const stroke = (hex: string) => { const [r, g, b] = hexToRgb(hex); doc.setDrawColor(r, g, b); };
  const text = (hex: string) => { const [r, g, b] = hexToRgb(hex); doc.setTextColor(r, g, b); };

  // Engine evals (when the caller has run a pass) win over the per-game average:
  // they cover every position, not just the ~1 in 5 from an analysed game.
  const evalOf = (n: { fen: string; eval: number | null }): number | null =>
    opts.evals?.get(n.fen) ?? n.eval;

  const byId: Record<string, LaidNode> = {};
  for (const n of layout.nodes) byId[n.pathId] = n;

  // Draw the sheet (the fitted layout + header) at the computed offset/scale.
  const drawContent = () => {
  // ── Paper background (so the poster reads on any viewer / printer) ─────────
  fill(C_PAPER);
  doc.rect(0, 0, pageW, pageH, 'F');

  // ── Header ────────────────────────────────────────────────────────────────
  // Left: a two-row stats table, three columns divided by rules. Right: the
  // headings, with the legend beneath. One rule closes the band.
  const contentRight = pageW - PAGE_MARGIN;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(HEAD_SIZE);
  text(C_HEAD_DIM);
  statCells.forEach(([top, bottom], i) => {
    doc.text(top, HEAD_COL_X[i], HEAD_STAT1_BASE);
    doc.text(bottom, HEAD_COL_X[i], HEAD_STAT2_BASE);
  });

  doc.setFont(FONT, 'bold');
  doc.setCharSpace(HEAD_TRACK * HEAD_SIZE);
  text(C_TEXT);
  // The heading block keeps its spacing from the layout and hangs off the right
  // margin, the same on both orientations.
  const blockLeft = contentRight - HEAD_R_TITLE;
  doc.text(title.toUpperCase(), blockLeft, HEAD_TITLE_BASE);
  doc.text('OPENING TREE', contentRight - HEAD_R_MID, HEAD_TITLE_BASE);
  doc.text(`${named} NAMED LINES`, contentRight, HEAD_TITLE_BASE, { align: 'right' });
  doc.setCharSpace(0);

  // Legend, wrapped to the width the headings span.
  doc.setFont(FONT, 'normal');
  doc.setFontSize(LEG_SIZE);
  text(C_HEAD_DIM);
  doc.text(legendLine1, blockLeft, HEAD_LEG1_BASE);
  doc.text(legendLine2, blockLeft, HEAD_LEG2_BASE);

  stroke(C_HEAD_DIM);
  doc.setLineWidth(RULE_W);
  for (const dx of HEAD_DIV_X) doc.line(dx, HEAD_DIV_TOP, dx, HEAD_RULE_Y);
  doc.line(PAGE_MARGIN, HEAD_RULE_Y, contentRight, HEAD_RULE_Y);

  // ── Move numbers ──────────────────────────────────────────────────────────
  // One per full move, down the gutter: the cap sits on that row's board top.
  // Flush left at the margin, in the face's TABULAR figures: every digit is one
  // 600-unit column wide, so the numbers line up down the gutter and "10" grows
  // rightwards from the same axis as "1" — no alignment trick needed.
  doc.setFont(FONT, 'bold');
  doc.setFontSize(HEAD_SIZE);
  text(C_HEAD_DIM);
  for (let r = 0; r <= layout.maxDepth; r += 2) {
    const boardTop = Y(TOP_PAD + r * ROW_H + TOP_INSET);
    doc.text(tabular(`${r / 2 + 1}.`), PAGE_MARGIN, boardTop + CAP_RATIO * HEAD_SIZE);
  }

  // ── Edges ─────────────────────────────────────────────────────────────────
  // Orthogonal elbow connectors (parent bottom → horizontal bus → child top),
  // like the clinic: they pack tightly and read cleanly on a dense tree.
  // Coloured by how much the move hurt; dashed where the child leaves book.
  for (const e of layout.edges) {
    const a = byId[e.from];
    const b = byId[e.to];
    if (!a || !b) continue;
    const col = edgeColor(a.fen, evalOf(a), evalOf(b));
    const px = X(LEFT_PAD + a.x + CARD_W / 2);
    const py = Y(TOP_PAD + a.y + CARD_BOTTOM);
    const cx = X(LEFT_PAD + b.x + CARD_W / 2);
    // Land above the name band when the child is named (so the arrow never
    // crosses the name), else just above the board.
    const cy = Y(TOP_PAD + b.y + (b.name ? 1 : TOP_INSET - 2));
    const aw = Math.max(1.4, L(2.6));
    const ah = Math.max(2, L(4));

    const busY = py + (cy - py) * 0.5;
    stroke(col);
    doc.setLineWidth(Math.max(0.4, L(1.6)));
    doc.setLineDashPattern(b.deviation ? [L(5), L(4)] : [], 0);
    // down to the bus, across to the child column, down into the child
    doc.lines([[0, busY - py], [cx - px, 0], [0, cy - busY]], px, py, [1, 1], 'S');
    // Small arrowhead into the child, pointing down the line of play.
    doc.setLineDashPattern([], 0);
    fill(col);
    doc.triangle(cx - aw, cy - ah, cx + aw, cy - ah, cx, cy, 'F');
  }
  doc.setLineDashPattern([], 0);

  // ── Nodes ───────────────────────────────────────────────────────────────
  // Dense cells: a small board, a games count top-left, and one compact line
  // under the board (move + score). No per-board opening names — the sheet title
  // carries the branch and the packed positions do the talking (per the
  // reference). Boards nearly touch, so the tree reads at a glance.
  for (const n of layout.nodes) {
    const grid = fenGrid(n.fen);
    const boardLX = LEFT_PAD + n.x + (CARD_W - BOARD) / 2;
    const boardLY = TOP_PAD + n.y + TOP_INSET;
    const cxc = X(LEFT_PAD + n.x + CARD_W / 2);

    for (let dr = 0; dr < 8; dr++) {
      for (let dc = 0; dc < 8; dc++) {
        const gr = color === 'w' ? dr : 7 - dr;
        const gc = color === 'w' ? dc : 7 - dc;
        const piece = grid[gr]?.[gc] ?? null;
        const fileIdx = color === 'w' ? dc : 7 - dc;
        const rankNo = color === 'w' ? 8 - dr : dr + 1;
        const sqName = FILES[fileIdx] + rankNo;
        const hot = n.hl && (sqName === n.hl[0] || sqName === n.hl[1]);
        fill(hot ? C_HL : (dr + dc) % 2 === 0 ? C_LIGHT : C_DARK);
        const sx = X(boardLX + dc * BOARD_SQ);
        const sy = Y(boardLY + dr * BOARD_SQ);
        doc.rect(sx, sy, L(BOARD_SQ) + 0.4, L(BOARD_SQ) + 0.4, 'F');
        if (piece) {
          const src = pieces.get(piece);
          if (src) doc.addImage(src, 'PNG', sx, sy, L(BOARD_SQ), L(BOARD_SQ), 'p' + piece, 'FAST');
        }
      }
    }
    // Board frame.
    stroke(C_FRAME);
    doc.setLineWidth(Math.max(0.3, L(0.8)));
    doc.rect(X(boardLX), Y(boardLY), L(BOARD), L(BOARD), 'S');

    // Full opening name in the reserved band above the board, wherever the
    // opening changes — wrapped to two lines, NEVER shortened (the font shrinks
    // instead), and clear of the connector (its arrow lands above the name).
    if (n.name) {
      doc.setFont(FONT, 'bold');
      const bandW = L(CARD_W);
      let fs = L(8);
      let lines: string[] = [n.name];
      for (;;) {
        doc.setFontSize(fs);
        lines = doc.splitTextToSize(n.name, bandW) as string[];
        if (lines.length <= 2 || fs <= L(4)) break;
        fs *= 0.88;
      }
      const lineH = fs * 1.02;
      const bottom = Y(boardLY) - L(2.5);
      text(C_TEXT);
      lines.forEach((ln, i) =>
        doc.text(ln, cxc, bottom - (lines.length - 1 - i) * lineH, { align: 'center', baseline: 'bottom' })
      );
    }

    // Games count, top-left — how often this line occurs (reference style).
    if (n.games) {
      text(C_DIM);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(Math.max(3, L(7.5)));
      doc.text(String(n.games), X(boardLX) + L(1.5), Y(boardLY) + L(1.5), { align: 'left', baseline: 'top' });
    }
    // Blunder count, top-right (only when you've erred here).
    if (n.blunders > 0) {
      text(C_RED);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(Math.max(3.5, L(9)));
      doc.text(String(n.blunders), X(boardLX + BOARD) - L(1.5), Y(boardLY) + L(1.5), { align: 'right', baseline: 'top' });
    }

    // One compact line under the board: the move (dim) then your score in that
    // line (perf-coloured), centred as a unit.
    // One line under the board: the move, the engine eval, then the raw
    // win/draw/loss split (perf-coloured). Counts rather than a percentage, so
    // "2/0/1" can't read as confidently as "67%".
    const move = n.san;
    const evalStr = formatEval(evalOf(n));
    const wdl = `${n.wins}/${n.draws}/${n.losses}`;
    // A popular first move carries counts like "252/20/304", which would run
    // past the card and collide with its neighbour — so shrink to fit.
    let fs = L(9);
    doc.setFont(FONT, 'bold');
    const widthAt = (size: number) => {
      doc.setFontSize(size);
      return (
        (move ? doc.getTextWidth(move + ' ') : 0) +
        (evalStr ? doc.getTextWidth(evalStr + ' ') : 0) +
        doc.getTextWidth(wdl)
      );
    };
    while (fs > L(5) && widthAt(fs) > L(CARD_W)) fs *= 0.92;
    doc.setFontSize(Math.max(3.5, fs));
    const mw = move ? doc.getTextWidth(move + ' ') : 0;
    const ew = evalStr ? doc.getTextWidth(evalStr + ' ') : 0;
    const ww = doc.getTextWidth(wdl);
    const lx = cxc - (mw + ew + ww) / 2;
    const ly = Y(boardLY + BOARD + 3);
    if (move) {
      text(C_DIM);
      doc.text(move + ' ', lx, ly, { align: 'left', baseline: 'top' });
    }
    if (evalStr) {
      text(C_TEXT);
      doc.text(evalStr + ' ', lx + mw, ly, { align: 'left', baseline: 'top' });
    }
    text(n.perf === 'green' ? C_GREEN : n.perf === 'amber' ? C_YELLOW : C_RED);
    doc.text(wdl, lx + mw + ew, ly, { align: 'left', baseline: 'top' });
  }
  }; // end drawContent

  // One sheet.
  drawContent();

  const base = focusNode
    ? opts.focusName || focusNode.name || 'opening'
    : `${color === 'w' ? 'white' : 'black'}-repertoire`;
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'opening-tree';
  return {
    doc,
    filename: `${slug}.pdf`,
    title: `${title} — My Blunders`,
    pages: 1,
    branches,
    fens: layout.nodes.map((nd) => nd.fen),
  };
}

/**
 * Build the A1 PDF of `tree`. By default it's the whole repertoire for `color`;
 * pass `focusPath` to poster a single opening's subtree, `maxPlies`
 * to control depth, `orientation` to force the page shape.
 */
export async function buildOpeningTreePdf(
  tree: TreeNode,
  color: 'w' | 'b',
  opts: OpeningPdfOpts = {}
): Promise<BuiltPdf> {
  const { doc, filename, title, pages, branches } = await renderPoster(
    async (orient) => {
      const { jsPDF } = await import('jspdf');
      return new jsPDF({ orientation: orient, unit: 'pt', format: 'a1' });
    },
    tree,
    color,
    opts
  );
  return { blob: doc.output('blob'), filename, title, pages, branches };
}

/**
 * Render page 1 of the poster to a PNG data URL for the print dialog's preview.
 * Drawing to a canvas (rather than embedding the PDF) guarantees a fit-to-page
 * image on every platform — iOS's built-in PDF viewer can't be relied on to.
 */
export async function renderOpeningTreePreview(
  tree: TreeNode,
  color: 'w' | 'b',
  opts: OpeningPdfOpts = {},
  targetPx = 1400
): Promise<{ dataUrl: string; pages: number; branches: string[]; fens: string[] }> {
  const { CanvasPdf } = await import('./pdf-canvas');
  // Canvas draws with whatever is loaded at the time, so make sure the app's
  // face is in before the first stroke — otherwise the preview silently falls
  // back to Helvetica and mismatches the PDF.
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await Promise.all([document.fonts.load(`700 24px ${FONT}`), document.fonts.load(`400 24px ${FONT}`)]);
    } catch { /* fall back to the default face */ }
  }
  const { doc, pages, branches, fens } = await renderPoster(
    (orient) => new CanvasPdf(orient, targetPx),
    tree,
    color,
    opts
  );
  await doc.flushImages();
  return { dataUrl: doc.toDataURL(), pages, branches, fens };
}

/** Build the poster and hand it off — share sheet on iOS, download on web. */
export async function exportOpeningTreePdf(
  tree: TreeNode,
  color: 'w' | 'b',
  opts: OpeningPdfOpts = {}
): Promise<void> {
  const { blob, filename, title } = await buildOpeningTreePdf(tree, color, opts);
  await saveOrShare(blob, filename, title);
}

/** Hand an already-built poster off to the user (share sheet on iOS / download). */
export async function savePdf(built: BuiltPdf): Promise<void> {
  await saveOrShare(built.blob, built.filename, built.title);
}
