'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSource, Puzzle } from './types';
import { apiUrl } from './api';
import { isNativeApp } from './platform';
import { parsePgn, oldestGameStartMs, type ParsedGame } from './pgn';
import { fetchLichessGamesPgn } from './lichess';
import { fetchChessComGamesPgn } from './chesscom';
import { analyseGame } from './puzzle-generator';
import { setImportStatus, type ImportStatus } from './import-status';
import { summarizeGame, type OpeningGame } from './opening-tree';
import { getWasmEngine } from './engine/wasm-engine';
import { useAutoImport } from './use-auto-import';
import { recordEloFromGames } from './player-elo';
import {
  loadUsername,
  saveUsername,
  loadSource,
  saveSource,
  loadOldestFetchedMs,
  saveOldestFetchedMs,
  loadFetchedGameCount,
  saveFetchedGameCount,
  loadOpeningGames,
  saveOpeningGames,
  mergeOpeningGames,
  loadPuzzles,
} from './storage';

/** PGN proxy for each source. */
const PGN_PROXY: Record<GameSource, string> = {
  lichess: '/api/lichess/pgn',
  chesscom: '/api/chesscom/pgn',
};

/** Persist compact opening-tree summaries for an imported batch (web path). */
function persistOpeningGames(games: ParsedGame[], username: string): void {
  const summaries = games
    .map((g) => summarizeGame(g, username))
    .filter((s): s is OpeningGame => s !== null);
  if (summaries.length) saveOpeningGames(mergeOpeningGames(loadOpeningGames(), summaries));
}

/**
 * Rebuild a lost pagination cursor from the puzzles already on disk.
 *
 * Builds before the importer moved to the page root ran the first import inside
 * the onboarding screen, which unmounts at hand-off — and the cursor was saved
 * from inside a state updater, which React never runs on an unmounted
 * component. Those installs hold puzzles but no cursor, and the auto-import loop
 * refuses to start without one. Puzzles only carry a day-granular date, so the
 * cursor is the *end* of the oldest puzzle's day: a few games get re-fetched,
 * which `mergePuzzles` de-dupes by id — better than skipping part of that day.
 *
 * Returns null when there is nothing to recover from (a genuine first run).
 */
function recoverCursorFromPuzzles(src: GameSource): { oldestMs: number; games: number } | null {
  const host = src === 'chesscom' ? 'chess.com' : 'lichess.org';
  const own = loadPuzzles().filter((p) => !p.id.startsWith('famous_') && p.site.includes(host));
  let oldest: number | null = null;
  for (const p of own) {
    const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(p.date);
    if (!m) continue;
    const dayEnd = Date.UTC(+m[1], +m[2] - 1, +m[3]) + 86_400_000;
    if (oldest == null || dayEnd < oldest) oldest = dayEnd;
  }
  if (oldest == null) return null;
  // Games that yielded a puzzle — a floor on how many were really analysed.
  return { oldestMs: oldest, games: new Set(own.map((p) => p.gameId)).size };
}

export type { ImportStatus };

/** Games imported per batch. Small enough to feel responsive, large enough
 *  that the user usually gets several puzzles per click. With auto-import on,
 *  batches chain back-to-back in the background until the user's history runs
 *  out — there is no game cap, on any platform. */
export const BATCH_SIZE = 20;

/** Backpressure for the auto-import loop: it pauses once this many unsolved
 *  puzzles are waiting and resumes as they get solved. Not a cap — the whole
 *  history is still reachable, the loop just stays one step ahead of the user
 *  instead of racing through thousands of games. Racing would fill localStorage
 *  (~5 MB in WebKit), at which point new puzzles AND solve progress silently
 *  stop saving, while the cursor keeps advancing past games that were lost. */
export const QUEUE_TARGET = 100;

/**
 * One import event. Both the native NDJSON stream and the web WASM pipeline
 * emit these so they can share a single handler (`processEvent`) and drive the
 * UI identically.
 */
type ImportEvent = Record<string, unknown> & { type: string };

/** Mutable per-import accumulator passed through `processEvent`. */
interface ImportCtx {
  parsedGames: number;
  totalPuzzles: number;
}

interface UseImporterOptions {
  /** Called as puzzles arrive. May be called many times during a streamed import. */
  onImport: (newPuzzles: Puzzle[]) => void;
  /** How many of the user's own puzzles are unsolved. Auto-import pauses while
   *  this is at or above QUEUE_TARGET. Leave undefined until the saved puzzles
   *  have loaded — an unknown queue must not read as an empty one. */
  unseenCount?: number;
  /** When false, the auto-import effect is suppressed (e.g. during onboarding,
   *  where the import is driven explicitly by the CTA). Defaults to true. */
  autoImport?: boolean;
  /** Fired once the user's own games have been fetched + parsed — before any
   *  analysis has produced a puzzle. Lets the UI drop guest/famous placeholders
   *  the instant real games arrive, rather than waiting for the first puzzle
   *  (which may be seconds away, or never, if the games hold no blunders). */
  onGamesFetched?: () => void;
}

/**
 * Encapsulates everything about pulling games from Lichess/chess.com and
 * turning them into puzzles. Analysis is always on-device (WASM Stockfish);
 * only where the PGN is fetched from differs by platform:
 *
 *   · web    — fetch raw PGN from the same-origin `/api/lichess/pgn` /
 *              `/api/chesscom/pgn` proxy (keeps the browser same-origin and lets
 *              a server-side token lift rate limits), then parse + analyze in the
 *              browser. The server does no chess compute, so it scales for free.
 *   · native — the iOS Capacitor build fetches PGN **directly** from Lichess /
 *              chess.com (Capacitor's native HTTP bypasses CORS) and analyzes
 *              on-device too, so the app needs no backend at all. It does ship
 *              the GPL WASM engine in the bundle — see the in-app About page for
 *              the license notice + source offer that keeps that compliant.
 *
 * Both platforms run the identical parse → analyze → `processEvent` pipeline, so
 * the sidebar import bar and the first-run onboarding flow behave the same
 * either way. State that needs to survive reloads (username, pagination cursor,
 * fetched-game count) is mirrored to localStorage.
 */
export function useImporter({
  onImport,
  unseenCount,
  autoImport = true,
  onGamesFetched,
}: UseImporterOptions) {
  const [username, setUsername] = useState('');
  const [source, setSourceState] = useState<GameSource>('lichess');
  /** Live status goes to an external store, not state: this hook sits at the
   *  page root, and a progress tick must not re-render the whole app. */
  const setStatus = setImportStatus;
  /**
   * UNIX ms of the oldest Lichess game already imported. Serves as the
   * pagination cursor for subsequent (auto-triggered) imports. `null`
   * until the first successful import.
   */
  const [oldestMs, setOldestMs] = useState<number | null>(null);
  /**
   * Cumulative games pulled from Lichess across all batches (persists
   * across reloads). Purely informational — shown in the counter so the
   * user can see how far the auto-import has gotten. No hard cap.
   */
  const [fetchedCount, setFetchedCount] = useState(0);
  /**
   * True once we've hydrated `oldestMs`, `fetchedCount`, and `username`
   * from localStorage. Gating the auto-import effect on this prevents
   * it from firing a stale import on first render.
   */
  const [hydrated, setHydrated] = useState(false);
  /**
   * `working` lives as a ref too so the auto-import effect can check it
   * without depending on the state value — avoids a render-loop where
   * setState → re-run effect → setState.
   */
  const workingRef = useRef(false);
  /**
   * Set once Lichess returns 0 games for a requested cursor — means the
   * user has been paginated to the beginning of their recorded history.
   * Stops the auto-import loop so we don't spin forever on an empty tail.
   */
  const [exhausted, setExhausted] = useState(false);
  /** User toggle (shared store, set from the top-bar button): on → auto-import
   *  keeps pulling batches until history runs out; off → manual "Import more". */
  const autoImportEnabled = useAutoImport();
  /** Synchronous mirror of the toggle so a batch finishing mid-toggle (which
   *  re-runs the chain effect before React commits the render) sees the new
   *  value immediately — otherwise OFF lags by a batch or two. */
  const autoImportEnabledRef = useRef(autoImportEnabled);
  autoImportEnabledRef.current = autoImportEnabled;
  /** Identity of the import that currently owns the UI. Every import takes the
   *  next id; "Clear all" bumps it too. A run that no longer matches is dead: it
   *  stops at its next engine search and may not touch status, puzzles or the
   *  cursor. (A shared boolean couldn't do this — starting a new import reset
   *  it, which *revived* the cancelled batch alongside the new one.) */
  const runIdRef = useRef(0);

  useEffect(() => {
    const savedName = loadUsername();
    const savedSource = loadSource();
    let cursor = loadOldestFetchedMs();
    let fetched = loadFetchedGameCount();
    // Heal installs whose first import never got to save its cursor.
    if (cursor == null && savedName.trim()) {
      const recovered = recoverCursorFromPuzzles(savedSource);
      if (recovered) {
        cursor = recovered.oldestMs;
        fetched = Math.max(fetched, recovered.games);
        saveOldestFetchedMs(cursor);
        saveFetchedGameCount(fetched);
      }
    }
    setUsername(savedName);
    setSourceState(savedSource);
    setOldestMs(cursor);
    setFetchedCount(fetched);
    setHydrated(true);
  }, []);

  /** Switch import source. Resets the pagination cursor — a different site means
   *  a different account/history, so the old cursor no longer applies. */
  const setSource = useCallback((s: GameSource) => {
    setSourceState(s);
    saveSource(s);
    setOldestMs(null);
    setExhausted(false);
  }, []);

  /* ── Shared event handling ──
     Apply one import event to status / store / pagination cursor. Returns
     'done' or 'error' on a terminal event so the caller can stop. */
  const processEvent = useCallback(
    (evt: ImportEvent, ctx: ImportCtx): 'continue' | 'done' | 'error' => {
      switch (evt.type) {
        case 'status':
          setStatus((prev) => ({
            kind: 'working',
            message: (evt.message as string) ?? prev.message,
            progress: prev.progress,
          }));
          return 'continue';
        case 'parsed':
          ctx.parsedGames = (evt.total as number) ?? 0;
          // The user's own games are now in hand — let the UI retire any guest
          // placeholders immediately, without waiting for the first puzzle.
          if (ctx.parsedGames > 0) onGamesFetched?.();
          setStatus({
            kind: 'working',
            message: `Got ${ctx.parsedGames} ${ctx.parsedGames === 1 ? 'game' : 'games'} · starting…`,
            progress: { current: 0, total: ctx.parsedGames },
          });
          return 'continue';
        case 'progress':
          setStatus({
            kind: 'working',
            message: (evt.message as string) ?? 'analyzing...',
            progress: {
              current: (evt.current as number) ?? 0,
              total: (evt.total as number) ?? ctx.parsedGames,
            },
          });
          return 'continue';
        case 'puzzles': {
          const puzzles = (evt.puzzles as Puzzle[]) ?? [];
          if (puzzles.length > 0) {
            onImport(puzzles);
            ctx.totalPuzzles += puzzles.length;
          }
          return 'continue';
        }
        case 'game-error':
          // Non-fatal — note in the console and keep going.
          console.warn(`game ${(evt.gameId as string) ?? '?'} failed:`, evt.message);
          return 'continue';
        case 'done': {
          // Advance the pagination cursor. Subtract 1ms so the next import
          // doesn't re-request the boundary game.
          const oldest = evt.oldestMs;
          if (typeof oldest === 'number' && oldest > 0) {
            const nextCursor = oldest - 1;
            // Only move the cursor backwards (older). Never let a newer batch
            // overwrite an older cursor already on disk.
            setOldestMs((prev) => {
              const next = prev == null ? nextCursor : Math.min(prev, nextCursor);
              saveOldestFetchedMs(next);
              return next;
            });
          }
          // Accumulate the game count for the counter display.
          const batchParsed = (evt.parsedGames as number) ?? ctx.parsedGames ?? 0;
          setFetchedCount((prev) => {
            const next = prev + batchParsed;
            saveFetchedGameCount(next);
            return next;
          });
          // Zero games back means we've paginated past the user's oldest
          // recorded game — no point asking again.
          if (batchParsed === 0) setExhausted(true);
          setStatus({
            kind: 'ok',
            message: `Checked ${batchParsed} games · ${evt.generated} new ${evt.generated === 1 ? 'puzzle' : 'puzzles'}`,
          });
          return 'done';
        }
        case 'error':
          setStatus({ kind: 'error', message: (evt.message as string) ?? 'stream error' });
          return 'error';
        default:
          return 'continue';
      }
    },
    [onImport, onGamesFetched]
  );

  /* ── Analyse a batch, streaming puzzles out as they are confirmed ──
     Shared by the fetch import and the PGN upload. Resolves false when the run
     was superseded part-way (cleared, or replaced by a newer import) — the
     caller must then write nothing back. */
  const analyseGames = useCallback(
    async (
      games: ParsedGame[],
      name: string,
      ctx: ImportCtx,
      isCurrent: () => boolean
    ): Promise<boolean> => {
      const engine = getWasmEngine();
      // Games that already carry evals (Lichess server analysis) cost one search
      // per mistake instead of a full scan, so they go first: the first puzzles
      // land within seconds of the download. (A stable sort keeps the rest in
      // date order.)
      const hasEvals = (g: ParsedGame) => g.moves.some((m) => m.evalCp !== null || m.mate !== null);
      const ordered = [...games].sort((a, b) => Number(hasEvals(b)) - Number(hasEvals(a)));
      // Say what is happening in words a player cares about: which game, how far
      // through it, and what it has produced so far.
      const found = () =>
        ctx.totalPuzzles > 0
          ? ` · ${ctx.totalPuzzles} ${ctx.totalPuzzles === 1 ? 'puzzle' : 'puzzles'} found`
          : '';
      let lastTick = 0;

      for (let i = 0; i < ordered.length; i++) {
        if (!isCurrent()) return false;
        const game = ordered[i];
        const label = `Checking game ${i + 1} of ${ordered.length}`;
        const progress = { current: i, total: ordered.length };
        setStatus({ kind: 'working', message: `${label} · looking for blunders${found()}`, progress });
        try {
          await analyseGame(game, name, engine, {
            shouldStop: () => !isCurrent(),
            onPuzzle: (puzzle) => {
              if (isCurrent()) processEvent({ type: 'puzzles', gameId: game.gameId, puzzles: [puzzle] }, ctx);
            },
            onProgress: (done, total) => {
              // A scan ply takes milliseconds; cap the UI at ~4 updates a second.
              const now = Date.now();
              if (done !== total && now - lastTick < 250) return;
              lastTick = now;
              if (!isCurrent()) return;
              setStatus({
                kind: 'working',
                message: `${label} · move ${Math.ceil(done / 2)} of ${Math.ceil(total / 2)}${found()}`,
                progress,
                moveProgress: { done, total },
              });
            },
          });
        } catch (err) {
          // Non-fatal — note in the console and keep going.
          console.warn(`game ${game.gameId ?? '?'} failed:`, (err as Error).message);
        }
      }
      return isCurrent();
    },
    [processEvent, setStatus]
  );

  /* ── Import path: fetch PGN, analyze locally with WASM Stockfish ──
     Lichess games that ship evals go straight to puzzle-finding; chess.com (and
     any eval-less PGN) is scanned by the engine first — see `analyseGame`. */
  const runWasmImport = useCallback(
    async (
      name: string,
      src: GameSource,
      untilCursor: number | null | undefined,
      isCurrent: () => boolean
    ) => {
      const ctx: ImportCtx = { parsedGames: 0, totalPuzzles: 0 };

      // Where the PGN comes from is the only web/native difference. On web we go
      // through our same-origin proxy; on native there's no server, so we call
      // Lichess / chess.com directly (Capacitor's native HTTP bypasses the CORS
      // that would otherwise block a cross-origin fetch from the WebView).
      let pgn: string;
      try {
        if (isNativeApp()) {
          pgn =
            src === 'chesscom'
              ? await fetchChessComGamesPgn({
                  username: name,
                  max: BATCH_SIZE,
                  untilMillis: untilCursor ?? undefined,
                })
              : await fetchLichessGamesPgn({
                  username: name,
                  max: BATCH_SIZE,
                  untilMillis: untilCursor ?? undefined,
                });
        } else {
          const url = new URL(apiUrl(PGN_PROXY[src]), window.location.origin);
          url.searchParams.set('username', name);
          url.searchParams.set('max', String(BATCH_SIZE));
          if (untilCursor) url.searchParams.set('until', String(untilCursor));
          const res = await fetch(url.toString());
          if (!res.ok) {
            const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          pgn = await res.text();
        }
      } catch (err) {
        if (isCurrent()) processEvent({ type: 'error', message: (err as Error).message }, ctx);
        return;
      }
      if (!isCurrent()) return; // cleared / superseded while downloading

      const games = parsePgn(pgn);
      processEvent({ type: 'parsed', total: games.length }, ctx);

      if (games.length === 0) {
        processEvent({ type: 'done', parsedGames: 0, generated: 0, oldestMs: null }, ctx);
        return;
      }

      const finished = await analyseGames(games, name, ctx, isCurrent);
      if (!finished) return; // superseded — write nothing back

      // Feed the Opening Clinic from the (now eval-annotated) games.
      persistOpeningGames(games, name);
      recordEloFromGames(games, name); // size Assisted Play to your rating

      processEvent(
        {
          type: 'done',
          parsedGames: games.length,
          generated: ctx.totalPuzzles,
          oldestMs: oldestGameStartMs(games),
        },
        ctx
      );
    },
    [processEvent, analyseGames]
  );

  /* ── Import a batch (up to BATCH_SIZE). `untilCursor` pages older. ── */
  const runImport = useCallback(
    async (untilCursor?: number | null) => {
      const name = username.trim();
      if (!name) {
        const site = source === 'chesscom' ? 'chess.com' : 'Lichess';
        setStatus({ kind: 'error', message: `enter your ${site} username first` });
        return;
      }
      saveUsername(name);
      saveSource(source);

      const run = ++runIdRef.current;
      const isCurrent = () => runIdRef.current === run;
      workingRef.current = true;
      setStatus({
        kind: 'working',
        message: untilCursor ? 'Downloading older games…' : 'Downloading your latest games…',
      });

      try {
        // One pipeline for every platform: fetch PGN, then analyze on-device
        // with WASM Stockfish. (Native fetches the PGN directly; web via proxy.)
        await runWasmImport(name, source, untilCursor, isCurrent);
      } catch (err) {
        if (isCurrent()) setStatus({ kind: 'error', message: (err as Error).message });
      } finally {
        // A superseded run owns nothing any more — whoever replaced it (a newer
        // import, or a clear) has already set `working` and the status.
        if (isCurrent()) workingRef.current = false;
      }
    },
    [username, source, runWasmImport, setStatus]
  );

  /* ── PGN file upload fallback ──
     For users who have a PGN exported from somewhere and don't want to wait
     on the Lichess API. Analyzed on-device like everything else. */
  const importFile = useCallback(
    async (file: File) => {
      // Bound the upload so a huge PGN can't OOM the tab (file.text loads it all
      // into memory) or kick off an effectively endless analysis loop.
      const MAX_UPLOAD_BYTES = 4_000_000; // ~4 MB
      const MAX_UPLOAD_GAMES = 200;
      const name = username.trim();
      if (!name) {
        setStatus({ kind: 'error', message: 'enter your Lichess username first' });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setStatus({ kind: 'error', message: 'That PGN is too large (max 4 MB).' });
        return;
      }
      saveUsername(name);

      const run = ++runIdRef.current;
      const isCurrent = () => runIdRef.current === run;
      workingRef.current = true;
      setStatus({ kind: 'working', message: `Reading ${file.name}…` });
      try {
        const pgn = await file.text();
        if (!isCurrent()) return;

        // Cap the game count so an enormous PGN can't run the analysis loop for
        // hours.
        const games = parsePgn(pgn).slice(0, MAX_UPLOAD_GAMES);
        if (games.length === 0) {
          setStatus({ kind: 'error', message: 'No games found in that PGN file.' });
          return;
        }
        // Real games are in hand — drop any guest placeholders right away.
        onGamesFetched?.();
        const ctx: ImportCtx = { parsedGames: games.length, totalPuzzles: 0 };
        const finished = await analyseGames(games, name, ctx, isCurrent);
        if (!finished) return; // superseded — skip write-back
        persistOpeningGames(games, name); // feed the Opening Clinic (now annotated)
        recordEloFromGames(games, name); // size Assisted Play to your rating
        setStatus({
          kind: 'ok',
          message: `Checked ${games.length} games · ${ctx.totalPuzzles} new ${ctx.totalPuzzles === 1 ? 'puzzle' : 'puzzles'}`,
        });
      } catch (err) {
        if (isCurrent()) setStatus({ kind: 'error', message: (err as Error).message });
      } finally {
        if (isCurrent()) workingRef.current = false;
      }
    },
    [username, onGamesFetched, analyseGames, setStatus]
  );

  /* ── Auto-import loop ──
     When auto-import is on, keep pulling + analysing batches in the background
     until the user runs out of history — there's no game cap, only backpressure
     (QUEUE_TARGET) so the loop stays ahead of the solver rather than racing.
     Each finished batch advances oldestMs / fetchedCount, and each solve lowers
     unseenCount; either re-triggers this effect. Only fires once a first import
     has established a cursor (kicked off manually or by onboarding).

     This hook must stay mounted for the loop to run: it lives at the page root,
     NOT inside the settings panel (which unmounts whenever it's closed). */
  useEffect(() => {
    if (!autoImport) return; // context gate (suppressed during onboarding)
    if (!autoImportEnabled || !autoImportEnabledRef.current) return; // user toggle
    if (!hydrated) return;
    if (workingRef.current) return;
    if (exhausted) return; // paginated to the start of history — nothing left
    if (oldestMs == null) return; // need a first import to set the cursor
    if (unseenCount == null) return; // saved puzzles not loaded yet — queue unknown
    if (unseenCount >= QUEUE_TARGET) return; // plenty waiting; resume as they're solved
    if (!username.trim()) return;
    runImport(oldestMs);
  }, [autoImport, autoImportEnabled, hydrated, oldestMs, fetchedCount, unseenCount, username, exhausted, runImport]);

  /** Reset the pagination cursor + counters after a cache clear, and abort any
   *  in-flight import so it doesn't write puzzles/openings back post-clear. */
  const resetCursor = useCallback(() => {
    runIdRef.current++; // orphan any in-flight import: it stops at its next search
    workingRef.current = false;
    setOldestMs(null);
    setFetchedCount(0);
    setExhausted(false);
  }, []);

  return {
    username,
    setUsername,
    source,
    setSource,
    /** Live status is read with `useImportStatus()` (it isn't page state). */
    setStatus,
    oldestMs,
    fetchedCount,
    exhausted,
    runImport,
    importFile,
    resetCursor,
  };
}

/** The shared importer instance, created once at the page root and handed to
 *  the onboarding screen and the settings-panel import bar. */
export type Importer = ReturnType<typeof useImporter>;
