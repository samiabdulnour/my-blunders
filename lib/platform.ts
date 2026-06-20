/**
 * Runtime platform detection.
 *
 * We deliberately sniff the Capacitor global rather than importing
 * `@capacitor/core` so this stays a zero-dependency check that's safe to call
 * during SSR (returns false on the server and in a plain browser).
 *
 * Why it matters: the web build runs Stockfish analysis on the client via WASM
 * (cheap to scale — each user's own device does the work). The iOS Capacitor
 * build keeps calling the Render backend for analysis instead, so it never
 * distributes the GPL-licensed engine binary. This flag is the fork between
 * those two paths.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
}
