/**
 * Resolve a `/api/...` path into a fully qualified URL.
 *
 * ── Why this exists ──
 * On the web deployment (Vercel) the frontend and the API are same-origin, so
 * every `fetch('/api/puzzles')` call just works. When the app is statically
 * bundled into the iOS Capacitor shell, though, the frontend loads from a
 * `capacitor://` origin with no backend beside it, so the same relative URL
 * resolves against the local bundle and 404s.
 *
 * The `NEXT_PUBLIC_API_BASE` env var is the escape hatch:
 *   · unset / empty         → same-origin (what both builds ship with today)
 *   · "https://example.com" → prepended to every API call
 *
 * Because the var is prefixed with `NEXT_PUBLIC_`, Next.js inlines it at
 * build time, so a static export has the URL baked in.
 *
 * It is deliberately unset in both builds: the web is same-origin, and the iOS
 * app is self-contained on its main paths — it fetches PGN straight from
 * Lichess / chess.com and analyzes on-device (see `docs/ios.md`). Note that the
 * Opening Clinic's corpus build (`lib/opening-import.ts`) and theory lookups
 * (`lib/opening-explorer.ts`) still call the proxy unconditionally, with no
 * native fork, so those two features are inert inside the native app.
 */
export function apiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');
  return base + path;
}
