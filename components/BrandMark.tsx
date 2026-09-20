/**
 * The "My blunders" wordmark — the app name set plainly in the app's Gruezi
 * type family. No icon, no accent: just the name at the header size/weight,
 * theme-aware via the --txt token.
 */
export function BrandMark() {
  return (
    <div className="brand-pad">
      <span className="brand-word">My blunders</span>
    </div>
  );
}
