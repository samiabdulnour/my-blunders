import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge middleware for `/api/*`: per-IP rate limiting + CORS.
 *
 * ── Rate limiting (abuse / cost guard) ──
 * The API routes are unauthenticated and proxy to upstream chess APIs, so a
 * bot or a promo spike can (a) get us throttled by Lichess/chess.com and
 * (b) run up Vercel function invocations. A fixed-window per-IP limiter caps
 * both. This is a *best-effort* limiter: middleware state lives in the Edge
 * isolate's memory, so under Vercel's autoscaling the count is per-instance,
 * not global — it reliably stops a single client hammering one instance, and
 * blunts a broad flood, but for hard global guarantees swap the Map for a
 * shared store (Upstash Ratelimit / Vercel KV). It is deliberately generous so
 * a normal import (which fans out to several upstream fetches) never trips it.
 *
 * ── CORS ──
 * The web deployment serves frontend + API same-origin (no preflight). The
 * Capacitor iOS build loads from a `capacitor://localhost` origin and calls the
 * hosted `/api/…` cross-origin, so it needs these headers. The endpoints are
 * unauthenticated with no cookies/secrets, so a permissive `*` origin is fine;
 * swap for an allowlist if auth is ever added.
 */

const WINDOW_MS = 30_000;
const MAX_REQUESTS = 100; // per IP per window — well above any real user's rate

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest): string {
  // Vercel puts the real client first in x-forwarded-for.
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Returns null if allowed, or the seconds-until-reset if the IP is over quota. */
function rateLimited(ip: string, now: number): number | null {
  // Opportunistically sweep expired buckets so the Map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  b.count++;
  if (b.count > MAX_REQUESTS) return Math.ceil((b.resetAt - now) / 1000);
  return null;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';

  // Preflight — respond immediately with the allow headers (never rate-limited).
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const retryAfter = rateLimited(clientIp(req), Date.now());
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: 'rate limit exceeded, slow down' },
      {
        status: 429,
        headers: { ...corsHeaders(origin), 'Retry-After': String(retryAfter) },
      }
    );
  }

  // Let the route run, then layer on the CORS headers.
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
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
