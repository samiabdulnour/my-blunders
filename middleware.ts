import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * CORS middleware for `/api/*` routes.
 *
 * ── Why this exists ──
 * Originally the Capacitor-wrapped iOS build loaded its frontend from a
 * `capacitor://localhost` origin and then called our hosted API cross-origin,
 * which WebKit blocks without CORS headers. That is no longer how the app
 * works: it is self-contained and calls no backend of ours (see `docs/ios.md`),
 * so nothing we ship depends on these headers today. The web deployment serves
 * frontend and API from one origin and never triggers a preflight.
 *
 * It is kept because `/api/*` is a genuinely public, unauthenticated read
 * surface (PGN and opening-explorer proxies) and leaving CORS on costs nothing
 * while keeping the door open for a non-same-origin client later.
 *
 * ── Safety ──
 * The existing `/api/*` endpoints are unauthenticated read endpoints (seed
 * puzzle list, PGN and explorer proxies) and compute-bound stream endpoints
 * (Lichess import + PGN analysis) that only operate on the username passed in
 * the request body. There are no secrets to protect, no session cookies to
 * leak, and no credentialed requests — so a permissive `*` origin is fine
 * here. If we ever add auth, swap the wildcard for an explicit allowlist.
 */
export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';

  // Preflight — respond immediately with the allow headers.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // Non-preflight: let the route run, then layer on the headers.
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Scope the middleware to the API only — we don't want to pay the cost
 * on every HTML / static-asset request.
 */
export const config = {
  matcher: '/api/:path*',
};
