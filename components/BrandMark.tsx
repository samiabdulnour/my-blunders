/**
 * The my·blunders wordmark — a purely typographic logo set in the app's own
 * Gruezi type family (no icon). "my" is muted and "blunders" carries the full
 * weight/colour, with the middot in brand coral as the single accent (the
 * "blunder" mark). Fully theme-aware via tokens, so it reads in light + dark.
 */
export function BrandMark() {
  return (
    <div className="brand-pad">
      <span className="brand-word">
        <span className="brand-my">my</span>
        <span className="dot">·</span>
        <span className="brand-bl">blunders</span>
      </span>
    </div>
  );
}
