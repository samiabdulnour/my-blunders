/**
 * Tiny read-only FEN board for the Repertoire X-ray: a CSS-grid of squares in
 * the X-ray's cream/slate palette with the cburnett pieces the app already
 * ships. Used at 10px (tree nodes) and 7px (puzzle thumbnails). The main
 * trainer's interactive <Board> is a separate component — this one only paints.
 */
const FILES = 'abcdefgh';

/** FEN board field → 8×8 grid (row 0 = rank 8, col 0 = a-file). */
function fenToGrid(fen: string): (string | null)[][] {
  return fen.split(' ')[0].split('/').map((row) => {
    const out: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push(ch);
    }
    return out;
  });
}

function pieceSrc(p: string): string {
  const color = p === p.toUpperCase() ? 'w' : 'b';
  return `/pieces/cburnett/${color}${p.toUpperCase()}.svg`;
}

interface OpeningBoardProps {
  /** FEN (board field is enough; full FEN also accepted). */
  fen: string;
  /** [from, to] squares to highlight as the last move. */
  hl?: [string, string] | null;
  /** Square size in px. */
  sqSize?: number;
  orient?: 'w' | 'b';
}

export function OpeningBoard({ fen, hl = null, sqSize = 10, orient = 'w' }: OpeningBoardProps) {
  const grid = fenToGrid(fen);
  const hlSet = new Set(hl ?? []);
  const order = orient === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cells: React.ReactNode[] = [];
  for (const r of order) {
    for (const c of order) {
      const name = FILES[c] + (8 - r);
      const light = (c + (8 - r)) % 2 === 0;
      const piece = grid[r][c];
      cells.push(
        <div key={name} className={'sq ' + (light ? 'l' : 'd')} data-sq={name}>
          {hlSet.has(name) && <span className="lm" />}
          {piece && <img className="pc" src={pieceSrc(piece)} alt="" draggable={false} />}
        </div>
      );
    }
  }
  return (
    <div className="xboard" style={{ '--xsq': `${sqSize}px` } as React.CSSProperties}>
      {cells}
    </div>
  );
}
