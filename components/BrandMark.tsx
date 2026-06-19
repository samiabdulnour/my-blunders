/**
 * The my·blunders logo + wordmark.
 *
 * The mark is a 4×4 mini chessboard: eight mint cells in checker positions
 * plus one coral accent square — the "blunder" — sitting on an otherwise
 * empty cell (grid col 2, row 1). The light cells are left transparent so the
 * topbar background shows through, which makes the mark adapt automatically to
 * light/dark mode. Fills use theme tokens. The wordmark is Gruezi Bold
 * lowercase with the middot rendered in coral.
 */
export function BrandMark() {
  return (
    <div className="brand-pad">
      <svg className="brand-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="0" y="0" width="5" height="5" fill="var(--mint)" />
        <rect x="10" y="0" width="5" height="5" fill="var(--mint)" />
        <rect x="5" y="5" width="5" height="5" fill="var(--mint)" />
        <rect x="15" y="5" width="5" height="5" fill="var(--mint)" />
        <rect x="10" y="5" width="5" height="5" fill="var(--coral)" />
        <rect x="0" y="10" width="5" height="5" fill="var(--mint)" />
        <rect x="10" y="10" width="5" height="5" fill="var(--mint)" />
        <rect x="5" y="15" width="5" height="5" fill="var(--mint)" />
        <rect x="15" y="15" width="5" height="5" fill="var(--mint)" />
      </svg>
      <span className="brand-word">
        my<span className="dot">·</span>blunders
      </span>
    </div>
  );
}
