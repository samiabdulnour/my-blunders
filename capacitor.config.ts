import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for the iOS shell.
 *
 * `webDir: 'out'` points at the static export produced by
 * `npm run build:static` — Capacitor copies that into
 * `ios/App/App/public/` on every `cap sync`.
 *
 * `backgroundColor` is the app's paper background, so the safe-area bands
 * (behind the Dynamic Island / status bar and the home indicator) and any
 * brief flash before the WebView paints read as paper — not a coloured edge.
 *
 * The iOS section's `contentInset: 'never'` lets the WebView fill the screen
 * edge-to-edge and hands safe-area handling entirely to CSS
 * `env(safe-area-inset-*)` (the header reserves the top inset; the app root
 * pads the bottom). Applying the *native* inset ('always') on top of the CSS
 * insets double-counts them — which pushed the UI under the Dynamic Island and
 * desynced on rotation. One source of truth (CSS) fixes both.
 *
 * `CapacitorHttp` is enabled so the app can fetch a user's games straight
 * from Lichess / chess.com without a backend of our own: it patches
 * `window.fetch` to route cross-origin requests through the native HTTP
 * stack, which isn't bound by the WebView's CORS policy (chess.com's public
 * API sends no CORS headers, so a plain WebView fetch would be blocked). It
 * also lets us send the `User-Agent` chess.com requires — a header the
 * WebView's fetch won't let JS set. Analysis itself runs fully on-device via
 * the bundled WASM engine, so no server is involved at all.
 */
const config: CapacitorConfig = {
  appId: 'com.samiabdulnour.myblunders',
  appName: 'My Blunders',
  webDir: 'out',
  backgroundColor: '#f1eee8',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
