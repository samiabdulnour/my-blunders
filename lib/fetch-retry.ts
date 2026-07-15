/**
 * fetch() with bounded retry + exponential backoff for upstream chess APIs.
 *
 * Why this exists: every game import is proxied through our server to Lichess /
 * chess.com, so under a traffic spike all users egress from a small pool of
 * server IPs. Those APIs rate-limit by IP and answer with **429** (plus an
 * occasional 5xx / transient network error). Without backoff, a spike turns a
 * momentary throttle into a wall of hard failures. This retries the *retryable*
 * cases only, honours a `Retry-After` header when present, and otherwise backs
 * off exponentially with jitter.
 *
 * A 4xx that isn't 429 (e.g. 404 unknown user) is NOT retried — it won't get
 * better on a retry and would just waste the upstream's patience.
 */

export interface RetryOpts {
  /** Max retry attempts after the first try (default 3 → up to 4 requests). */
  retries?: number;
  /** Base backoff in ms; doubles each attempt (default 500). */
  baseDelayMs?: number;
  /** Ceiling for a single backoff wait (default 8000). */
  maxDelayMs?: number;
  /** Overall budget across all attempts; give up once exceeded (default 20000). */
  totalBudgetMs?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms, or null. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(h);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
  opts: RetryOpts = {}
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 8000;
  const budget = opts.totalBudgetMs ?? 20_000;

  const startedAt = Date.now();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(input, init);
    } catch (err) {
      // Network-level failure (DNS, reset, timeout) — retryable.
      lastErr = err;
    }

    if (res && !RETRYABLE_STATUS.has(res.status)) {
      // Success or a non-retryable 4xx — hand it straight back.
      return res;
    }

    // Out of attempts: return the last response (so the caller sees the real
    // status/body) or rethrow the last network error.
    if (attempt === retries) {
      if (res) return res;
      throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
    }

    // Decide how long to wait: honour Retry-After, else exponential + jitter.
    const backoff = Math.min(maxDelay, base * 2 ** attempt);
    const jitter = Math.floor((backoff / 2) * ((attempt * 2654435761) % 1000) / 1000);
    let wait = (res && retryAfterMs(res)) ?? backoff + jitter;

    // Don't blow the overall budget; if the wait would exceed it, give up now.
    const elapsed = Date.now() - startedAt;
    if (elapsed + wait > budget) {
      if (res) return res;
      throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
    }
    wait = Math.min(wait, budget - elapsed);

    // Free the unread body before re-issuing so we don't leak the socket.
    if (res) await res.body?.cancel().catch(() => {});
    await sleep(wait);
  }

  // Unreachable, but satisfies the type checker.
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
}
