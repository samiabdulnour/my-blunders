/**
 * The my·blunders logo + wordmark.
 *
 * The mark is a 2×2 checkerboard: a coral cell top-left, an ink cell
 * bottom-right, inside a 1.5px contour frame. Fills use theme tokens so the
 * mark adapts to dark mode. The wordmark is Gruezi Bold lowercase with the
 * middot rendered in coral.
 */
export function BrandMark() {
  return (
    <div className="brand-pad">
      <svg className="brand-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="0" y="0" width="10" height="10" fill="var(--coral)" />
        <rect x="10" y="10" width="10" height="10" fill="var(--txt)" />
        <rect
          x="0.75"
          y="0.75"
          width="18.5"
          height="18.5"
          stroke="var(--contour)"
          strokeWidth="1.5"
        />
      </svg>
      <span className="brand-word">
        my<span className="dot">·</span>blunders
      </span>
    </div>
  );
}
