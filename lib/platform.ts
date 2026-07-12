/**
 * Runtime platform detection.
 *
 * We deliberately sniff the Capacitor global rather than importing
 * `@capacitor/core` so this stays a zero-dependency check that's safe to call
 * during SSR (returns false on the server and in a plain browser).
 *
 * Why it matters: analysis runs on-device via WASM Stockfish on every
 * platform. The one thing that differs is where a user's games are fetched
 * from — web goes through our same-origin `/api/*` PGN proxy, while the native
 * app has no backend and fetches straight from Lichess / chess.com over
 * Capacitor's native HTTP (which bypasses the WebView's CORS). This flag is
 * that fork. (Because the native app bundles the GPL WASM engine, it "conveys"
 * it under the GPL — the in-app About page carries the required notice + source
 * offer.)
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
}
