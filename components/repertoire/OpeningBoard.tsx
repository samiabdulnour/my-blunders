import { useId } from 'react';

/**
 * Tiny read-only FEN board for the Opening Clinic: a CSS-grid of squares using
 * the main app's board tokens (so it matches the trainer and inherits dark
 * mode) with the cburnett pieces the app already ships. Optionally overlays
 * move arrows — the clinic uses a green arrow for the right continuation and a
 * red one for the move you played wrong. The interactive <Board> is separate;
 * this one only paints.
 */
const FILES = 'abcdefgh';

export interface BoardArrow {
  from: string;
  to: string;
  kind: 'good' | 'bad';
}

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

/** Pixel centre of a square, honouring orientation. */
function squareCenter(sq: string, size: number, orient: 'w' | 'b'): [number, number] {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]);
  const col = orient === 'w' ? file : 7 - file;
  const rowFromTop = orient === 'w' ? 8 - rank : rank - 1;
  return [col * size + size / 2, rowFromTop * size + size / 2];
}

interface OpeningBoardProps {
  /** FEN (board field is enough; full FEN also accepted). */
  fen: string;
  /** [from, to] squares to highlight as the last move. */
  hl?: [string, string] | null;
  /** Square size in px. */
  sqSize?: number;
  orient?: 'w' | 'b';
  /** Move arrows to overlay (green = right move, red = your wrong move). */
  arrows?: BoardArrow[];
}

export function OpeningBoard({ fen, hl = null, sqSize = 11, orient = 'w', arrows = [] }: OpeningBoardProps) {
  const uid = useId();
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
        <div key={name} className={'ob-sq ' + (light ? 'ob-l' : 'ob-d') + (hot ? ' ob-hl' : '')}>
          {piece && <img className="ob-pc" src={pieceSrc(piece)} alt="" draggable={false} />}
        </div>
      );
    }
  }

  const dim = sqSize * 8;
  return (
    <div className="ob-wrap" style={{ '--ob-sq': `${sqSize}px` } as React.CSSProperties}>
      <div className="ob-board">{cells}</div>
      {arrows.length > 0 && (
        <svg className="ob-arrows" width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
          {arrows.map((a, i) => {
            const [fx, fy] = squareCenter(a.from, sqSize, orient);
            const [tx, ty] = squareCenter(a.to, sqSize, orient);
            const ang = Math.atan2(ty - fy, tx - fx);
            const head = sqSize * 0.42;
            const halfW = sqSize * 0.3;
            // Base of the arrowhead, line stops here so it doesn't poke through.
            const bx = tx - head * Math.cos(ang);
            const by = ty - head * Math.sin(ang);
            const px = Math.sin(ang) * halfW;
            const py = -Math.cos(ang) * halfW;
            const color = a.kind === 'good' ? 'var(--green)' : 'var(--red)';
            return (
              <g key={uid + i} stroke={color} fill={color} opacity="0.82">
                <line x1={fx} y1={fy} x2={bx} y2={by} strokeWidth={sqSize * 0.17} strokeLinecap="round" />
                <polygon stroke="none" points={`${tx},${ty} ${bx + px},${by + py} ${bx - px},${by - py}`} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
