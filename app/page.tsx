'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';

import { AppShell } from '@/components/AppShell';
import { Board } from '@/components/Board';
import { OpeningClinic } from '@/components/OpeningClinic';
import { OpeningSidebar } from '@/components/OpeningSidebar';
import { PlayMode } from '@/components/PlayMode';
import { CoordsTrainer } from '@/components/CoordsTrainer';
import { ClinicProvider } from '@/lib/clinic-context';
import { Sidebar } from '@/components/Sidebar';
import { ResultPanel } from '@/components/ResultPanel';
import { Onboarding } from '@/components/Onboarding';
import { useImporter } from '@/lib/useImporter';
import { boardThemeById, DEFAULT_BOARD_LIGHT, DEFAULT_BOARD_DARK, type BoardThemeId } from '@/lib/board-theme';
import { BrandMark } from '@/components/BrandMark';
import { apiUrl } from '@/lib/api';
import { useRegisterBoardNav, BoardControlsSlot, BoardTopSlot } from '@/lib/board-nav';
import { isNativeApp } from '@/lib/platform';
import { SEED_PUZZLES } from '@/lib/seed-puzzles';
import { clearElo } from '@/lib/player-elo';
import { FAMOUS_PUZZLES } from '@/lib/famous-puzzles';
import { playMove, loadSound, saveSound } from '@/lib/sound';
import type {
  EcoFilter,
  Filter,
  GamePhase,
  HistoryEntry,
  PhaseFilter,
  Puzzle,
  SessionStats,
  SolveStatus,
  SpeedFilter,
} from '@/lib/types';
import {
  loadPuzzles,
  savePuzzles,
  loadSolved,
  saveSolved,
  loadRandomOrder,
  saveRandomOrder,
  loadTheme,
  saveTheme,
  loadBoardLight,
  saveBoardLight,
  loadBoardDark,
  saveBoardDark,
  loadCoords,
  saveCoords,
  loadStats,
  saveStats,
  loadHistory,
  saveHistory,
  loadOnboarded,
  saveOnboarded,
  loadUsername,
  mergePuzzles,
  clearAll,
  type ThemeMode,
} from '@/lib/storage';

const DEFAULT_STATS: SessionStats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0 };

/**
 * The starter puzzle set. On the web this comes from the `/api/puzzles` route;
 * in the self-contained native app there is no server, so we return the same
 * seed array locally rather than firing a request that would 404 on the
 * `capacitor://` origin. Either way the payload is identical (today: empty, so
 * the UI falls back to the famous-blunder library).
 */
function loadSeedPuzzles(): Promise<{ puzzles: Puzzle[] }> {
  if (isNativeApp()) return Promise.resolve({ puzzles: SEED_PUZZLES });
  return fetch(apiUrl('/api/puzzles')).then((r) => r.json());
}

/**
 * Which puzzle to open when the app first loads. We pick a *random* puzzle the
 * user hasn't solved yet, so every launch surfaces a different blunder and a
 * puzzle you already solved doesn't greet you again on reload. If everything in
 * the pool is solved we fall back to a random solved one (better than always
 * the same first entry); returns null only when the pool is empty.
 */
function pickInitialPuzzle(
  pool: Puzzle[],
  solved: Record<string, SolveStatus>
): Puzzle | null {
  if (pool.length === 0) return null;
  const unsolved = pool.filter((p) => !solved[p.id]);
  const from = unsolved.length > 0 ? unsolved : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export default function Page() {
  const [all, setAll] = useState<Puzzle[]>([]);
  // Puzzle solver · Opening Clinic · Assisted Play — the modes of the trainer.
  const [mode, setMode] = useState<'puzzle' | 'opening' | 'play' | 'coords'>('puzzle');
  // Bumped on "Clear all" to remount the clinic so it drops its in-memory games
  // (clearAll() has emptied the store; the provider re-reads it on remount).
  const [clinicEpoch, setClinicEpoch] = useState(0);
  // Start on 'new' so the user always lands on something fresh rather
  // than re-seeing puzzles they've already solved.
  const [filter, setFilter] = useState<Filter>('new');
  const [ecoFilter, setEcoFilter] = useState<EcoFilter>('all');
  const [speedFilter, setSpeedFilter] = useState<SpeedFilter>('all');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [current, setCurrent] = useState<Puzzle | null>(null);
  const [chess, setChess] = useState<Chess>(() => new Chess());
  const [selected, setSelected] = useState<string | null>(null);
  const [legalFrom, setLegalFrom] = useState<Record<string, Move[]>>({});
  const [lastFrom, setLastFrom] = useState<string | null>(null);
  const [lastTo, setLastTo] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [flashFail, setFlashFail] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  /** Plies of the current puzzle's solution line applied so far — drives
   *  multi-move solving and the post-solve continuation reveal. */
  const [lineStep, setLineStep] = useState(0);
  /** True once a puzzle is solved/revealed and the board is unlocked for the
   *  user to move pieces freely and analyse the position. */
  const [analysis, setAnalysis] = useState(false);
  const [yourMove, setYourMove] = useState<string | null>(null);
  const [isOk, setIsOk] = useState(false);
  /** Engine-line move index currently shown via the result panel's clickable
   *  notation (null = not navigating the line). */
  const [seekPly, setSeekPly] = useState<number | null>(null);
  /** Square ringed by the "Hint" button — the piece you should move. */
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  /** True while a wrong move is flashing red and being undone. */
  const [awaitingRetry, setAwaitingRetry] = useState(false);
  /** Piece at `.from` slides back from `.to` — the wrong-move bounce. */
  const [bounceBack, setBounceBack] = useState<{ from: string; to: string } | null>(null);
  /** Piece at `.to` slides in from `.from` — opponent-move replay on load
   *  and the forward animation on a correct / revealed move. */
  const [introMove, setIntroMove] = useState<{ from: string; to: string } | null>(null);
  /** SANs of every wrong move the user has tried on the current puzzle. */
  const [attempts, setAttempts] = useState<string[]>([]);
  const [solved, setSolved] = useState<Record<string, SolveStatus>>({});
  const [stats, setStats] = useState<SessionStats>(DEFAULT_STATS);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  /** First-run gate. Until the user supplies a username (or skips), show
   *  the onboarding screen instead of the main app.
   *
   *  Defaults to `true` (optimistic) on purpose: this component is statically
   *  prerendered, and most loads are returning users. Starting "onboarded"
   *  means the prerendered HTML already contains the full app shell, so it
   *  paints instantly instead of waiting for the JS bundle to hydrate. The
   *  mount effect then reads the real value from localStorage — a genuine
   *  first run flips this to `false` and shows onboarding (a one-time swap). */
  const [onboarded, setOnboarded] = useState(true);
  /** True once the saved/seed puzzles have been read into `all`. Until then an
   *  empty `all` means "not loaded yet", not "the queue is drained". */
  const [puzzlesLoaded, setPuzzlesLoaded] = useState(false);
  /** When true, `next()` picks a random unsolved puzzle. Persisted. */
  const [randomOrder, setRandomOrder] = useState(false);
  /** Color theme. Drives a `data-theme` attribute on <html>. Persisted. */
  const [theme, setTheme] = useState<ThemeMode>('light');
  /** Board colour theme per app-mode; the one for the active mode recolours
   *  every board in the app. Light defaults to green, dark to walnut. */
  const [boardLight, setBoardLight] = useState<BoardThemeId>(DEFAULT_BOARD_LIGHT);
  const [boardDark, setBoardDark] = useState<BoardThemeId>(DEFAULT_BOARD_DARK);
  /** Board rank/file labels. Off by default (clean, full-width board). Persisted. */
  const [coords, setCoords] = useState(false);
  /** Move sound. On by default; persisted. */
  const [sound, setSound] = useState(true);
  /** When set, the Play tab opens at this position — the puzzle's "Play" button. */
  const [playFrom, setPlayFrom] = useState<{ fen: string; color: 'w' | 'b'; noClock?: boolean } | null>(null);
  const hydrated = useRef(false);
  /** Puzzle id whose outcome has already been counted in stats. Prevents
   *  double-counting across multiple wrong tries on one puzzle. */
  const recordedRef = useRef<string | null>(null);
  /** Outcome of the puzzle's *key* move ('ok' | 'fail'), so the continuation
   *  you then play out can't change the verdict shown when it ends. */
  const keyResultRef = useRef<'ok' | 'fail' | null>(null);
  /** Set once any move is *revealed* (Show move / Show the rest), so the puzzle
   *  is recorded as a miss even though the engine plays the move for you. */
  const revealedRef = useRef(false);
  /** Bumped on every puzzle load (including a retry of the *same* puzzle), so a
   *  reveal animation still in flight aborts instead of overwriting the fresh
   *  board — the puzzle id alone can't tell a retry from the run that spawned
   *  the pending timeouts. */
  const loadSeq = useRef(0);
  /** Mirror of `current` as a ref, used by handleImport to decide whether
   *  to auto-jump on the first streamed batch without stale-closure traps. */
  const currentRef = useRef<Puzzle | null>(null);
  /** The opponent's setup move (puzzle's last move). Kept so the yellow
   *  last-move highlight can be restored after a wrong-move bounce instead of
   *  being cleared. */
  const puzzleLastMoveRef = useRef<{ from: string; to: string } | null>(null);
  /** Whether this is a "non-guest": the user has a Lichess account on record
   *  (a saved username, i.e. they've imported at least once) or is importing
   *  now. The famous-blunder library is GUEST-ONLY, so once this is true the
   *  placeholders never show — not while fetching, not on a reload with no
   *  saved puzzles, not after a clear. Seeded from storage on hydrate. */
  const ownGamesRef = useRef(false);

  // Drag-to-scroll ("hand pan") on desktop: click-drag on empty canvas space.
  const mainRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startY: number; scrollTop: number } | null>(null);

  /* ── Hydrate persisted state, then load seed puzzles from the API ── */
  useEffect(() => {
    // Famous-blunder placeholders were persisted by an earlier build; never
    // treat them as the user's own games. Strip them on load — the current
    // set is re-added below if the user still has no real games of their own.
    const saved = loadPuzzles().filter((p) => !isFamous(p));
    // Famous puzzles are a guest-only library: anyone who has provided a
    // Lichess username (imported at least once) is not a guest, so the
    // placeholders must never show for them — including on a reload where their
    // saved puzzles happen to be empty (a zero-blunder import, or after a clear).
    if (loadUsername().trim()) ownGamesRef.current = true;
    const initialSolved = loadSolved();
    setSolved(initialSolved);
    setRandomOrder(loadRandomOrder());
    setTheme(loadTheme());
    setBoardLight(loadBoardLight());
    setBoardDark(loadBoardDark());
    setCoords(loadCoords());
    setSound(loadSound());
    setStats(loadStats());
    setHistory(loadHistory());
    setOnboarded(loadOnboarded());
    // Persisted prefs are in hand — safe to persist on change from here.
    hydrated.current = true;

    loadSeedPuzzles()
      .then((data: { puzzles: Puzzle[] }) => {
        const real = mergePuzzles(data.puzzles ?? [], saved);
        if (real.length > 0) {
          // The user has games of their own — drop any famous placeholders.
          setAll((prev) => mergePuzzles(real, prev.filter((p) => !isFamous(p))));
          const first = pickInitialPuzzle(real, initialSolved);
          if (!currentRef.current && first) loadPuzzle(first);
        } else {
          // No games yet: show the famous-blunders library as a placeholder.
          // Merge against current state so a late response can't clobber a
          // guest who tapped "play famous blunders" before this resolved — and
          // never re-add it once a real import is already underway.
          if (!ownGamesRef.current) {
            setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
            const first = pickInitialPuzzle(FAMOUS_PUZZLES, initialSolved);
            if (!currentRef.current && first) loadPuzzle(first);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load seed puzzles:', err);
        if (saved.length > 0) {
          setAll((prev) => mergePuzzles(saved, prev.filter((p) => !isFamous(p))));
          const first = pickInitialPuzzle(saved, initialSolved);
          if (!currentRef.current && first) loadPuzzle(first);
        } else if (!ownGamesRef.current) {
          setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
          const first = pickInitialPuzzle(FAMOUS_PUZZLES, initialSolved);
          if (!currentRef.current && first) loadPuzzle(first);
        }
      })
      .finally(() => setPuzzlesLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Persist on change (after first hydration) ── */
  useEffect(() => {
    if (hydrated.current) saveSolved(solved);
  }, [solved]);
  useEffect(() => {
    if (hydrated.current) saveStats(stats);
  }, [stats]);
  useEffect(() => {
    if (hydrated.current) saveHistory(history);
  }, [history]);
  useEffect(() => {
    if (hydrated.current) saveRandomOrder(randomOrder);
  }, [randomOrder]);
  useEffect(() => {
    if (hydrated.current) saveCoords(coords);
  }, [coords]);
  useEffect(() => {
    // The CSS theme switch is driven by data-theme on <html> so the variable
    // swap stays outside React's tree (and works for portals). The active board
    // theme's four square vars are written the same way, so every board (the
    // trainer, Play, the opening mini-boards and the popup) recolours at once.
    if (typeof document !== 'undefined') {
      const el = document.documentElement;
      el.setAttribute('data-theme', theme);
      const bt = boardThemeById(theme === 'dark' ? boardDark : boardLight);
      el.style.setProperty('--sq-l', bt.sqL);
      el.style.setProperty('--sq-d', bt.sqD);
      el.style.setProperty('--lm-l', bt.lmL);
      el.style.setProperty('--lm-d', bt.lmD);
    }
    if (hydrated.current) saveTheme(theme);
  }, [theme, boardLight, boardDark]);

  /** Set (and persist) the board theme for one app-mode. The active mode's board
   *  recolours immediately via the effect above. */
  const setBoard = useCallback((mode: 'light' | 'dark', id: BoardThemeId) => {
    if (mode === 'light') {
      setBoardLight(id);
      if (hydrated.current) saveBoardLight(id);
    } else {
      setBoardDark(id);
      if (hydrated.current) saveBoardDark(id);
    }
  }, []);

  /* ── Derived: filtered puzzle list ── */
  const filtered = useMemo(() => {
    let list = all;
    if (filter === 'new') list = list.filter((p) => !solved[p.id]);
    else if (filter === 'retry') list = list.filter((p) => solved[p.id] === 'fail');

    if (ecoFilter !== 'all') list = list.filter((p) => p.eco === ecoFilter);
    if (speedFilter !== 'all') list = list.filter((p) => p.speed === speedFilter);
    if (phaseFilter !== 'all') list = list.filter((p) => phaseOf(p) === phaseFilter);
    return list;
  }, [all, filter, ecoFilter, speedFilter, phaseFilter, solved]);

  /* Tab counts across the whole library (not narrowed by chips). */
  const counts = useMemo(
    () => ({
      new: all.filter((p) => !solved[p.id]).length,
      retry: all.filter((p) => solved[p.id] === 'fail').length,
      all: all.length,
    }),
    [all, solved]
  );
  const unseenCount = counts.new;

  /* ── Record one day's solve into the history log ── */
  const recordHistory = useCallback((kind: 'correct' | 'wrong') => {
    const today = new Date().toISOString().slice(0, 10);
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last && last.date === today) {
        const updated = [...h];
        updated[updated.length - 1] = {
          ...last,
          correct: last.correct + (kind === 'correct' ? 1 : 0),
          wrong: last.wrong + (kind === 'wrong' ? 1 : 0),
        };
        return updated;
      }
      return [
        ...h,
        { date: today, correct: kind === 'correct' ? 1 : 0, wrong: kind === 'wrong' ? 1 : 0 },
      ];
    });
  }, []);

  /* ── Load a puzzle: replay setup moves, animate the last (opponent) move ── */
  const loadPuzzle = useCallback((p: Puzzle) => {
    loadSeq.current++; // invalidate any in-flight reveal animation (incl. retry)
    const c = new Chess();
    let lastMoveFrom: string | null = null;
    let lastMoveTo: string | null = null;
    for (let i = 0; i < p.setupMoves.length; i++) {
      try {
        const applied = c.move(p.setupMoves[i]);
        if (applied && i === p.setupMoves.length - 1) {
          lastMoveFrom = applied.from;
          lastMoveTo = applied.to;
        }
      } catch (err) {
        console.warn(`Illegal setup move "${p.setupMoves[i]}" in puzzle ${p.id}`, err);
        break;
      }
    }
    setCurrent(p);
    currentRef.current = p;
    puzzleLastMoveRef.current =
      lastMoveFrom && lastMoveTo ? { from: lastMoveFrom, to: lastMoveTo } : null;
    setChess(c);
    setSelected(null);
    setLastFrom(lastMoveFrom);
    setLastTo(lastMoveTo);
    setFlashOk(null);
    setFlashFail(null);
    setRevealed(false);
    setLineStep(0);
    keyResultRef.current = null;
    revealedRef.current = false;
    setAnalysis(false);
    setYourMove(null);
    setAwaitingRetry(false);
    setBounceBack(null);
    setAttempts([]);
    setSeekPly(null);
    setHintSquare(null);
    setLegalFrom(groupLegal(c));

    if (lastMoveFrom && lastMoveTo) {
      setIntroMove({ from: lastMoveFrom, to: lastMoveTo });
      const id = p.id;
      setTimeout(() => {
        if (currentRef.current?.id !== id) return;
        setIntroMove(null);
      }, 400);
    } else {
      setIntroMove(null);
    }
  }, []);

  /* ── Click on a board square ── */
  const onSquareClick = useCallback(
    (sqn: string) => {
      if (seekPly != null) return; // browsing earlier moves — board is view-only
      if ((revealed && !analysis) || awaitingRetry || !current) return;
      // In analysis mode you can move whichever side is to move (explore freely).
      const myColor = analysis ? chess.turn() : current.abdulsColor === 'white' ? 'w' : 'b';
      if (chess.turn() !== myColor) return;

      if (selected === sqn) {
        setSelected(null);
        return;
      }
      if (selected) {
        const cands = (legalFrom[selected] ?? []).filter((m) => m.to === sqn);
        if (cands.length > 0) {
          const mv = cands.find((m) => m.promotion === 'q') ?? cands[0];
          makeMove(mv);
          return;
        }
      }
      if ((legalFrom[sqn] ?? []).length > 0) setSelected(sqn);
      else setSelected(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revealed, analysis, awaitingRetry, current, chess, selected, legalFrom, seekPly]
  );

  /* ── Play out the rest of the engine line, then open free analysis ──
     After a puzzle is solved (or given up), animate each remaining move of the
     stored line from `startFen`, then flip into analysis mode so the board is
     free to explore. Guards on the puzzle id so switching puzzles mid-reveal
     cancels cleanly. */
  const revealContinuation = (p: Puzzle, startFen: string, fromStep: number) => {
    const line = solutionLine(p);
    const c = new Chess(startFen);
    const id = p.id;
    const seq = loadSeq.current; // abort if the puzzle is reloaded/retried mid-reveal
    let step = fromStep;
    const playNext = () => {
      if (currentRef.current?.id !== id || loadSeq.current !== seq) return;
      if (step >= line.length) {
        setLineStep(step);
        setLegalFrom(groupLegal(c));
        setAnalysis(true); // board unlocked for free exploration
        return;
      }
      let applied;
      try {
        applied = c.move(line[step]);
      } catch {
        setLegalFrom(groupLegal(c));
        setAnalysis(true);
        return;
      }
      setChess(new Chess(c.fen()));
      setLastFrom(applied.from);
      setLastTo(applied.to);
      setFlashOk(applied.to);
      setIntroMove({ from: applied.from, to: applied.to });
      setTimeout(() => {
        if (currentRef.current?.id === id) setIntroMove(null);
      }, 450);
      step += 1;
      // Calm, readable cadence — one move roughly every second.
      setTimeout(playNext, 1000);
    };
    setTimeout(playNext, 600); // let the solving move's own animation land first
  };

  /* ── Browse the whole game with the board arrows ──────────────────────────
     `seekPly` is a *global* half-move index into [...setupMoves, ...line]:
       · -1            = the initial position (before move 1)
       · setupLen - 1  = the puzzle position (where you make your move)
       · setupLen + k  = k moves into the solution (only reachable once revealed)
     Seeking is view-only — it never touches the solvable `chess`, so you can
     rewind to study the earlier moves and then step forward to solve. The
     displayed board (`boardChess`) reconstructs the seeked position; `null`
     means "follow the live game". */
  const seekToGame = useCallback((g: number) => {
    if (!current) return;
    const line = solutionLine(current);
    const full = [...current.setupMoves, ...line];
    const setupLen = current.setupMoves.length;
    const livePly = revealed ? full.length - 1 : setupLen - 1;
    const gi = Math.max(-1, Math.min(livePly, g));
    const fromPly = seekPly ?? livePly;
    // Replay as far as the *further* of where we are and where we're going, and
    // keep each move: stepping needs the single move that separates the two
    // plies, and which one that is depends on the direction of travel.
    const c = new Chess();
    const played: Move[] = [];
    for (let i = 0; i <= Math.max(gi, fromPly) && i < full.length; i++) {
      try { played.push(c.move(full[i])); } catch { break; }
    }
    // Highlight the move that lands on square gi.
    const last: Move | null = gi >= 0 ? played[gi] ?? null : null;

    // Stepping one ply either way animates the piece across, instead of
    // repainting it into place — a jump reads as a blink, and the arrows are
    // exactly where you're watching for the move. Forward, the piece arrives
    // at `to` from `from`; rewinding, the same move runs backwards, so the
    // piece lands on `from` having come from `to`. First/last skip whole
    // stretches of game at once, where there is no one piece to follow.
    const step = gi - fromPly;
    let travel: { from: string; to: string } | null = null;
    if (step === 1 && played[gi]) {
      travel = { from: played[gi].from, to: played[gi].to };
    } else if (step === -1 && played[fromPly]) {
      travel = { from: played[fromPly].to, to: played[fromPly].from };
    }

    setSelected(null);
    setFlashOk(null);
    setFlashFail(null);
    setBounceBack(null);
    setIntroMove(travel);
    if (travel) {
      const id = current.id;
      setTimeout(() => {
        if (currentRef.current?.id === id) setIntroMove(null);
      }, 260);
    }
    if (gi < 0) {
      setLastFrom(null);
      setLastTo(null);
    } else if (gi === setupLen - 1) {
      // Back at the puzzle position — restore the opponent's setup-move marker.
      setLastFrom(puzzleLastMoveRef.current?.from ?? null);
      setLastTo(puzzleLastMoveRef.current?.to ?? null);
    } else {
      setLastFrom(last?.from ?? null);
      setLastTo(last?.to ?? null);
    }
    // Landing back on the live position follows the game again (unlocks moves).
    setSeekPly(gi === livePly ? null : gi);
  }, [current, revealed, seekPly]);

  // The board the user sees: the seeked position while browsing history,
  // otherwise the live game. Browsing is view-only, so `chess` stays put and
  // the puzzle is still solvable once you step back to the live position.
  const boardChess = useMemo(() => {
    if (seekPly == null || !current) return chess;
    const full = [...current.setupMoves, ...solutionLine(current)];
    const c = new Chess();
    for (let i = 0; i <= seekPly && i < full.length; i++) { try { c.move(full[i]); } catch { break; } }
    return c;
  }, [seekPly, chess, current]);

  /* ── Apply a move ──
     Three modes: free analysis (after solve — any legal move), multi-move
     solving (combination puzzles play out the engine line), and the
     single-move default. */
  const makeMove = (mv: Move, fromDrag = false) => {
    if (!current) return;
    if (seekPly != null) return; // browsing earlier moves — board is view-only
    setHintSquare(null); // any move dismisses the hint
    const cur = current;
    // Record the puzzle's outcome once (solved-status · stats · streak). A
    // revealed move counts as a miss, like giving up, via `revealedRef`.
    const record = (result: 'ok' | 'fail') => {
      if (recordedRef.current === cur.id) return;
      const final = revealedRef.current ? 'fail' : result;
      recordedRef.current = cur.id;
      keyResultRef.current = final;
      const wasNew = !solved[cur.id];
      setSolved((prev) => (prev[cur.id] ? prev : { ...prev, [cur.id]: final }));
      if (!wasNew) return;
      if (final === 'ok') {
        setStats((prev) => ({
          correct: prev.correct + 1,
          wrong: prev.wrong,
          streak: prev.streak + 1,
          bestStreak: Math.max(prev.bestStreak, prev.streak + 1),
        }));
        recordHistory('correct');
      } else {
        setStats((prev) => ({
          correct: prev.correct,
          wrong: prev.wrong + 1,
          streak: 0,
          bestStreak: prev.bestStreak,
        }));
        recordHistory('wrong');
      }
    };
    const next = new Chess(chess.fen());
    let applied;
    try {
      applied = next.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    } catch {
      return;
    }
    if (!applied) return;
    playMove(!!applied.captured);
    // While solving, only the user's own pieces count. The ~500ms opponent
    // auto-reply window (multi-move puzzles) otherwise lets a *drag* of an
    // opponent piece register as a wrong move — clicks are already turn-guarded
    // in onSquareClick, drags weren't.
    if (!analysis && applied.color !== (cur.abdulsColor === 'white' ? 'w' : 'b')) return;

    // ── Free analysis: once solved, any legal move is allowed (explore). ──
    if (analysis) {
      setChess(next);
      setSelected(null);
      setSeekPly(null); // a free move leaves the engine line
      setLastFrom(mv.from);
      setLastTo(mv.to);
      setLegalFrom(groupLegal(next));
      if (!fromDrag) {
        setIntroMove({ from: mv.from, to: mv.to });
        const id = current.id;
        setTimeout(() => {
          if (currentRef.current?.id === id) setIntroMove(null);
        }, 250);
      }
      return;
    }

    const line = solutionLine(current);
    const ok = applied.san === line[lineStep];

    if (ok) {
      setChess(next);
      setSelected(null);
      setLastFrom(mv.from);
      setLastTo(mv.to);
      setFlashOk(mv.to);
      if (!fromDrag) {
        setIntroMove({ from: mv.from, to: mv.to });
        const okId = current.id;
        setTimeout(() => {
          if (currentRef.current?.id === okId) setIntroMove(null);
        }, 350);
      }

      // Normal puzzles are scored on the KEY move — you found the best move —
      // then you *play out* the critical continuation yourself (forgiving).
      // Combinations are scored on the whole line (the sac needs the follow-up).
      if (lineStep === 0 && !current.combination) record('ok');

      const userMovesDone = Math.floor(lineStep / 2) + 1;
      const solvedNow =
        userMovesDone >= requiredUserMoves(current) || lineStep + 1 >= line.length;

      if (solvedNow) {
        record('ok'); // combinations record here; normal puzzles already did
        setRevealed(true);
        // Finding the best move reads as "Correct" even after a wrong try or
        // two (stats still logged the miss). Revealing it is "Solution shown".
        setYourMove(revealedRef.current ? '—' : line[0]);
        setIsOk(!revealedRef.current);
        // Don't auto-blast the rest of the line on the board — that felt
        // chaotic. Stop on the solved position and open free analysis; the full
        // engine line is still shown as text in the result panel.
        setLineStep(line.length);
        setLegalFrom(groupLegal(next));
        setAnalysis(true);
      } else {
        // Combination still in progress: auto-play the opponent's reply, then
        // wait for the user's next move.
        const replyStep = lineStep + 1;
        const reply = line[replyStep];
        const afterUserFen = next.fen();
        const id = current.id;
        setTimeout(() => {
          if (currentRef.current?.id !== id) return;
          const c2 = new Chess(afterUserFen);
          let rep = null;
          try {
            rep = reply ? c2.move(reply) : null;
          } catch {
            rep = null;
          }
          if (!rep) {
            setFlashOk(null);
            setLineStep(replyStep);
            setLegalFrom(groupLegal(c2));
            return;
          }
          playMove(!!rep.captured);
          setChess(new Chess(c2.fen()));
          setLastFrom(rep.from);
          setLastTo(rep.to);
          setFlashOk(null);
          puzzleLastMoveRef.current = { from: rep.from, to: rep.to };
          setIntroMove({ from: rep.from, to: rep.to });
          setTimeout(() => {
            if (currentRef.current?.id === id) setIntroMove(null);
          }, 350);
          setLineStep(replyStep + 1);
          setLegalFrom(groupLegal(c2));
        }, 500);
      }
      return;
    }

    // ── Wrong move: red flash at the destination, then bounce home so you can
    //    try again. A mistake is never revealed — you keep solving. ──
    setChess(next);
    setSelected(null);
    setLastFrom(mv.from);
    setLastTo(mv.to);
    setFlashFail(mv.to);
    setAwaitingRetry(true);
    // A wrong move is still a move, and until now it was the one kind that
    // never travelled: the piece appeared on the square already red, then
    // slid home 400ms later. Half an animation, and the missing half was the
    // half you asked for. Cleared before the bounce sets off, so the two
    // never fight over the same piece.
    if (!fromDrag) {
      setIntroMove({ from: mv.from, to: mv.to });
      const wrongId = current.id;
      setTimeout(() => {
        if (currentRef.current?.id === wrongId) setIntroMove(null);
      }, 260);
    }
    setAttempts((prev) => (prev.includes(applied.san) ? prev : [...prev, applied.san]));

    // The first unrecorded wrong move fails the puzzle. Once the key move is
    // recorded (normal puzzles), later continuation slips are forgiving —
    // record() is already a no-op, so they don't touch stats or the streak.
    record('fail');

    const beforeFen = chess.fen();
    const puzzleId = current.id;
    const bounceFrom = mv.from;
    const bounceTo = mv.to;

    setTimeout(() => {
      if (currentRef.current?.id !== puzzleId) return;
      const rewind = new Chess(beforeFen);
      setChess(rewind);
      // Restore the opponent's setup-move highlight (the blunder being
      // punished) rather than clearing it — otherwise the yellow last-move
      // marker vanishes after a wrong try.
      setLastFrom(puzzleLastMoveRef.current?.from ?? null);
      setLastTo(puzzleLastMoveRef.current?.to ?? null);
      setFlashFail(null);
      setLegalFrom(groupLegal(rewind));
      setBounceBack({ from: bounceFrom, to: bounceTo });
    }, 400);

    setTimeout(() => {
      if (currentRef.current?.id !== puzzleId) return;
      setBounceBack(null);
      setAwaitingRetry(false);
    }, 700);
  };

  /* ── Hint: ring the piece you should move (the from-square of the move you're
     looking for) without giving away where it lands. ── */
  const showHint = useCallback(() => {
    if (!current || seekPly != null) return;
    const expected = solutionLine(current)[lineStep];
    if (!expected) return;
    const norm = (s: string) => s.replace(/[+#]$/, '');
    const mv = chess.moves({ verbose: true }).find((m) => norm(m.san) === norm(expected));
    setHintSquare(mv ? mv.from : null);
  }, [current, seekPly, lineStep, chess]);

  /* ── Show move: reveal just the move you're stuck on (counts as a miss),
     then continue exactly like solving — the opponent replies and you find the
     next move yourself. Same flow, the engine just plays this one move. ── */
  const revealMove = () => {
    if (!current || revealed || awaitingRetry || analysis) return;
    setHintSquare(null);
    const san = solutionLine(current)[lineStep];
    if (!san) return;
    const probe = new Chess(chess.fen());
    let mv;
    try {
      mv = probe.move(san);
    } catch {
      return;
    }
    if (!mv) return;
    revealedRef.current = true; // recorded as a miss
    makeMove(mv);
  };

  /* ── Show the rest: give up and play out the whole remaining line at once. ── */
  const showRest = useCallback(() => {
    if (!current || revealed || awaitingRetry || analysis) return;
    revealedRef.current = true;
    setRevealed(true);
    setSelected(null);
    setFlashFail(null);

    if (recordedRef.current !== current.id) {
      // Gave up before solving — counts as a miss.
      recordedRef.current = current.id;
      keyResultRef.current = 'fail';
      setYourMove(attempts[0] ?? '—');
      setIsOk(false);
      const wasNew = !solved[current.id];
      setSolved((prev) => (prev[current.id] ? prev : { ...prev, [current.id]: 'fail' }));
      if (wasNew) {
        setStats((prev) => ({
          correct: prev.correct,
          wrong: prev.wrong + 1,
          streak: 0,
          bestStreak: prev.bestStreak,
        }));
        recordHistory('wrong');
      }
    } else {
      // Already resolved — keep that verdict, just show the rest.
      setYourMove(keyResultRef.current === 'fail' ? attempts[0] ?? '—' : solutionLine(current)[0]);
      setIsOk(keyResultRef.current !== 'fail');
    }
    // Play out the engine line from where the user is, then open free analysis.
    revealContinuation(current, chess.fen(), lineStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, revealed, awaitingRetry, analysis, chess, solved, recordHistory, lineStep, attempts]);

  const retry = () => {
    if (current) loadPuzzle(current);
  };

  /* ── "Play" from the result panel: hand the puzzle's position to the Play tab
     so the user can play it out against the engine from exactly there. ── */
  const playFromCurrent = useCallback(() => {
    if (!current) return;
    // Hand Play the exact position on the board *right now* — wherever you've
    // stepped in the engine line or explored in free analysis. Keep your own
    // colour so the board stays oriented exactly as the puzzle showed it (never
    // flipping to whoever's on move); Play makes the engine reply first if it's
    // the opponent's turn in that position.
    // Always hand off clock-free: solving a puzzle out against the engine isn't
    // a timed game, so ignore whatever time control Play was last set to.
    setPlayFrom({
      fen: boardChess.fen(),
      color: current.abdulsColor === 'white' ? 'w' : 'b',
      noClock: true,
    });
    setMode('play');
  }, [current, boardChess]);

  const next = useCallback(() => {
    if (!current || filtered.length === 0) return;

    if (randomOrder) {
      const pool = filtered.filter((p) => p.id !== current.id && !solved[p.id]);
      const fallback = filtered.filter((p) => p.id !== current.id);
      const choices = pool.length > 0 ? pool : fallback;
      if (choices.length === 0) return;
      loadPuzzle(choices[Math.floor(Math.random() * choices.length)]);
      return;
    }

    const idx = filtered.findIndex((p) => p.id === current.id);
    for (let i = 1; i <= filtered.length; i++) {
      const cand = filtered[(idx + i) % filtered.length];
      if (!solved[cand.id]) {
        loadPuzzle(cand);
        return;
      }
    }
    loadPuzzle(filtered[(idx + 1) % filtered.length]);
  }, [current, filtered, solved, loadPuzzle, randomOrder]);

  /* ── Import handler (safe to call repeatedly during a streamed import) ── */
  const handleImport = useCallback(
    (newPuzzles: Puzzle[]) => {
      if (newPuzzles.length === 0) return;
      const real = newPuzzles.filter((p) => !isFamous(p));
      setAll((prev) => {
        // The user's own (real) games replace the famous placeholders.
        const base = real.length > 0 ? prev.filter((p) => !isFamous(p)) : prev;
        return mergePuzzles(base, newPuzzles);
      });
      if (real.length > 0) {
        // Persist only the user's own puzzles — famous ones live in code.
        const saved = loadPuzzles().filter((p) => !isFamous(p));
        savePuzzles(mergePuzzles(saved, real));
        // If a famous placeholder was on the board, jump to the first real one.
        if (!currentRef.current || isFamous(currentRef.current)) loadPuzzle(real[0]);
      } else if (!currentRef.current) {
        loadPuzzle(newPuzzles[0]);
      }
    },
    [loadPuzzle]
  );

  /* ── The user's own games just landed (fetched + parsed) ──
     Retire the famous-blunder placeholders immediately — before analysis has
     produced a single puzzle — so the guest library doesn't linger behind a
     real import (and doesn't stick around forever if those games happen to
     hold no blunders). Real puzzles then stream in via handleImport. */
  const handleGamesFetched = useCallback(() => {
    if (ownGamesRef.current) return; // placeholders already retired
    ownGamesRef.current = true;
    setAll((prev) => prev.filter((p) => !isFamous(p)));
    // If a placeholder was on the board, clear it so the first real puzzle
    // (or the empty/analyzing state) takes over rather than a famous game.
    if (currentRef.current && isFamous(currentRef.current)) {
      currentRef.current = null;
      setCurrent(null);
    }
  }, []);

  /* ── The one importer ──
     Created here, at the page root, so it is mounted for the whole session and
     shared by onboarding and the settings-panel import bar. It used to live
     inside those two components: onboarding's instance died at hand-off (taking
     the unsaved cursor with it) and the import bar's only existed while the
     settings panel was open — so with the panel closed nothing was running, and
     no puzzles ever auto-loaded. The loop stays off during onboarding, where the
     CTA drives the import. */
  /** The user's own puzzles (famous placeholders excluded) — total + unsolved. */
  const ownPuzzleCount = useMemo(() => all.filter((p) => !isFamous(p)).length, [all]);
  const ownUnseenCount = useMemo(
    () => all.filter((p) => !isFamous(p) && !solved[p.id]).length,
    [all, solved]
  );
  const importer = useImporter({
    onImport: handleImport,
    onGamesFetched: handleGamesFetched,
    // Drives the loop's backpressure. Withheld until the saved puzzles are in,
    // or every launch would read the still-empty store as a drained queue.
    unseenCount: puzzlesLoaded ? ownUnseenCount : undefined,
    autoImport: onboarded,
  });

  /* ── Wipe imported puzzles + progress, reset to seed state ── */
  const handleClearAll = useCallback(() => {
    clearAll();
    clearElo();
    // The famous library is guest-only. clearAll() deliberately keeps the saved
    // username, so an account-holder stays a non-guest and lands on an empty
    // queue (with the "import to begin" prompt) rather than the placeholders.
    const isGuest = !loadUsername().trim();
    ownGamesRef.current = !isGuest;
    setSolved({});
    setStats(DEFAULT_STATS);
    setHistory([]);
    setCurrent(null);
    currentRef.current = null;
    setAll([]);
    setRevealed(false);
    setYourMove(null);
    setClinicEpoch((e) => e + 1); // remount the clinic so its tree empties too

    if (!isGuest) return; // account-holder: empty queue, no placeholders

    // Guest: fall back to seed puzzles, or the famous library when there are none.
    loadSeedPuzzles()
      .then((data: { puzzles: Puzzle[] }) => {
        const seeds = data.puzzles ?? [];
        const base = seeds.length > 0 ? seeds : FAMOUS_PUZZLES;
        setAll(base);
        // solved was just wiped, so this is a random pick across the whole set.
        const first = pickInitialPuzzle(base, {});
        if (first) loadPuzzle(first);
      })
      .catch(() => {
        setAll(FAMOUS_PUZZLES);
        const first = pickInitialPuzzle(FAMOUS_PUZZLES, {});
        if (first) loadPuzzle(first);
      });
  }, [loadPuzzle]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowRight' || e.key === 'Enter') && revealed) next();
      if (e.key === 'r' && revealed) retry();
      if (e.key === 'Escape' && !revealed) setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, next]);

  const completeOnboarding = useCallback(
    (_username: string, opts?: { showFamous?: boolean }) => {
      // Show the famous-blunders library so the board is never empty — whether
      // the user skipped (guest) or dropped into the app while a real import is
      // still streaming in the background. `showFamous` adds them even though
      // the user's own games have been fetched (ownGamesRef set), so "play
      // famous blunders while this loads" actually has something to play. The
      // `some(!isFamous)` guard keeps these from clobbering real puzzles once
      // they exist; handleImport swaps the placeholders out as puzzles arrive.
      if (opts?.showFamous || !ownGamesRef.current) {
        setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
        if (!currentRef.current) loadPuzzle(FAMOUS_PUZZLES[0]);
      }
      setOnboarded(true);
      saveOnboarded(true);
    },
    [loadPuzzle]
  );

  // Drag-to-scroll on desktop: mouse-drag on empty space pans the main area.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panRef.current) return;
      const main = mainRef.current;
      if (!main) return;
      main.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.startY);
    };
    const onUp = () => {
      panRef.current = null;
      document.body.classList.remove('panning');
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handlePanStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.target as Element;
    if (el.closest('[data-sq], button, a, input, select, textarea')) return;
    const main = mainRef.current;
    if (!main) return;
    panRef.current = { startY: e.clientY, scrollTop: main.scrollTop };
    document.body.classList.add('panning');
    e.preventDefault();
  };

  /* ── First run: onboarding ── */
  if (!onboarded) {
    return (
      <div className="app-root">
        <div className="topbar">
          <BrandMark />
        </div>
        <div className="body-row">
          <div className="main">
            <Onboarding
              importer={importer}
              ownPuzzleCount={ownPuzzleCount}
              onComplete={completeOnboarding}
              boardLight={boardLight}
              boardDark={boardDark}
              onSetBoard={setBoard}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── Main app ── */
  // Is there still a continuation past the move you're on? (drives "Show the rest")
  const restAvailable = !!current && solutionLine(current).length > lineStep + 1;

  return (
    <AppShell
      stats={stats}
      queueSize={unseenCount}
      history={history}
      randomOrder={randomOrder}
      onToggleRandom={() => setRandomOrder((o) => !o)}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      boardLight={boardLight}
      boardDark={boardDark}
      onSetBoard={setBoard}
      coords={coords}
      onToggleCoords={() => setCoords((c) => !c)}
      sound={sound}
      onToggleSound={() => setSound((v) => { const n = !v; saveSound(n); return n; })}
      mode={mode}
      onModeChange={setMode}
      importer={importer}
      onClearAll={handleClearAll}
    >
      {mode === 'opening' ? (
        <ClinicProvider key={clinicEpoch}>
          <OpeningSidebar />
          <div className="main clinic-mode">
            <OpeningClinic />
          </div>
        </ClinicProvider>
      ) : mode === 'play' ? (
        <PlayMode coords={coords} startFrom={playFrom} onStarted={() => setPlayFrom(null)} />
      ) : mode === 'coords' ? (
        <CoordsTrainer coords={coords} />
      ) : (
        <>
          <PuzzleNav
            enabled={!!current}
            setupLen={current ? current.setupMoves.length : 0}
            lineLen={current ? solutionLine(current).length : 0}
            revealed={revealed}
            seekPly={seekPly}
            onSeek={seekToGame}
          />
          <Sidebar
            all={all}
            filtered={filtered}
            filter={filter}
            ecoFilter={ecoFilter}
            speedFilter={speedFilter}
            phaseFilter={phaseFilter}
            current={current}
            solved={solved}
            counts={counts}
            stats={stats}
            queueSize={unseenCount}
            randomOrder={randomOrder}
            onToggleRandom={() => setRandomOrder((o) => !o)}
            onFilterChange={setFilter}
            onEcoFilterChange={setEcoFilter}
            onSpeedFilterChange={setSpeedFilter}
            onPhaseFilterChange={setPhaseFilter}
            onSelect={loadPuzzle}
          />

          <div className="main" ref={mainRef} onMouseDown={handlePanStart}>
            {!current ? (
          <div className="empty">
            <div>No puzzles loaded.</div>
            <div>Import games from Lichess in the sidebar to begin.</div>
          </div>
        ) : (
          <div className="board-col">
            {/* Puzzle name + info in a white bracket, with the menu on the right. */}
            <div className="ctx-line">
              <div className="ctx-body">
                <div className="ctx-title">
                  <span className="ctx-opp">{current.opponent}</span>
                </div>
              </div>
              <BoardTopSlot />
            </div>
            <div className="board-row">
              <div className="board-stack">
                <Board
                  chess={boardChess}
                  orientation={current.abdulsColor}
                  selected={selected}
                  legalFrom={legalFrom}
                  lastFrom={lastFrom}
                  lastTo={lastTo}
                  flashOk={flashOk}
                  flashFail={flashFail}
                  bounceBack={bounceBack}
                  introMove={introMove}
                  revealed={seekPly != null ? true : analysis ? false : revealed || awaitingRetry}
                  onSquareClick={onSquareClick}
                  onDragMove={(mv) => makeMove(mv, true)}
                  coords={coords}
                  hintSquare={hintSquare}
                />
                {/* Control bracket sits right under the board (portal target). */}
                <BoardControlsSlot />
              </div>

              {/* Reserve the 280px slot so the board doesn't shift when the
                  result appears. Before reveal: a verdict-style prompt +
                  "show solution" escape; after reveal: the result panel. */}
              <div className="result-slot">
                {revealed && yourMove ? (
                  <ResultPanel
                    puzzle={current}
                    yourMove={yourMove}
                    isOk={isOk}
                    onRetry={retry}
                    onNext={next}
                    onPlay={playFromCurrent}
                  />
                ) : (
                  <div className="pre-result">
                    <div className="verdict idle">
                      <div>
                        {/* Don't reveal the motif (sacrifice / combination) up
                            front — that gives the solution away. Just ask for the
                            best move; the line plays out as you solve it. */}
                        <div className="verdict-title">
                          {lineStep > 0 ? 'Find the next move.' : 'Find the best move.'}
                        </div>
                        <div className="verdict-sub">
                          {lineStep > 0
                            ? 'Play the continuation. Keep the advantage.'
                            : `For ${current.abdulsColor === 'white' ? 'white' : 'black'}.`}
                        </div>
                      </div>
                    </div>
                    <div className="btn-row">
                      <button className="btn" onClick={showHint} disabled={awaitingRetry || seekPly != null}>
                        Hint
                      </button>
                      <button className="btn" onClick={revealMove} disabled={awaitingRetry || seekPly != null}>
                        {lineStep > 0 ? 'Show move' : 'Show solution'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}

/** Drives the board arrows through the whole game — the setup moves that lead
 *  up to the puzzle (so you can rewind and study them) plus, once revealed, the
 *  solution line. A tiny component so the registration mounts/unmounts with
 *  puzzle mode and never fights Play's nav. */
function PuzzleNav({
  enabled,
  setupLen,
  lineLen,
  revealed,
  seekPly,
  onSeek,
}: {
  enabled: boolean;
  setupLen: number;
  lineLen: number;
  revealed: boolean;
  seekPly: number | null;
  onSeek: (ply: number) => void;
}) {
  // Global half-move index: -1 = start, setupLen-1 = puzzle position, and the
  // solution only opens up once revealed. Live position (seekPly null) is the
  // puzzle position before solving, the line's end after.
  const livePly = revealed ? setupLen + lineLen - 1 : setupLen - 1;
  const cur = seekPly ?? livePly;
  useRegisterBoardNav(
    enabled && setupLen + lineLen > 0
      ? {
          canPrev: cur > -1,
          canNext: cur < livePly,
          first: () => onSeek(-1),
          prev: () => onSeek(Math.max(-1, cur - 1)),
          next: () => onSeek(Math.min(livePly, cur + 1)),
          last: () => onSeek(livePly),
        }
      : {},
    [enabled, setupLen, lineLen, revealed, seekPly],
  );
  return null;
}

/** Famous-blunder placeholder puzzles carry a `famous_` id prefix. They are
 *  shown when the user has no games of their own, and are never persisted —
 *  the user's real imported games replace them. */
function isFamous(p: Puzzle): boolean {
  return p.id.startsWith('famous_');
}

/** A puzzle's solution / continuation line in SAN. Falls back to the single
 *  best move for puzzles imported before lines were stored. `line[0]` is the
 *  key move, `line[1]` the reply, `line[2]` the user's next move, … */
function solutionLine(p: Puzzle): string[] {
  return p.line && p.line.length > 0 ? p.line : [p.bestMove];
}

/** How many of the user's moves a puzzle asks you to play out, rather than
 *  auto-showing. Normal puzzles ask for the key move plus the immediate
 *  critical follow-up (find it yourself — the move that holds the advantage);
 *  combinations make you play the whole forcing line, since the sacrifice only
 *  works with it. Capped so deep engine lines don't drag — any remainder is
 *  shown calmly afterwards. Single-move lines stay one move. */
function requiredUserMoves(p: Puzzle): number {
  const userPlies = Math.ceil(solutionLine(p).length / 2); // user moves at even indices
  const cap = p.combination ? 3 : 2;
  return Math.min(Math.max(userPlies, 1), cap);
}

/** Group all legal moves at the current position by their `from` square. */
function groupLegal(c: Chess): Record<string, Move[]> {
  const out: Record<string, Move[]> = {};
  for (const m of c.moves({ verbose: true }) as Move[]) {
    if (!out[m.from]) out[m.from] = [];
    out[m.from].push(m);
  }
  return out;
}

/**
 * Classify a puzzle by how many plies preceded the critical position:
 *   · opening    — plies 0–23   (moves 1–12)
 *   · middlegame — plies 24–59  (moves 13–30)
 *   · endgame    — plies 60+    (move 31+)
 * Heuristic, but close to how commentators carve up a game.
 */
function phaseOf(p: Puzzle): GamePhase {
  const ply = p.setupMoves.length;
  if (ply < 24) return 'opening';
  if (ply < 60) return 'middlegame';
  return 'endgame';
}
