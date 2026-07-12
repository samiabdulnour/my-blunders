import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for the iOS shell.
 *
 * `webDir: 'out'` points at the static export produced by
 * `npm run build:static` — Capacitor copies that into
 * `ios/App/App/public/` on every `cap sync`.
 *
 * `backgroundColor` matches the terminal-green theme so the brief
 * flash between the launch screen and the WebView paint isn't jarring.
 *
 * The iOS section's `contentInset: 'always'` stops the WebView's
 * scrollable content from sliding under the status bar / home
 * indicator — important for the fullscreen terminal look.
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
  backgroundColor: '#2da66a',
  ios: {
    contentInset: 'always',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
