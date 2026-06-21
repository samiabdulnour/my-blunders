/**
 * Tiny read-only FEN board for the Opening Clinic: a CSS-grid of squares using
 * the main app's board tokens (so it matches the trainer and inherits dark
 * mode) with the cburnett pieces the app already ships. Used small in the tree
 * nodes and larger in the detail panel. The interactive <Board> is separate —
 * this one only paints.
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

export function OpeningBoard({ fen, hl = null, sqSize = 11, orient = 'w' }: OpeningBoardProps) {
  const grid = fenToGrid(fen);
  const hlSet = new Set(hl ?? []);
  const order = orient === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cells: React.ReactNode[] = [];
  for (const r of order) {
    for (const c of order) {
      const name = FILES[c] + (8 - r);
      const light = (c + (8 - r)) % 2 === 0;
      const piece = grid[r][c];
      const hot = hlSet.has(name);
      cells.push(
        <div
          key={name}
          className={'ob-sq ' + (light ? 'ob-l' : 'ob-d') + (hot ? ' ob-hl' : '')}
        >
          {piece && <img className="ob-pc" src={pieceSrc(piece)} alt="" draggable={false} />}
        </div>
      );
    }
  }
  return (
    <div className="ob-board" style={{ '--ob-sq': `${sqSize}px` } as React.CSSProperties}>
      {cells}
    </div>
  );
}
