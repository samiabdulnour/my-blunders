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
import { layoutTree, findByPath, formatEval, RENDER_ROWS, type TreeNode, type LaidNode } from './opening-tree';
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
): Promise<{ doc: any; filename: string; title: string; pages: number; branches: string[] }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const focusNode = opts.focusPath ? findByPath(tree, opts.focusPath) : null;

  // Player nickname + a small account snapshot for the header. Totals are summed
  // over the repertoire's first moves — i.e. every game the tree was built from.
  const nickname = (loadUsername() || '').trim();
  const acctGames = tree.children.reduce((s, c) => s + c.games, 0);
  const acctW = tree.children.reduce((s, c) => s + c.wins, 0);
  const acctD = tree.children.reduce((s, c) => s + c.draws, 0);
  const acctL = tree.children.reduce((s, c) => s + c.losses, 0);
  const acctScore = acctGames ? Math.round(((acctW + acctD / 2) / acctGames) * 100) : 0;
  const statsLine = [
    nickname || null,
    acctGames ? `${acctGames} games` : null,
    acctGames ? `${acctScore}% overall` : null,
    acctGames ? `${acctW}W · ${acctD}D · ${acctL}L` : null,
  ]
    .filter(Boolean)
    .join('     ·     ');

  const MARGIN = 48;
  const HEADER = 96;
  const LEFT_GUTTER = 10; // slim left inset (the old move-number gutter is gone)
  const availOf = (w: number, h: number) => ({
    w: w - 2 * MARGIN - LEFT_GUTTER,
    h: h - 2 * MARGIN - HEADER,
  });
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
  const avail = availOf(pageW, pageH);

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
  // Portrait row budget: the tallest line sets the height, so cap it just under
  // what the sheet fits at the target board size — otherwise height binds first
  // and the boards come out smaller than the line budget allows. 23 rows ×
  // ROW_H 140 + TOP_PAD fits 2192pt of sheet at ~65pt boards.
  const maxRows = portrait ? DEEP - 1 : 14;
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
  const sub = `My Blunders · opening tree${minGames > 2 ? ` · most-played lines (≥ ${minGames} games)` : ''} · ${named} named lines`;
  const branches: string[] = [];

  const treeW = LEFT_PAD + layout.width;
  const treeH = TOP_PAD + layout.height;
  // Scale-to-fit fills the binding axis; centre the slack on the other so the
  // tree sits balanced on the sheet.
  const offX = MARGIN + LEFT_GUTTER + Math.max(0, (avail.w - treeW * S) / 2);
  const offY = MARGIN + HEADER + Math.max(0, (avail.h - treeH * S) / 2);
  const X = (lx: number) => offX + lx * S;
  const Y = (ly: number) => offY + ly * S;
  const L = (len: number) => len * S;

  const fill = (hex: string) => { const [r, g, b] = hexToRgb(hex); doc.setFillColor(r, g, b); };
  const stroke = (hex: string) => { const [r, g, b] = hexToRgb(hex); doc.setDrawColor(r, g, b); };
  const text = (hex: string) => { const [r, g, b] = hexToRgb(hex); doc.setTextColor(r, g, b); };

  const byId: Record<string, LaidNode> = {};
  for (const n of layout.nodes) byId[n.pathId] = n;

  // Draw the sheet (the fitted layout + header) at the computed offset/scale.
  const drawContent = () => {
  // ── Paper background (so the poster reads on any viewer / printer) ─────────
  fill(C_PAPER);
  doc.rect(0, 0, pageW, pageH, 'F');

  // ── Header ────────────────────────────────────────────────────────────────
  text(C_TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.text(title, MARGIN, MARGIN + 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(15);
  text(C_DIM);
  doc.text(sub, MARGIN, MARGIN + 54);
  // Nickname + account snapshot.
  if (statsLine) {
    doc.setFontSize(14);
    doc.text(statsLine, MARGIN, MARGIN + 76);
  }
  // Legend (top-right)
  doc.setFontSize(12);
  let lx = pageW - MARGIN - 340;
  const legend: [string, string][] = [
    [C_GREEN, 'good'],
    [C_YELLOW, 'risky'],
    [C_RED, 'blunder'],
  ];
  for (const [hex, label] of legend) {
    stroke(hex);
    doc.setLineWidth(3);
    doc.line(lx, MARGIN + 26, lx + 22, MARGIN + 26);
    text(C_DIM);
    doc.text(label, lx + 28, MARGIN + 30);
    lx += 110;
  }
  // Bottom legend: what the numbers under/on each board mean (+ the connectors).
  text(C_DIM);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(
    'Under each board: the move, your score in that line — (wins + ½ draws) as a percentage — then the engine eval in pawns (+ favours White) where the game was analysed. Games played is top-left. Green strong · amber even · red weak.    Connector colour grades the move: green good · amber risky · red blunder.',
    MARGIN,
    pageH - 26,
    { baseline: 'top' }
  );

  // ── Edges ─────────────────────────────────────────────────────────────────
  // Orthogonal elbow connectors (parent bottom → horizontal bus → child top),
  // like the clinic: they pack tightly and read cleanly on a dense tree.
  // Coloured by how much the move hurt; dashed where the child leaves book.
  for (const e of layout.edges) {
    const a = byId[e.from];
    const b = byId[e.to];
    if (!a || !b) continue;
    const col = edgeColor(a.fen, a.eval, b.eval);
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
      doc.setFont('helvetica', 'bold');
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
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(Math.max(3, L(7.5)));
      doc.text(String(n.games), X(boardLX) + L(1.5), Y(boardLY) + L(1.5), { align: 'left', baseline: 'top' });
    }
    // Blunder count, top-right (only when you've erred here).
    if (n.blunders > 0) {
      text(C_RED);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.max(3.5, L(9)));
      doc.text(String(n.blunders), X(boardLX + BOARD) - L(1.5), Y(boardLY) + L(1.5), { align: 'right', baseline: 'top' });
    }

    // One compact line under the board: the move (dim) then your score in that
    // line (perf-coloured), centred as a unit.
    const move = n.san;
    const scoreStr = `${Math.round(n.score)}%`;
    // Engine eval for the position, where it exists. Only games the server
    // actually analysed carry evals, so most boards have none — hence the
    // graceful blank rather than a placeholder.
    const evalStr = formatEval(n.eval);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(3.5, L(9)));
    const mw = move ? doc.getTextWidth(move + ' ') : 0;
    const sw = doc.getTextWidth(scoreStr);
    const ew = evalStr ? doc.getTextWidth(' ' + evalStr) : 0;
    const lx = cxc - (mw + sw + ew) / 2;
    const ly = Y(boardLY + BOARD + 3);
    if (move) {
      text(C_DIM);
      doc.text(move + ' ', lx, ly, { align: 'left', baseline: 'top' });
    }
    text(n.perf === 'green' ? C_GREEN : n.perf === 'amber' ? C_YELLOW : C_RED);
    doc.text(scoreStr, lx + mw, ly, { align: 'left', baseline: 'top' });
    if (evalStr) {
      text(C_TEXT);
      doc.text(' ' + evalStr, lx + mw + sw, ly, { align: 'left', baseline: 'top' });
    }
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
): Promise<{ dataUrl: string; pages: number; branches: string[] }> {
  const { CanvasPdf } = await import('./pdf-canvas');
  const { doc, pages, branches } = await renderPoster(
    (orient) => new CanvasPdf(orient, targetPx),
    tree,
    color,
    opts
  );
  await doc.flushImages();
  return { dataUrl: doc.toDataURL(), pages, branches };
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
