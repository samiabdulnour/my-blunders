'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSource, Puzzle } from './types';
import { apiUrl } from './api';
import { isNativeApp } from './platform';
import { parsePgn, oldestGameStartMs, type ParsedGame } from './pgn';
import { generatePuzzlesFromGame, annotateEvalsIfMissing } from './puzzle-generator';
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

export interface ImportStatus {
  kind: 'idle' | 'working' | 'ok' | 'error';
  message?: string;
  /** Current/total game count for the progress bar, when known. */
  progress?: { current: number; total: number };
  /** Move-level analysis progress within the current game (engine-annotated
   *  games only), so a fetching screen can show a bar that actually fills. */
  moveProgress?: { done: number; total: number };
}

/** Games imported per batch. Small enough to feel responsive, large enough
 *  that the user usually gets several puzzles per click. */
export const BATCH_SIZE = 20;

/** With auto-import on, keep pulling + analysing batches in the background until
 *  this many games have been imported (or the user's history runs out) — the
 *  "pre-prepared library" target, matching the clinic's corpus. Tunable. */
export const PUZZLE_TARGET_GAMES = 500;

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
  /** How many unsolved puzzles are in the store. Kept for callers; auto-import
   *  now builds toward a fixed target rather than gating on this. */
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
 * Encapsulates everything about pulling games from Lichess and turning them
 * into puzzles. There are two analysis backends, chosen at runtime:
 *
 *   · web    — fetch raw PGN from the `/api/lichess/pgn` proxy, then parse and
 *              analyze entirely in the browser with WASM Stockfish. The server
 *              does no chess compute, so it scales for free.
 *   · native — the iOS Capacitor build keeps streaming from `/api/lichess/import`,
 *              which runs Stockfish on the Render backend (so the app never
 *              ships the GPL engine binary).
 *
 * Both paths emit the same event shape and run through `processEvent`, so the
 * sidebar import bar and the first-run onboarding flow behave the same either
 * way. State that needs to survive reloads (username, pagination cursor,
 * fetched-game count) is mirrored to localStorage.
 */
export function useImporter({
  onImport,
  autoImport = true,
  onGamesFetched,
}: UseImporterOptions) {
  const [username, setUsername] = useState('');
  const [source, setSourceState] = useState<GameSource>('lichess');
  const [status, setStatus] = useState<ImportStatus>({ kind: 'idle' });
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
   *  keeps building toward PUZZLE_TARGET_GAMES; off → manual "Import more". */
  const autoImportEnabled = useAutoImport();
  /** Synchronous mirror of the toggle so a batch finishing mid-toggle (which
   *  re-runs the chain effect before React commits the render) sees the new
   *  value immediately — otherwise OFF lags by a batch or two. */
  const autoImportEnabledRef = useRef(autoImportEnabled);
  autoImportEnabledRef.current = autoImportEnabled;
  /** Set true to abort an in-flight import between games (e.g. on "Clear all"),
   *  so a cancelled batch doesn't write puzzles/openings back after the wipe. */
  const cancelRef = useRef(false);

  useEffect(() => {
    setUsername(loadUsername());
    setSourceState(loadSource());
    setOldestMs(loadOldestFetchedMs());
    setFetchedCount(loadFetchedGameCount());
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
            message: `parsed ${ctx.parsedGames} games — starting analysis...`,
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
            message: `imported ${batchParsed} games → ${evt.generated} puzzles`,
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

  /* ── Native path: stream NDJSON puzzles from the server (server-side SF) ── */
  const runServerImport = useCallback(
    async (name: string, untilCursor?: number | null) => {
      const ctx: ImportCtx = { parsedGames: 0, totalPuzzles: 0 };
      const res = await fetch(apiUrl('/api/lichess/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: name,
          max: BATCH_SIZE,
          ...(untilCursor ? { until: untilCursor } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setStatus({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Read NDJSON line-by-line. Each non-empty line is one JSON event.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let evt: ImportEvent;
          try {
            evt = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (processEvent(evt, ctx) !== 'continue') return;
        }
      }

      // Fallback if the server ended without a final `done` event.
      setFetchedCount((prev) => {
        const next = prev + ctx.parsedGames;
        saveFetchedGameCount(next);
        return next;
      });
      setStatus({ kind: 'ok', message: `${ctx.parsedGames} games → ${ctx.totalPuzzles} puzzles` });
    },
    [processEvent]
  );

  /* ── Web path: fetch PGN, analyze locally with WASM Stockfish ──
     For chess.com (and any eval-less PGN) each game is first run through the
     engine to *find* the blunders — Lichess games already ship evals, so that
     pass is a no-op and the flow is identical. */
  const runWasmImport = useCallback(
    async (name: string, src: GameSource, untilCursor?: number | null) => {
      const ctx: ImportCtx = { parsedGames: 0, totalPuzzles: 0 };

      processEvent({ type: 'status', message: `fetching up to ${BATCH_SIZE} games...` }, ctx);
      const url = new URL(apiUrl(PGN_PROXY[src]), window.location.origin);
      url.searchParams.set('username', name);
      url.searchParams.set('max', String(BATCH_SIZE));
      if (untilCursor) url.searchParams.set('until', String(untilCursor));

      const res = await fetch(url.toString());
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        processEvent({ type: 'error', message: data.error ?? `HTTP ${res.status}` }, ctx);
        return;
      }

      const pgn = await res.text();
      processEvent({ type: 'status', message: 'parsing PGN...' }, ctx);
      const games = parsePgn(pgn);
      processEvent({ type: 'parsed', total: games.length }, ctx);

      if (games.length === 0) {
        processEvent({ type: 'done', parsedGames: 0, generated: 0, oldestMs: null }, ctx);
        return;
      }

      const engine = getWasmEngine();
      for (let i = 0; i < games.length; i++) {
        if (cancelRef.current) return; // aborted (e.g. cleared) — don't write back
        const game = games[i];
        processEvent(
          {
            type: 'progress',
            current: i,
            total: games.length,
            message: `analysing game ${i + 1}…`,
          },
          ctx
        );
        try {
          // One pipeline for both sources: score any game that lacks evals with
          // the engine (chess.com always; Lichess games it never analysed), so
          // every game can yield puzzles. A no-op when evals are already present.
          await annotateEvalsIfMissing(game, engine, (done, total) => {
            if (done % 6 === 0 || done === total) {
              setStatus({
                kind: 'working',
                message: `analysing game ${i + 1} — move ${Math.ceil(done / 2)}/${Math.ceil(total / 2)}`,
                progress: { current: i, total: games.length },
                moveProgress: { done, total },
              });
            }
          });
          const puzzles = await generatePuzzlesFromGame(game, name, engine);
          processEvent({ type: 'puzzles', gameIndex: i, gameId: game.gameId, puzzles }, ctx);
        } catch (err) {
          processEvent(
            { type: 'game-error', gameIndex: i, gameId: game.gameId, message: (err as Error).message },
            ctx
          );
        }
      }

      if (cancelRef.current) return; // aborted after the last game — skip write-back

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
    [processEvent]
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

      cancelRef.current = false;
      workingRef.current = true;
      const label = untilCursor ? 'older ' : '';
      setStatus({ kind: 'working', message: `importing up to ${BATCH_SIZE} ${label}games...` });

      try {
        // The native server path runs Stockfish on the Lichess backend; chess.com
        // (no server route) always uses the local WASM pipeline.
        if (isNativeApp() && source === 'lichess') {
          await runServerImport(name, untilCursor);
        } else {
          await runWasmImport(name, source, untilCursor);
        }
      } catch (err) {
        setStatus({ kind: 'error', message: (err as Error).message });
      } finally {
        workingRef.current = false;
        // If a clear aborted this run mid-flight, the last progress event may
        // have left the bar stuck on "working" — settle it so Import re-enables.
        if (cancelRef.current) setStatus({ kind: 'ok', message: 'cache cleared' });
      }
    },
    [username, source, runServerImport, runWasmImport]
  );

  /* ── PGN file upload fallback ──
     For users who have a PGN exported from somewhere and don't want to wait
     on the Lichess API. Analyzed locally on web, server-side on native. */
  const importFile = useCallback(
    async (file: File) => {
      // Bound the upload so a huge PGN can't OOM the tab (file.text loads it all
      // into memory) or kick off an effectively endless per-ply analysis loop.
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

      cancelRef.current = false;
      workingRef.current = true;
      setStatus({ kind: 'working', message: `reading ${file.name}...` });
      try {
        const pgn = await file.text();

        if (isNativeApp()) {
          setStatus({ kind: 'working', message: 'analyzing with stockfish...' });
          const res = await fetch(apiUrl('/api/import-pgn'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn, username: name }),
          });
          const data = await res.json();
          if (!res.ok) {
            setStatus({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
            return;
          }
          const puzzles = (data.puzzles ?? []) as Puzzle[];
          onImport(puzzles);
          setStatus({
            kind: 'ok',
            message: `imported ${data.parsedGames} games → ${data.generated} puzzles`,
          });
          return;
        }

        // Web: parse + analyze locally with WASM. Eval-less PGNs (chess.com
        // exports and the like) are annotated by the engine first. Cap the game
        // count so an enormous PGN can't run the analysis loop for hours.
        const games = parsePgn(pgn).slice(0, MAX_UPLOAD_GAMES);
        if (games.length === 0) {
          setStatus({ kind: 'error', message: 'No games found in that PGN file.' });
          return;
        }
        // Real games are in hand — drop any guest placeholders right away.
        onGamesFetched?.();
        const engine = getWasmEngine();
        let total = 0;
        for (let i = 0; i < games.length; i++) {
          if (cancelRef.current) return; // aborted (e.g. cleared)
          setStatus({
            kind: 'working',
            message: `analyzing game ${i + 1}/${games.length}...`,
            progress: { current: i, total: games.length },
          });
          try {
            await annotateEvalsIfMissing(games[i], engine, (done, t) => {
              if (done % 6 === 0 || done === t) {
                setStatus({
                  kind: 'working',
                  message: `analysing game ${i + 1} — move ${Math.ceil(done / 2)}/${Math.ceil(t / 2)}`,
                  progress: { current: i, total: games.length },
                  moveProgress: { done, total: t },
                });
              }
            });
            const puzzles = await generatePuzzlesFromGame(games[i], name, engine);
            if (puzzles.length > 0) {
              onImport(puzzles);
              total += puzzles.length;
            }
          } catch (err) {
            console.warn(`game ${games[i].gameId ?? '?'} failed:`, (err as Error).message);
          }
        }
        if (cancelRef.current) return; // aborted — skip write-back
        persistOpeningGames(games, name); // feed the Opening Clinic (now annotated)
        recordEloFromGames(games, name); // size Assisted Play to your rating
        setStatus({ kind: 'ok', message: `imported ${games.length} games → ${total} puzzles` });
      } catch (err) {
        setStatus({ kind: 'error', message: (err as Error).message });
      } finally {
        workingRef.current = false;
      }
    },
    [username, onImport, onGamesFetched]
  );

  /* ── Auto-import loop ──
     When auto-import is on, keep pulling + analysing batches in the background
     until the library reaches PUZZLE_TARGET_GAMES (or the user runs out of
     history). Each finished batch advances oldestMs / fetchedCount, which
     re-triggers this effect for the next batch. Only fires once a first import
     has established a cursor (kicked off manually or by onboarding). */
  useEffect(() => {
    if (!autoImport) return; // context gate (suppressed during onboarding)
    if (!autoImportEnabled || !autoImportEnabledRef.current) return; // user toggle
    if (!hydrated) return;
    if (workingRef.current) return;
    if (exhausted) return;
    if (oldestMs == null) return; // need a first import to set the cursor
    if (fetchedCount >= PUZZLE_TARGET_GAMES) return; // library target reached
    if (!username.trim()) return;
    runImport(oldestMs);
  }, [autoImport, autoImportEnabled, hydrated, oldestMs, fetchedCount, username, exhausted, runImport]);

  /** Reset the pagination cursor + counters after a cache clear, and abort any
   *  in-flight import so it doesn't write puzzles/openings back post-clear. */
  const resetCursor = useCallback(() => {
    cancelRef.current = true;
    setOldestMs(null);
    setFetchedCount(0);
    setExhausted(false);
  }, []);

  return {
    username,
    setUsername,
    source,
    setSource,
    status,
    setStatus,
    oldestMs,
    fetchedCount,
    exhausted,
    target: PUZZLE_TARGET_GAMES,
    working: status.kind === 'working',
    runImport,
    importFile,
    resetCursor,
  };
}
