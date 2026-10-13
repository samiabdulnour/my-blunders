import { isNativeApp } from './platform';

/**
 * The App Store rating prompt (SKStoreReviewController, via
 * @capacitor-community/in-app-review), asked for at most once per app version
 * and only at a moment the app has earned it:
 *
 *  · after a poster or wallpaper is saved — the person waited for the evals,
 *    picked a board, and kept the result; or
 *  · on the third puzzle from their OWN games solved in one session (the
 *    famous-blunders library doesn't count — that isn't the app proving itself).
 *
 * Never on the first day of use, never on the web, never on launch, never
 * after a failed puzzle or an error, and never from a button: Apple's
 * guidelines forbid putting the native prompt behind a "Rate us" control.
 *
 * Apple adds its own limits on top (at most three prompts a year, and none at
 * all in TestFlight builds); in Debug and the Simulator it shows every time and
 * never submits.
 */

const KEY = 'mb:review';
/** Own-game puzzles solved in one session that earn the fallback prompt. */
const SOLVES_FOR_PROMPT = 3;
/** Let the share sheet finish dismissing before the prompt slides up. */
const PROMPT_DELAY_MS = 900;

export type ReviewTrigger = 'save' | 'solves';

export interface ReviewState {
  /** Local date (YYYY-MM-DD) the app was first used with this feature. */
  firstDay: string;
  /** App version the prompt was last requested in, if any. */
  promptedVersion: string | null;
}

/** Every guard but the moment itself: the caller only asks at a good one. */
export function reviewDecision(
  state: ReviewState | null,
  env: { native: boolean; today: string; version: string | null },
): { ok: boolean; reason?: string } {
  if (!env.native) return { ok: false, reason: 'not the native app' };
  if (!state) return { ok: false, reason: 'no record of first use yet' };
  if (env.today <= state.firstDay) return { ok: false, reason: 'still the first day of use' };
  if (!env.version) return { ok: false, reason: 'app version unknown' };
  if (state.promptedVersion === env.version) return { ok: false, reason: `already asked in ${env.version}` };
  return { ok: true };
}

/** Local calendar date, so "a new day" means the person's day, not UTC's. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function load(): ReviewState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s.firstDay === 'string'
      ? { firstDay: s.firstDay, promptedVersion: typeof s.promptedVersion === 'string' ? s.promptedVersion : null }
      : null;
  } catch {
    return null;
  }
}

function save(s: ReviewState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — worst case we ask again next version */
  }
}

const log = (...a: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') console.info('[review]', ...a);
};

/** Record a day of use. Call once on launch; it never prompts. */
export function noteAppUse(): void {
  if (typeof window === 'undefined') return;
  if (!load()) save({ firstDay: localDay(), promptedVersion: null });
}

let ownSolves = 0;

/** A puzzle from the user's own games was solved first try. The third in a
 *  session is the fallback moment to ask. */
export function noteOwnPuzzleSolved(): void {
  ownSolves++;
  log(`own-game solve ${ownSolves}/${SOLVES_FOR_PROMPT} this session`);
  if (ownSolves >= SOLVES_FOR_PROMPT) void maybeRequestReview('solves');
}

let inFlight = false;

/** Ask for a rating if, and only if, every guard holds. */
export async function maybeRequestReview(trigger: ReviewTrigger): Promise<void> {
  if (typeof window === 'undefined' || inFlight) return;
  inFlight = true;
  try {
    const native = isNativeApp();
    let version: string | null = null;
    if (native) {
      try {
        const { App } = await import('@capacitor/app');
        version = (await App.getInfo()).version;
      } catch {
        version = null;
      }
    }
    const state = load();
    const d = reviewDecision(state, { native, today: localDay(), version });
    if (!d.ok) {
      log(`${trigger}: not asking — ${d.reason}`);
      return;
    }
    // Spend this version's ask before requesting, so a crash or a second
    // trigger mid-request can't ask twice.
    save({ ...(state as ReviewState), promptedVersion: version });
    log(`${trigger}: asking (version ${version})`);
    await new Promise((r) => setTimeout(r, PROMPT_DELAY_MS));
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
  } catch (e) {
    log(`${trigger}: request failed`, e);
  } finally {
    inFlight = false;
  }
}
