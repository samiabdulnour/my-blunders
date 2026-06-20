'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';

import { AppShell } from '@/components/AppShell';
import { Board } from '@/components/Board';
import { Sidebar } from '@/components/Sidebar';
import { ResultPanel } from '@/components/ResultPanel';
import { Onboarding } from '@/components/Onboarding';
import { BrandMark } from '@/components/BrandMark';
import { apiUrl } from '@/lib/api';
import { ecoName } from '@/lib/eco-names';
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
  mergePuzzles,
  clearAll,
  type ThemeMode,
} from '@/lib/storage';

const DEFAULT_STATS: SessionStats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0 };

export default function Page() {
  const [all, setAll] = useState<Puzzle[]>([]);
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
  const [yourMove, setYourMove] = useState<string | null>(null);
  const [isOk, setIsOk] = useState(false);
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
  /** Mirror of `current` as a ref, used by handleImport to decide whether
   *  to auto-jump on the first streamed batch without stale-closure traps. */
  const currentRef = useRef<Puzzle | null>(null);

  /* ── Hydrate persisted state, then load seed puzzles from the API ── */
  useEffect(() => {
    // Famous-blunder placeholders were persisted by an earlier build; never
    // treat them as the user's own games. Strip them on load — the current
    // set is re-added below if the user still has no real games of their own.
    const saved = loadPuzzles().filter((p) => !isFamous(p));
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
          // guest who tapped "play famous blunders" before this resolved.
          setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
          if (!currentRef.current) loadPuzzle(FAMOUS_PUZZLES[0]);
        }
      })
      .catch((err) => {
        console.error('Failed to load seed puzzles:', err);
        if (saved.length > 0) {
          setAll((prev) => mergePuzzles(saved, prev.filter((p) => !isFamous(p))));
          if (!currentRef.current) loadPuzzle(saved[0]);
        } else {
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
    setChess(c);
    setSelected(null);
    setLastFrom(lastMoveFrom);
    setLastTo(lastMoveTo);
    setFlashOk(null);
    setFlashFail(null);
    setRevealed(false);
    setYourMove(null);
    setAwaitingRetry(false);
    setBounceBack(null);
    setAttempts([]);
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
      if (revealed || awaitingRetry || !current) return;
      const myColor = current.abdulsColor === 'white' ? 'w' : 'b';
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
    [revealed, awaitingRetry, current, chess, selected, legalFrom]
  );

  /* ── Apply a move and compare to the puzzle's best move ── */
  const makeMove = (mv: Move) => {
    if (!current) return;
    const next = new Chess(chess.fen());
    let applied;
    try {
      applied = next.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    } catch {
      return;
    }
    if (!applied) return;

    const ok = applied.san === current.bestMove;

    if (ok) {
      setChess(next);
      setSelected(null);
      setLastFrom(mv.from);
      setLastTo(mv.to);
      setRevealed(true);
      setYourMove(applied.san);
      setIsOk(true);
      setFlashOk(mv.to);

      // Forward animation: slide the piece from origin into the destination.
      setIntroMove({ from: mv.from, to: mv.to });
      const okPuzzleId = current.id;
      setTimeout(() => {
        if (currentRef.current?.id !== okPuzzleId) return;
        setIntroMove(null);
      }, 350);

      if (recordedRef.current !== current.id) {
        recordedRef.current = current.id;
        const wasNew = !solved[current.id];
        setSolved((prev) => (prev[current.id] ? prev : { ...prev, [current.id]: 'ok' }));
        if (wasNew) {
          setStats((prev) => ({
            correct: prev.correct + 1,
            wrong: prev.wrong,
            streak: prev.streak + 1,
            bestStreak: Math.max(prev.bestStreak, prev.streak + 1),
          }));
          recordHistory('correct');
        }
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

    if (recordedRef.current !== current.id) {
      recordedRef.current = current.id;
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
    }

    const beforeFen = chess.fen();
    const puzzleId = current.id;
    const bounceFrom = mv.from;
    const bounceTo = mv.to;

    setTimeout(() => {
      if (currentRef.current?.id !== puzzleId) return;
      const rewind = new Chess(beforeFen);
      setChess(rewind);
      setLastFrom(null);
      setLastTo(null);
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

  /* ── Give up: reveal the engine's best move ── */
  const showSolution = useCallback(() => {
    if (!current || revealed || awaitingRetry) return;
    const beforeFen = chess.fen();
    const replay = new Chess(beforeFen);
    let bestApplied;
    try {
      bestApplied = replay.move(current.bestMove);
    } catch {
      return;
    }
    if (!bestApplied) return;

    setChess(replay);
    setSelected(null);
    setLastFrom(bestApplied.from);
    setLastTo(bestApplied.to);
    setFlashOk(bestApplied.to);
    setFlashFail(null);
    setRevealed(true);
    setYourMove('—');
    setIsOk(false);

    setIntroMove({ from: bestApplied.from, to: bestApplied.to });
    const showPuzzleId = current.id;
    setTimeout(() => {
      if (currentRef.current?.id !== showPuzzleId) return;
      setIntroMove(null);
    }, 350);

    if (recordedRef.current !== current.id) {
      recordedRef.current = current.id;
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
    }
  }, [current, revealed, awaitingRetry, chess, solved, recordHistory]);

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

  /* ── Wipe imported puzzles + progress, reset to seed state ── */
  const handleClearAll = useCallback(() => {
    clearAll();
    setSolved({});
    setStats(DEFAULT_STATS);
    setHistory([]);
    setCurrent(null);
    currentRef.current = null;
    setAll([]);
    setRevealed(false);
    setYourMove(null);

    fetch(apiUrl('/api/puzzles'))
      .then((r) => r.json())
      .then((data: { puzzles: Puzzle[] }) => {
        const seeds = data.puzzles ?? [];
        // Clearing your own games drops you back to the famous library.
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
      // handleImport as they arrive.
      setAll((prev) => (prev.some((p) => !isFamous(p)) ? prev : mergePuzzles(prev, FAMOUS_PUZZLES)));
      if (!currentRef.current) loadPuzzle(FAMOUS_PUZZLES[0]);
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
            <Onboarding onImport={handleImport} onComplete={completeOnboarding} />
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

  return (
    <AppShell
      stats={stats}
      queueSize={unseenCount}
      history={history}
      randomOrder={randomOrder}
      onToggleRandom={() => setRandomOrder((o) => !o)}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    >
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
        unseenCount={unseenCount}
        onFilterChange={setFilter}
        onEcoFilterChange={setEcoFilter}
        onSpeedFilterChange={setSpeedFilter}
        onPhaseFilterChange={setPhaseFilter}
        onSelect={loadPuzzle}
        onImport={handleImport}
        onClearAll={handleClearAll}
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
              <div className={'turn-chip ' + (current.abdulsColor === 'white' ? 'white' : 'black')}>
                <span className="dot" />
                {current.abdulsColor === 'white' ? 'White to move' : 'Black to move'}
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
                revealed={revealed || awaitingRetry}
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
                    attempts={attempts}
                    isOk={isOk}
                    onRetry={retry}
                    onNext={next}
                  />
                ) : (
                  <div className="pre-result">
                    <div className="verdict idle">
                      <div className="verdict-ico">?</div>
                      <div>
                        <div className="verdict-title">Find the best move.</div>
                        <div className="verdict-sub">
                          For {current.abdulsColor === 'white' ? 'white' : 'black'}.
                        </div>
                      </div>
                    </div>
                    <div className="help">
                      Click a piece, then its destination — or drag. Click <em>show solution</em> to
                      give up.
                    </div>
                    <button className="btn ghost" onClick={showSolution} disabled={awaitingRetry}>
                      Show solution
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/** Famous-blunder placeholder puzzles carry a `famous_` id prefix. They are
 *  shown when the user has no games of their own, and are never persisted —
 *  the user's real imported games replace them. */
function isFamous(p: Puzzle): boolean {
  return p.id.startsWith('famous_');
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
