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
import { BrandMark } from '@/components/BrandMark';
import { apiUrl } from '@/lib/api';
import { ecoName } from '@/lib/eco-names';
import { clearElo } from '@/lib/player-elo';
import { FAMOUS_PUZZLES } from '@/lib/famous-puzzles';
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
  /** When true, `next()` picks a random unsolved puzzle. Persisted. */
  const [randomOrder, setRandomOrder] = useState(false);
  /** Color theme. Drives a `data-theme` attribute on <html>. Persisted. */
  const [theme, setTheme] = useState<ThemeMode>('light');
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
    setSolved(loadSolved());
    setRandomOrder(loadRandomOrder());
    setTheme(loadTheme());
    setStats(loadStats());
    setHistory(loadHistory());
    setOnboarded(loadOnboarded());
    // Persisted prefs are in hand — safe to persist on change from here.
    hydrated.current = true;

    fetch(apiUrl('/api/puzzles'))
      .then((r) => r.json())
      .then((data: { puzzles: Puzzle[] }) => {
        const real = mergePuzzles(data.puzzles ?? [], saved);
        if (real.length > 0) {
          // The user has games of their own — drop any famous placeholders.
          setAll((prev) => mergePuzzles(real, prev.filter((p) => !isFamous(p))));
          if (!currentRef.current) loadPuzzle(real[0]);
        } else {
          // No games yet: show the famous-blunders library as a placeholder.
          // Merge against current state so a late response can't clobber a
          // guest who tapped "play famous blunders" before this resolved — and
          // never re-add it once a real import is already underway.
          if (!ownGamesRef.current) {
            setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
            if (!currentRef.current) loadPuzzle(FAMOUS_PUZZLES[0]);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load seed puzzles:', err);
        if (saved.length > 0) {
          setAll((prev) => mergePuzzles(saved, prev.filter((p) => !isFamous(p))));
          if (!currentRef.current) loadPuzzle(saved[0]);
        } else if (!ownGamesRef.current) {
          setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
          if (!currentRef.current) loadPuzzle(FAMOUS_PUZZLES[0]);
        }
      });
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
    // The CSS theme switch is driven by data-theme on <html> so the
    // variable swap stays outside React's tree (and works for portals).
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (hydrated.current) saveTheme(theme);
  }, [theme]);

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
    [revealed, analysis, awaitingRetry, current, chess, selected, legalFrom]
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
    let step = fromStep;
    const playNext = () => {
      if (currentRef.current?.id !== id) return;
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

  /* ── Jump the board to a position in the engine line (clickable notation in
     the result panel). Replays the setup moves + the line up to `ply`, then
     leaves the board in free-analysis so you can explore from there. */
  const seekToLine = useCallback((ply: number) => {
    if (!current) return;
    const line = current.line && current.line.length > 0 ? current.line : [current.bestMove];
    const c = new Chess();
    for (const m of current.setupMoves) { try { c.move(m); } catch { /* odd SAN — skip */ } }
    let last: Move | null = null;
    for (let i = 0; i <= ply && i < line.length; i++) {
      try { last = c.move(line[i]); } catch { break; }
    }
    setChess(new Chess(c.fen()));
    setSelected(null);
    setLastFrom(last?.from ?? null);
    setLastTo(last?.to ?? null);
    setFlashOk(null);
    setFlashFail(null);
    setBounceBack(null);
    setIntroMove(null);
    setAnalysis(true);
    setLegalFrom(groupLegal(c));
    setSeekPly(ply);
  }, [current]);

  /* ── Apply a move ──
     Three modes: free analysis (after solve — any legal move), multi-move
     solving (combination puzzles play out the engine line), and the
     single-move default. */
  const makeMove = (mv: Move) => {
    if (!current) return;
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

    // ── Free analysis: once solved, any legal move is allowed (explore). ──
    if (analysis) {
      setChess(next);
      setSelected(null);
      setSeekPly(null); // a free move leaves the engine line
      setLastFrom(mv.from);
      setLastTo(mv.to);
      setLegalFrom(groupLegal(next));
      setIntroMove({ from: mv.from, to: mv.to });
      const id = current.id;
      setTimeout(() => {
        if (currentRef.current?.id === id) setIntroMove(null);
      }, 250);
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
      setIntroMove({ from: mv.from, to: mv.to });
      const okId = current.id;
      setTimeout(() => {
        if (currentRef.current?.id === okId) setIntroMove(null);
      }, 350);

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
        // "You played" reflects what you actually did: the key move on a clean
        // solve, otherwise your first wrong try (or — when you revealed it).
        setYourMove(keyResultRef.current === 'fail' ? attempts[0] ?? '—' : line[0]);
        setIsOk(keyResultRef.current !== 'fail');
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

    // ── Wrong move: red flash at the destination, then bounce home. ──
    setChess(next);
    setSelected(null);
    setLastFrom(mv.from);
    setLastTo(mv.to);
    setFlashFail(mv.to);
    setAwaitingRetry(true);
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

  /* ── Show move: reveal just the move you're stuck on (counts as a miss),
     then continue exactly like solving — the opponent replies and you find the
     next move yourself. Same flow, the engine just plays this one move. ── */
  const revealMove = () => {
    if (!current || revealed || awaitingRetry || analysis) return;
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
    fetch(apiUrl('/api/puzzles'))
      .then((r) => r.json())
      .then((data: { puzzles: Puzzle[] }) => {
        const seeds = data.puzzles ?? [];
        const base = seeds.length > 0 ? seeds : FAMOUS_PUZZLES;
        setAll(base);
        if (base.length > 0) loadPuzzle(base[0]);
      })
      .catch(() => {
        setAll(FAMOUS_PUZZLES);
        loadPuzzle(FAMOUS_PUZZLES[0]);
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
    (_username: string) => {
      // Show the famous-blunders library immediately so the board is never
      // empty — whether the user skipped (guest) or kicked off an import that
      // is still streaming in the background. Real games replace these via
      // handleImport as they arrive. Skip it once the user's own games have
      // been fetched: their import owns the board now, placeholders or not.
      if (!ownGamesRef.current) {
        setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
        if (!currentRef.current) loadPuzzle(FAMOUS_PUZZLES[0]);
      }
      setOnboarded(true);
      saveOnboarded(true);
    },
    [loadPuzzle]
  );

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
              onImport={handleImport}
              onGamesFetched={handleGamesFetched}
              onComplete={completeOnboarding}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── Main app ── */
  const openingName = current ? ecoName(current.eco) : null;
  const speedLabel =
    current?.speed && current.speed !== 'unknown'
      ? `${current.speed}${current.timeControl ? ` ${current.timeControl}` : ''}`
      : null;
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
      mode={mode}
      onModeChange={setMode}
      onImport={handleImport}
      onGamesFetched={handleGamesFetched}
      onClearAll={handleClearAll}
      unseenCount={unseenCount}
    >
      {mode === 'opening' ? (
        <ClinicProvider key={clinicEpoch}>
          <OpeningSidebar />
          <div className="main clinic-mode">
            <OpeningClinic />
          </div>
        </ClinicProvider>
      ) : mode === 'play' ? (
        <div className="main play-mode">
          <PlayMode />
        </div>
      ) : mode === 'coords' ? (
        <div className="main coords-mode">
          <CoordsTrainer />
        </div>
      ) : (
        <>
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
            onFilterChange={setFilter}
            onEcoFilterChange={setEcoFilter}
            onSpeedFilterChange={setSpeedFilter}
            onPhaseFilterChange={setPhaseFilter}
            onSelect={loadPuzzle}
          />

          <div className="main">
            {!current ? (
          <div className="empty">
            <div>No puzzles loaded.</div>
            <div>Import games from Lichess in the sidebar to begin.</div>
          </div>
        ) : (
          <div className="board-col">
            <div className="ctx-line">
              <div className="ctx-l">
                <div className="ctx-title">
                  <span className="vs">vs</span>
                  {current.opponent}
                </div>
                <div className="ctx-meta">
                  {openingName && (
                    <>
                      <span>{openingName}</span>
                      <span className="sep">·</span>
                    </>
                  )}
                  <span>{current.eco}</span>
                  {speedLabel && (
                    <>
                      <span className="sep">·</span>
                      <span>{speedLabel}</span>
                    </>
                  )}
                  <span className="sep">·</span>
                  <span>{current.date.replace(/\./g, '-')}</span>
                </div>
              </div>
              <div
                className={
                  'turn-chip ' +
                  ((analysis ? chess.turn() === 'w' : current.abdulsColor === 'white')
                    ? 'white'
                    : 'black')
                }
              >
                <span className="dot" />
                {(analysis ? chess.turn() === 'w' : current.abdulsColor === 'white')
                  ? 'White to move'
                  : 'Black to move'}
              </div>
            </div>

            <div className="board-row">
              <Board
                chess={chess}
                orientation={current.abdulsColor}
                selected={selected}
                legalFrom={legalFrom}
                lastFrom={lastFrom}
                lastTo={lastTo}
                flashOk={flashOk}
                flashFail={flashFail}
                bounceBack={bounceBack}
                introMove={introMove}
                revealed={analysis ? false : revealed || awaitingRetry}
                onSquareClick={onSquareClick}
                onDragMove={makeMove}
              />

              {/* Reserve the 280px slot so the board doesn't shift when the
                  result appears. Before reveal: a verdict-style prompt +
                  "show solution" escape; after reveal: the result panel. */}
              <div className="result-slot">
                {revealed && yourMove ? (
                  <ResultPanel
                    puzzle={current}
                    yourMove={yourMove}
                    isOk={isOk}
                    onSeek={seekToLine}
                    seekPly={seekPly}
                    onRetry={retry}
                    onNext={next}
                  />
                ) : (
                  <div className="pre-result">
                    <div className="verdict idle">
                      <div className="verdict-ico">{lineStep > 0 ? '➜' : '?'}</div>
                      <div>
                        {/* Don't reveal the motif (sacrifice / combination) up
                            front — that gives the solution away. Just ask for the
                            best move; the line plays out as you solve it. */}
                        <div className="verdict-title">
                          {lineStep > 0 ? 'Find the next move.' : 'Find the best move.'}
                        </div>
                        <div className="verdict-sub">
                          {lineStep > 0
                            ? 'Play the continuation — keep the advantage.'
                            : `For ${current.abdulsColor === 'white' ? 'white' : 'black'}.`}
                        </div>
                      </div>
                    </div>
                    <div className="help">
                      {lineStep > 0
                        ? <>Find each move yourself — or reveal just this one.</>
                        : <>Click a piece, then its destination — or drag.</>}
                    </div>
                    <div className="btn-row">
                      <button className="btn" onClick={revealMove} disabled={awaitingRetry}>
                        {lineStep > 0 ? 'Show move' : 'Show solution'}
                      </button>
                      {/* "Show the rest" only once you're into the line — after
                          you've solved or revealed the first move. */}
                      {lineStep > 0 && restAvailable && (
                        <button className="btn ghost" onClick={showRest} disabled={awaitingRetry}>
                          Show the rest
                        </button>
                      )}
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
