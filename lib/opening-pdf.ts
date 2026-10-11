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
import { layoutTree, findByPath, formatEval, POSTER_BUDGET, RENDER_ROWS, type PosterBudget, type PosterShape, type TreeNode, type LaidNode } from './opening-tree';
import { loadUsername } from './storage';
import { boardThemeById, type BoardTheme } from './board-theme';

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

// Print palette. The boards default to the app's Green board theme; a caller
// passes `board` to print in whichever theme the app shows (see BOARD_THEMES).
// The rest is fixed — paper, ink and the grading colours don't follow a theme.
const DEFAULT_BOARD = boardThemeById('green');
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
 * Set to the designer's InDesign layout (Myblunders_zofka.indd, revised
 * 2026-10-11), measured off its 300dpi export. All y values are from the PAGE
 * TOP, matching jsPDF; x values on the left from the page edge, on the right
 * from the right content edge, so the block stays anchored on every sheet.
 *
 * The header is one closed band between two full-width rules. At its left, a
 * boxed table: the three stats on top, ruled off, the four-line legend beneath.
 * The three headings sit in the open part of the band to the right, centred on
 * its height. Move numbers run down a left gutter under the box's left rule. */
const PAGE_MARGIN = 36;
/** Move-number column; the tree starts at PAGE_MARGIN + this. 94pt fits a 20th
 *  portrait column at the same board size as 19 did, with ~68pt (nearly a
 *  board's width) left between the numbers and the tree. */
const GUTTER_W = 94;

const HEAD_SIZE = 24;
const LEG_SIZE = 12;
const LEG_LEAD = 14.4;
/** The band: top rule, the rule under the stats (box only), bottom rule. */
const BAND_TOP = 36.4;
const BAND_MID = 72.7;
const BAND_BOTTOM = 136.7;
/** Stats on two baselines inside the top cell row; the legend on four below. */
const STAT_BASE = [51.1, 65.5];
const LEG_BASE1 = 87.8;
/** The box's vertical rules: its left and right edges, with the two stat
 *  dividers between. A cell widens past this for a long nickname rather than
 *  letting it run into its neighbour (the rules after it move right). */
const BOX_RULES = [36, 195.7, 360.7, 525.4];
/** Text inset from the rule on a cell's left: a touch more off the box's
 *  outer edge (the first stat and the legend) than off a divider. */
const CELL_PAD_EDGE = 7.2;
const CELL_PAD = 5.5;
const HEAD_TITLE_BASE = 89.5; // bold headings, centred on the band
/** Layout origin for the tree: 20.3pt under the band, as it always was, so row
 *  0's board top clears the rule by about a name band. */
const TREE_TOP = BAND_BOTTOM + 20.3;
/** How far down White's board a move number's optical middle sits, as a
 *  fraction of the board's height: 0 = top edge, 0.5 = centre. 0.275 is 5 mm
 *  above centre at the portrait sheet's 63pt boards (the review of 2026-09-20;
 *  the InDesign file still hangs them from the board top). */
const MOVE_NO_AT = 0.275;
/** Right-hand block, held as offsets from the right content edge. */
const HEAD_R_TITLE = 912; // "<COLOUR> REPERTOIRE"
const HEAD_R_MID = 537.5; // "OPENING TREE"
const HEAD_R_END = 10.5; // "N NAMED LINES" ends this far inside the rules
/** Room the title has before "OPENING TREE", less a gap so the two never crowd
 *  (the reference leaves ~132pt between them). Beyond this it wraps. */
const TITLE_SLOT = HEAD_R_TITLE - HEAD_R_MID - 40;
/** Baseline pitch of a wrapped title's two rows (centred on the band), and the
 *  size it won't shrink below — the longest ECO names would otherwise set
 *  absurdly small. */
const TITLE_LEAD = 26;
const TITLE_MIN_SIZE = 14;
/** InDesign tracks the bold caps ~0.02em; jsPDF calls this char spacing. */
const HEAD_TRACK = 0.02;
/** Gruezi cap height as a fraction of font size — a move number's cap top sits
 *  on its row's board top. */
const CAP_RATIO = 0.708;

/** The sheet's typeface, embedded so it isn't set in Helvetica: Gruezi Bold for
 *  the headings and the move column, Medium for everything else — the two
 *  weights the InDesign layout this poster follows uses. Note they're the
 *  FULL-WIDTH cuts, not the condensed `-C-` pair the app UI is set in; the
 *  poster follows the reference, the UI keeps its own look. jsPDF can only
 *  embed TrueType, so these are the TTF builds `scripts/otf2ttf.py` makes (they
 *  also carry the tabular figures below); fetched at print time, not bundled. */
const FONT = 'GrueziPoster';
const FONT_FILES: [string, string][] = [
  ['RL-Gruezi-Bold.ttf', 'bold'],
  ['RL-Gruezi-Medium.ttf', 'normal'],
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
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
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
  /** Which budget shapes the tree: an A1 orientation, or 'wallpaper' for the
   *  16:9 4K JPEG. Defaults to the orientation, so PDF callers never set it. */
  shape?: PosterShape;
  /** Engine evals by FEN (white-relative cp), overriding the sparse per-game
   *  evals so every board can show one. See fillPosterEvals(). */
  evals?: Map<string, number>;
  /** Board colours — one of the app's board themes (default: Green). */
  board?: BoardTheme;
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

  // Player nickname + a small account snapshot for the header. Read off the
  // root, which tallies every game the tree was built from — so the snapshot
  // stays the whole repertoire even on a poster focused to one opening, whose
  // branches below the focus are all this tree keeps.
  const nickname = (loadUsername() || '').trim();
  const acctGames = tree.games;
  const acctW = tree.wins;
  const acctD = tree.draws;
  const acctL = tree.losses;
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

  // Where the sheet starts. A print sheet always reads from the first moves —
  // a focused poster too, down the trunk the builder kept. A sheet whose budget
  // counts rows from the focus (the wallpaper: too small to spend rows on the
  // moves everyone knows) starts AT the focus position instead.
  const orient: 'portrait' | 'landscape' = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
  const shape: PosterShape = opts.shape ?? orient;
  const shapeBudget: PosterBudget = POSTER_BUDGET[shape];
  const fromFocus = !!focusNode && !!shapeBudget.fromFocus;
  const topNodes = fromFocus ? [focusNode] : topMoves;
  const basePath = fromFocus ? opts.focusPath!.split('/').slice(0, -1).join('/') : '';
  /** Ply of the sheet's first row (1 = the first move). */
  const firstPly = fromFocus ? focusNode.depth : 1;

  const layoutAt = (o: {
    mg: number;
    maxRows: number;
    maxChildren?: number;
    branchDepth?: number;
  }) =>
    layoutTree(tree, {
      topNodes,
      basePath,
      maxRows: o.maxRows,
      cardW: CARD_W,
      colGap: COL_GAP,
      rowH: ROW_H,
      minGames: o.mg,
      maxChildren: o.maxChildren,
      branchDepth: o.branchDepth,
      // Packed by outline, so the tree's stubs sit in its empty corners and
      // deep lines run underneath them — never wider than the line budget.
      pack: { maxCols: POSTER_BUDGET[shape].maxLines },
    });

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
  // ── Title ─────────────────────────────────────────────────────────────────
  // The title owns the room up to "OPENING TREE". A long opening name — and
  // ECO's run long — used to print straight through that label, so it wraps to
  // a second row instead, and only shrinks if two rows still won't hold it.
  // Measured with the tracking added by hand: jsPDF's getTextWidth ignores char
  // spacing, and the canvas backend would otherwise count it twice. The band
  // has room for two rows, so a wrapped title never moves the tree.
  const title = focusNode
    ? opts.focusName || focusNode.name || 'Opening line'
    : `${color === 'w' ? 'White' : 'Black'} repertoire`;
  doc.setFont(FONT, 'bold');
  const width = (str: string, size: number) => {
    doc.setFontSize(size);
    doc.setCharSpace(0);
    return doc.getTextWidth(str) + HEAD_TRACK * size * str.length;
  };
  const wrap = (str: string, size: number): string[] => {
    const out: string[] = [];
    let line = '';
    for (const w of str.split(' ').filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (line && width(next, size) > TITLE_SLOT) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    return out.length ? out : [str];
  };
  const caps = title.toUpperCase();
  let titleSize = HEAD_SIZE;
  let titleRows = [caps];
  if (width(caps, titleSize) > TITLE_SLOT) {
    titleRows = wrap(caps, titleSize);
    while (titleRows.length > 2 && titleSize > TITLE_MIN_SIZE) {
      titleSize = Math.max(TITLE_MIN_SIZE, titleSize * 0.92);
      titleRows = wrap(caps, titleSize);
    }
    if (titleRows.length > 2) titleRows = [titleRows[0], `${titleRows[1]}…`];
  }
  doc.setCharSpace(0);
  // Two rows sit either side of the single-row baseline, so the block stays
  // centred on the band.
  const titleBase0 = HEAD_TITLE_BASE - ((titleRows.length - 1) * TITLE_LEAD) / 2;
  const treeTop = TREE_TOP;

  // The tree sits right of the move-number gutter and below the header rule.
  const treeLeft = PAGE_MARGIN + GUTTER_W;
  const avail = { w: pageW - PAGE_MARGIN - treeLeft, h: pageH - PAGE_MARGIN - treeTop };

  // Fit what is actually DRAWN: the boards' own bounding box. `layout.width`
  // carries a trailing card of padding (and LEFT_PAD leads it) that the drawing
  // never uses — the tree is centred on its boards, below — so fitting to it
  // reserved a phantom column and kept a real one off the sheet.
  const boardsWidth = (lay: { nodes: { x: number }[]; width: number }) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const n of lay.nodes) { if (n.x < lo) lo = n.x; if (n.x > hi) hi = n.x; }
    return Number.isFinite(lo) ? hi - lo + CARD_W : lay.width;
  };
  const scaleFit = (lay: { nodes: { x: number }[]; width: number; height: number }) =>
    Math.min(avail.w / boardsWidth(lay), avail.h / (TOP_PAD + lay.height));

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
  const maxRows = POSTER_BUDGET[shape].maxPly;
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
  const legendLines = [
    'Under each board: the move, the engine eval in pawns (+ favours White),',
    'then your record from that position as wins/draws/losses.',
    'Games played is top-left. Green strong · amber even · red weak.',
    'Connector colour grades the move: green good · amber risky · red blunder.',
  ];
  const branches: string[] = [];

  // layout.width carries a trailing card of padding and LEFT_PAD leads it, so
  // centring on it leaves visibly different margins. Centre the BOARDS' own
  // bounding box on the page instead, for equal borders left and right.
  const nodeMinX = layout.nodes.reduce((m, n) => Math.min(m, n.x), Infinity);
  const contentW = boardsWidth(layout);
  // Scale-to-fit fills the binding axis; centre the slack on the other so the
  // tree sits balanced on the sheet.
  const offX =
    treeLeft + Math.max(0, (avail.w - contentW * S) / 2) - (LEFT_PAD + (Number.isFinite(nodeMinX) ? nodeMinX : 0)) * S;
  const offY = treeTop;
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
  const board = opts.board ?? DEFAULT_BOARD;

  const byId: Record<string, LaidNode> = {};
  for (const n of layout.nodes) byId[n.pathId] = n;

  // Draw the sheet (the fitted layout + header) at the computed offset/scale.
  const drawContent = () => {
  // ── Paper background (so the poster reads on any viewer / printer) ─────────
  fill(C_PAPER);
  doc.rect(0, 0, pageW, pageH, 'F');

  // ── Header ────────────────────────────────────────────────────────────────
  // One band between two full-width rules: the boxed stats + legend table on
  // the left, the three headings in the open part to the right.
  const contentRight = pageW - PAGE_MARGIN;
  // Every rule on the sheet is one weight: the tree's connector line.
  const ruleW = Math.max(0.4, L(1.6));

  // Stats: three cells of two rows (who / how many / how well, over W-D-L),
  // set like the legend. Each cell keeps the layout's width unless its text
  // needs more, in which case every rule after it moves right.
  doc.setFont(FONT, 'normal');
  doc.setFontSize(LEG_SIZE);
  text(C_HEAD_DIM);
  const boxX = [BOX_RULES[0]];
  statCells.forEach(([top, bottom], i) => {
    const pad = i === 0 ? CELL_PAD_EDGE : CELL_PAD;
    const x = boxX[i] + pad;
    doc.text(top, x, STAT_BASE[0]);
    doc.text(bottom, x, STAT_BASE[1]);
    const textW = Math.max(doc.getTextWidth(top), doc.getTextWidth(bottom));
    boxX.push(boxX[i] + Math.max(BOX_RULES[i + 1] - BOX_RULES[i], textW + pad + CELL_PAD));
  });
  const boxRight = boxX[statCells.length];

  // Legend: the row under the stats, spanning the whole box.
  legendLines.forEach((ln, i) => doc.text(ln, BOX_RULES[0] + CELL_PAD_EDGE, LEG_BASE1 + i * LEG_LEAD));

  doc.setFont(FONT, 'bold');
  text(C_TEXT);
  // The heading block hangs off the right margin, the same on every sheet.
  doc.setFontSize(titleSize);
  doc.setCharSpace(HEAD_TRACK * titleSize);
  titleRows.forEach((row, i) => doc.text(row, contentRight - HEAD_R_TITLE, titleBase0 + i * TITLE_LEAD));

  doc.setFontSize(HEAD_SIZE);
  doc.setCharSpace(HEAD_TRACK * HEAD_SIZE);
  doc.text('OPENING TREE', contentRight - HEAD_R_MID, HEAD_TITLE_BASE);
  doc.text(`${named} NAMED LINE${named === 1 ? '' : 'S'}`, contentRight - HEAD_R_END, HEAD_TITLE_BASE, { align: 'right' });
  doc.setCharSpace(0);

  stroke(C_HEAD_DIM);
  doc.setLineWidth(ruleW);
  doc.line(PAGE_MARGIN, BAND_TOP, contentRight, BAND_TOP);
  doc.line(PAGE_MARGIN, BAND_BOTTOM, contentRight, BAND_BOTTOM);
  doc.line(boxX[0], BAND_MID, boxRight, BAND_MID);
  doc.line(boxX[0], BAND_TOP, boxX[0], BAND_BOTTOM);
  doc.line(boxRight, BAND_TOP, boxRight, BAND_BOTTOM);
  for (const dx of boxX.slice(1, -1)) doc.line(dx, BAND_TOP, dx, BAND_MID);

  // ── Move numbers ──────────────────────────────────────────────────────────
  // One per full move, down the gutter, beside that move's first board —
  // White's move — so the number reads as the label of the row it starts.
  // Where beside it was settled by eye in the review of 2026-09-20: hanging
  // from the board's top edge read as belonging to the name above; centred on
  // the board was "too much"; 5 mm above centre on the A1 portrait sheet is
  // right. Held as a FRACTION of the board (MOVE_NO_AT) so it lands the same on
  // landscape and on a small repertoire's larger boards. Positioned by cap
  // height: the figures have no descenders, so the optical middle of "12." is
  // half a cap above its baseline.
  // Set at the small-text size, like the stats and legend, flush with the
  // header box's left rule. Bold, in the face's TABULAR figures: every digit is
  // one 600-unit column wide, so the numbers line up down the gutter and "10"
  // grows rightwards from the same axis as "1" — no alignment trick needed.
  // Rows are labelled by their real ply, so a sheet that starts mid-game (a
  // focused wallpaper) still counts from the right move; when its first row is
  // a Black move, that row reads "7…" rather than going unlabelled.
  doc.setFont(FONT, 'bold');
  doc.setFontSize(LEG_SIZE);
  text(C_HEAD_DIM);
  for (let r = 0; r <= layout.maxDepth; r++) {
    const ply = firstPly + r;
    const whiteMove = ply % 2 === 1;
    if (!whiteMove && r > 0) continue;
    const no = Math.floor((ply - 1) / 2) + 1;
    const anchor = Y(TOP_PAD + r * ROW_H + TOP_INSET + BOARD * MOVE_NO_AT);
    doc.text(tabular(`${no}`) + (whiteMove ? '.' : '…'), PAGE_MARGIN, anchor + (CAP_RATIO * LEG_SIZE) / 2);
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

    // ONE bus level per parent, in the clear strip between its card and the
    // children's name band. It used to sit halfway to each child's own landing
    // point — and an unnamed child lands lower (at its board, not above a name),
    // so its bus ran lower too: straight through the names of every sibling it
    // passed on the way.
    const busY = Y(TOP_PAD + a.y + CARD_BOTTOM + (ROW_H - CARD_BOTTOM) / 2);
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
        const light = (dr + dc) % 2 === 0;
        fill(hot ? (light ? board.lmL : board.lmD) : light ? board.sqL : board.sqD);
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

/* ── Wallpaper (16:9 canvas → JPEG) ────────────────────────────────────────
 * The same draw code as the A1 sheet, on a 16:9 "page" whose width matches A1's
 * long edge — so every pt-sized constant (headers, legend, gutter) keeps the
 * proportions the poster was designed at. Rendered at 3840px wide, the page
 * height lands at exactly 2160px: a native 4K desktop wallpaper. */
const WALL_PAGE_W = 2383.94; // = A1's long edge, in points
const WALL_PAGE_H = (WALL_PAGE_W * 9) / 16;
const WALL_PX = 3840;
const WALL_JPEG_QUALITY = 0.92;

/** Canvas text draws with whatever face is loaded at the time, so pull the
 *  poster's family in before the first stroke — otherwise the render silently
 *  falls back to Helvetica and mismatches the PDF. `GrueziPoster` is declared
 *  in globals.css purely for this, and only downloaded when needed. */
async function ensureCanvasFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([document.fonts.load(`700 24px ${FONT}`), document.fonts.load(`400 24px ${FONT}`)]);
  } catch { /* fall back to the default face */ }
}

/**
 * Build the 4K wallpaper JPEG of `tree` (16:9, 3840×2160). Shaped by the
 * 'wallpaper' budget — far fewer, larger boards than the print sheet, so the
 * moves stay readable at screen size.
 */
export async function buildOpeningTreeWallpaper(
  tree: TreeNode,
  color: 'w' | 'b',
  opts: OpeningPdfOpts = {}
): Promise<BuiltPdf> {
  const { CanvasPdf } = await import('./pdf-canvas');
  await ensureCanvasFonts();
  const { doc, filename, title, pages, branches } = await renderPoster(
    () => new CanvasPdf({ w: WALL_PAGE_W, h: WALL_PAGE_H }, WALL_PX),
    tree,
    color,
    { ...opts, orientation: 'landscape', shape: 'wallpaper' }
  );
  await doc.flushImages();
  return {
    blob: await doc.toJpegBlob(WALL_JPEG_QUALITY),
    filename: filename.replace(/\.pdf$/, '-wallpaper.jpg'),
    title,
    pages,
    branches,
  };
}

/**
 * Render page 1 of the poster to a PNG data URL for the print dialog's preview.
 * Drawing to a canvas (rather than embedding the PDF) guarantees a fit-to-page
 * image on every platform — iOS's built-in PDF viewer can't be relied on to.
 * With `shape: 'wallpaper'` the preview is the 16:9 page instead of A1.
 */
export async function renderOpeningTreePreview(
  tree: TreeNode,
  color: 'w' | 'b',
  opts: OpeningPdfOpts = {},
  targetPx = 1400
): Promise<{ dataUrl: string; pages: number; branches: string[]; fens: string[] }> {
  const { CanvasPdf } = await import('./pdf-canvas');
  await ensureCanvasFonts();
  const { doc, pages, branches, fens } = await renderPoster(
    (orient) =>
      opts.shape === 'wallpaper'
        ? new CanvasPdf({ w: WALL_PAGE_W, h: WALL_PAGE_H }, targetPx)
        : new CanvasPdf(orient, targetPx),
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
