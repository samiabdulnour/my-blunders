'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { BestLinePopup } from './BestLinePopup';
import {
  bestLine,
  chooseEngineMove,
  judgeMove,
  type MoveVerdict,
} from '@/lib/play-engine';
import { fetchTheory } from '@/lib/opening-explorer';
import { ensureOpeningBook, lookupOpening } from '@/lib/opening-book';
import { useRegisterBoardNav, BoardControlsSlot, BoardTopSlot } from '@/lib/board-nav';
import { playMove } from '@/lib/sound';
import {
  effectiveElo,
  loadEstimatedElo,
  loadEloOverride,
  saveEloOverride,
  clampElo,
  MIN_ELO,
  MAX_ELO,
} from '@/lib/player-elo';
import { loadTimeControl, saveTimeControl } from '@/lib/storage';
import { figurine } from '@/lib/figurine';
import {
  TIME_CONTROLS,
  OFF_TC,
  timeControlById,
  engineThinkMs,
  formatMs,
  type TimeControl,
} from '@/lib/time-control';

type Color = 'w' | 'b';
interface LastMove { from: string; to: string }

/** Opening-book status of a move, from the Lichess explorer. */
interface BookNote {
  status: 'main' | 'book' | 'offbook';
  /** Theory's most-played move from the position the move was made in. */
  mainSan: string | null;
  /** Opening name at the position, if the explorer knows it. */
  name: string | null;
}

/** How much the strength buttons nudge the opponent Elo. */
const ELO_STEP = 50;
/** Pause between showing your move's rating and the engine's reply, so the
 *  rating reads as *yours* (the board still shows your move) rather than the
 *  engine's. */
const ENGINE_REPLY_DELAY = 450;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const QUALITY_LABEL: Record<MoveVerdict['quality'], string> = {
  ok: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/**
 * Assisted Play — play a full game against the engine sized to your rating, get
 * told where you went wrong, and drill openings.
 *
 * Three things make it a coaching tool, not just a game:
 *  · the opponent samples from its top moves with a temperature tied to a target
 *    Elo, so it plays (and blunders) about as well as you;
 *  · every move you make is judged at full strength, and — using the Lichess
 *    opening explorer — flagged when it leaves book even if it isn't a mistake,
 *    with the main-line move shown;
 *  · "Move for both sides" lets you steer the opening into the exact line you
 *    want to train (e.g. force 1.d4) before handing the opponent back to the
 *    engine — no repeated take-backs.
 */
export function PlayMode({
  coords = true,
  startFrom,
  onStarted,
}: {
  coords?: boolean;
  /** Open at this position instead of the initial one (from a puzzle's "Play").
   *  `noClock` forces this game clock-free regardless of the saved time control. */
  startFrom?: { fen: string; color: Color; noClock?: boolean } | null;
  /** Called once the start position has been consumed, so the parent can clear
   *  it and a later return to this tab begins from the standard position. */
  onStarted?: () => void;
}) {
  const gameRef = useRef<Chess>(startFrom ? safeGame(startFrom.fen) : new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [userColor, setUserColor] = useState<Color>(startFrom?.color ?? 'w');
  const [orientation, setOrientation] = useState<Color>(startFrom?.color ?? 'w');
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [verdict, setVerdict] = useState<MoveVerdict | null>(null);
  /** The position the current verdict's best move applies to — i.e. the one you
   *  faced, before your move. Kept beside the verdict so the best-move popup can
   *  replay the engine's line from exactly there. */
  const [verdictFen, setVerdictFen] = useState<string | null>(null);
  /** Best-move popup open? Closes itself whenever the verdict changes. */
  const [lineOpen, setLineOpen] = useState(false);
  const [book, setBook] = useState<BookNote | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  /** Ply being reviewed via the move list (null = the live, latest position).
   *  Scrubbing back is non-destructive; playing a move from a past ply branches
   *  there (the moves after it are dropped). */
  const [viewPly, setViewPly] = useState<number | null>(null);
  /** Piece slide for a one-ply scrub with the arrows (see `seekTo`). */
  const [navTravel, setNavTravel] = useState<{ from: string; to: string } | null>(null);
  /** Move-list panel open by default; collapsible so it isn't in the way. */
  const [movesOpen, setMovesOpen] = useState(true);
  /** SAN of your move the current verdict refers to (so the rating clearly
   *  names *your* move, never the engine's reply). */
  const [ratedSan, setRatedSan] = useState<string | null>(null);
  /** Opening name/ECO for the current position (from the explorer), kept sticky
   *  so it still reads "Dutch Defense" once you're past named theory. */
  const [opening, setOpening] = useState<{ eco: string; name: string } | null>(null);

  const [elo, setEloState] = useState(1500);
  const [estimated, setEstimated] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);

  // ── Clocks / time control ──
  /** Selected preset id (drives the picker's active state). */
  const [tcId, setTcId] = useState<string>('off');
  /** Remaining time per colour, for display. `null` when the TC is Off (no
   *  clock bar shown — nothing changes from the pre-clock behaviour). */
  const [clockView, setClockView] = useState<{ w: number; b: number } | null>(null);

  // Refs so async engine callbacks read live values, free of stale closures.
  const eloRef = useRef(elo);
  eloRef.current = elo;
  const userColorRef = useRef(userColor);
  userColorRef.current = userColor;
  const manualRef = useRef(manual);
  manualRef.current = manual;
  // Live time control + the authoritative clock, kept in refs so the ~100ms
  // ticker and the async engine turn read them without stale closures.
  const tcRef = useRef<TimeControl>(OFF_TC);
  const clockRef = useRef<{ w: number; b: number }>({ w: 0, b: 0 });
  /** performance.now() of the last time we charged the running clock. */
  const lastTickRef = useRef<number>(0);
  /** Mirrors `result` so the ticker can see "game over" synchronously. */
  const resultRef = useRef<string | null>(null);
  /** Mirrors `viewPly` so the ticker can tell when history is being scrubbed. */
  const viewPlyRef = useRef<number | null>(null);
  viewPlyRef.current = viewPly;

  /** Set the game-over message, keeping the ref the clock loop reads in sync. */
  const setResultBoth = (text: string | null) => {
    resultRef.current = text;
    setResult(text);
  };

  /** Reset both clocks to the current control's base and (re)start the ticker
   *  from now. Hides the clock bar entirely when the control is Off. */
  const resetClocks = () => {
    const base = tcRef.current.base;
    clockRef.current = { w: base, b: base };
    lastTickRef.current = performance.now();
    setClockView(base > 0 ? { w: base, b: base } : null);
  };

  /** After `mover` completes a move: charge the sliver of time since the last
   *  tick to them, add the Fischer increment, and hand the ticking clock to the
   *  other side (which is now to move). No-op when Off or steering both sides. */
  const commitClock = (mover: Color) => {
    if (tcRef.current.base <= 0 || manualRef.current) return;
    const now = performance.now();
    const dt = now - lastTickRef.current;
    if (dt > 0 && !resultRef.current) {
      clockRef.current[mover] = Math.max(0, clockRef.current[mover] - dt);
    }
    clockRef.current[mover] += tcRef.current.inc;
    lastTickRef.current = now;
    setClockView({ w: clockRef.current.w, b: clockRef.current.b });
  };

  /** Target "human" think time for the engine on the current position, given the
   *  engine's own read of how hard the choice is (0..1). Capped so it can never
   *  flag itself (a half-second buffer under its own clock). */
  const engineTargetMs = (complexity: number): number => {
    const g = gameRef.current;
    const engineColor = g.turn(); // it's the engine's turn when this is called
    const remaining = clockRef.current[engineColor];
    const raw = engineThinkMs({
      remainingMs: remaining,
      incrementMs: tcRef.current.inc,
      ply: g.history().length,
      legalMoves: g.moves().length,
      inCheck: g.inCheck(),
      complexity,
      rand: Math.random,
    });
    return Math.max(0, Math.min(raw, remaining - 500));
  };

  /** Sleep so the engine's move lands ~`target` ms after `turnStart` — the
   *  real elapsed (WASM compute + this wait) is what its clock decrements by. */
  const paceEngine = async (turnStart: number, target: number) => {
    const waitMore = target - (performance.now() - turnStart);
    if (waitMore > 0) await sleep(waitMore);
  };

  useEffect(() => {
    setEloState(effectiveElo());
    setEstimated(loadEstimatedElo());
    setCustom(loadEloOverride() != null);
    // A puzzle's "Play" hands off clock-free; otherwise restore the saved control.
    const tc = startFrom?.noClock ? OFF_TC : timeControlById(loadTimeControl());
    tcRef.current = tc;
    setTcId(tc.id);
    resetClocks();
    // Warm the local opening-name book, then name the current position from it.
    ensureOpeningBook().then(() => {
      const o = lookupOpening(gameRef.current.fen());
      if (o) setOpening(o);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single ticker. Each tick charges only the ACTIVE side by the real elapsed
  // since the previous tick (performance.now()), so a dropped frame never
  // over- or under-counts. The clock is paused — we just keep `lastTick` fresh,
  // never retro-charging the gap — when the game is over, while scrubbing
  // history, in "move for both sides", when Off, and when the tab is hidden.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const g = gameRef.current;
      const vp = viewPlyRef.current;
      const scrubbing = vp !== null && vp < g.history().length;
      const paused =
        tcRef.current.base <= 0 ||
        g.history().length === 0 || // clock only starts once the first move is made
        !!resultRef.current ||
        manualRef.current ||
        scrubbing ||
        (typeof document !== 'undefined' && document.hidden);
      if (paused) {
        lastTickRef.current = now;
        return;
      }
      const active = g.turn();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      if (dt <= 0) return;
      const left = Math.max(0, clockRef.current[active] - dt);
      clockRef.current[active] = left;
      if (left <= 0) {
        // Flag: that side is out of time. Time is just another end condition —
        // checkmate/stalemate/draw detection is unaffected.
        const userLost = active === userColorRef.current;
        const loserName = active === 'w' ? 'White' : 'Black';
        setResultBoth(userLost ? 'You lost on time.' : `${loserName} lost on time — you win.`);
      }
      setClockView({ w: clockRef.current.w, b: clockRef.current.b });
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Don't drain the clock while the app is backgrounded on mobile: reset the
  // tick origin on any visibility change so the hidden gap is never charged.
  useEffect(() => {
    const onVis = () => {
      lastTickRef.current = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // The start position (from a puzzle's "Play") is applied once on mount via the
  // refs above; tell the parent so it clears it and a later revisit to this tab
  // begins from the standard initial position.
  useEffect(() => {
    if (startFrom) onStarted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Name the current opening. The bundled book resolves instantly and offline;
  // the explorer supplements it. Sticky — don't clear on the deep, unnamed
  // positions where neither source has a name.
  useEffect(() => {
    const local = lookupOpening(fen);
    if (local) setOpening(local);
    let cancelled = false;
    fetchTheory(fen)
      .then((t) => { if (!cancelled && t?.opening) setOpening(t.opening); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fen]);

  // Full move history (re-read each render; `fen` changes drive re-renders).
  const history = gameRef.current.history({ verbose: true });
  const totalPlies = history.length;
  // Which position the board shows: a reviewed past ply, or the live position.
  const atPast = viewPly !== null && viewPly < totalPlies;
  const viewFen = atPast ? fenAtPly(history, viewPly as number) : fen;

  const boardChess = useMemo(() => new Chess(viewFen), [viewFen]);
  const sideToMove: Color = boardChess.turn();
  // In manual mode either side is yours to move; otherwise only your colour.
  // Reviewing a past position is fine to move from — it branches there.
  const canMove = !thinking && !result && (manual || sideToMove === userColor);

  const legalFrom = useMemo(() => {
    const out: Record<string, Move[]> = {};
    if (!canMove) return out;
    for (const m of boardChess.moves({ verbose: true })) (out[m.from] ??= []).push(m);
    return out;
  }, [boardChess, canMove]);

  // Highlight the move that reached the reviewed ply (else the live last move).
  const viewLast = atPast ? history[(viewPly as number) - 1] : null;
  const hlFrom = atPast ? viewLast?.from ?? null : lastMove?.from ?? null;
  const hlTo = atPast ? viewLast?.to ?? null : lastMove?.to ?? null;

  // Move list rows (white ply | black ply per move number). The "current" ply is
  // the reviewed one, or the latest when live.
  const curPly = atPast ? (viewPly as number) : totalPlies;
  const moveRows: { n: number; w: Move; wPly: number; b: Move | null; bPly: number }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    moveRows.push({ n: i / 2 + 1, w: history[i], wPly: i + 1, b: history[i + 1] ?? null, bPly: i + 2 });
  }
  /**
   * Move to a ply, sliding the piece if it is one step away.
   *
   * Scrubbing rebuilds the position from a FEN, so without this the piece
   * simply is not on one square and is on another — which reads as a blink
   * rather than a move, on the control that exists precisely so you can watch
   * the game go by. One ply forward replays that move; one ply back runs it in
   * reverse, so the piece returns the way it came. Jumps of more than a ply
   * have no single piece to follow, and stay instant.
   */
  const seekTo = (target: number | null) => {
    const to = target === null ? totalPlies : target;
    const step = to - curPly;
    let travel: { from: string; to: string } | null = null;
    if (step === 1 && history[to - 1]) {
      travel = { from: history[to - 1].from, to: history[to - 1].to };
    } else if (step === -1 && history[curPly - 1]) {
      travel = { from: history[curPly - 1].to, to: history[curPly - 1].from };
    }
    setNavTravel(travel);
    if (travel) setTimeout(() => setNavTravel(null), 260);
    setViewPly(target);
  };

  const goPly = (n: number) => seekTo(n >= totalPlies ? null : n);

  // Drive the bottom control bar's first/prev/next/last through the game.
  useRegisterBoardNav(
    {
      canPrev: curPly > 0,
      canNext: curPly < totalPlies,
      first: () => seekTo(totalPlies > 0 ? 0 : null),
      prev: () => seekTo(Math.max(0, curPly - 1)),
      next: () => seekTo(curPly + 1 >= totalPlies ? null : curPly + 1),
      last: () => seekTo(null),
    },
    [curPly, totalPlies],
  );
  const movesRef = useRef<HTMLOListElement | null>(null);

  // Keep the active ply in view as the game grows or you scrub. Measured with
  // getBoundingClientRect (not offsetTop, which depends on the offsetParent
  // chain) and deferred a frame so the new row is laid out before we measure.
  // Scrolls the list element itself — never scrollIntoView, which would also
  // scroll the page.
  useEffect(() => {
    const ol = movesRef.current;
    if (!ol) return;
    const id = requestAnimationFrame(() => {
      const cur = ol.querySelector<HTMLElement>('.ps-ply.cur');
      if (!cur) return;
      const c = cur.getBoundingClientRect();
      const o = ol.getBoundingClientRect();
      // Centre the active ply in the visible strip.
      ol.scrollTop += c.top - o.top - (ol.clientHeight - c.height) / 2;
    });
    return () => cancelAnimationFrame(id);
  }, [curPly, totalPlies, movesOpen]);

  /** Drop the current move rating and everything hanging off it (the position it
   *  referred to, and the best-move popup — which must never outlive it). */
  const clearVerdict = () => {
    setVerdict(null);
    setVerdictFen(null);
    setLineOpen(false);
  };

  /** Opening-book status for a move played from `fen`. Null when out of known theory. */
  const lookupBook = async (fenBefore: string, playedSan: string): Promise<BookNote | null> => {
    const theory = await fetchTheory(fenBefore);
    if (!theory || theory.moves.length === 0) return null;
    const mainSan = theory.moves[0].san;
    const inBook = theory.moves.some((m) => m.san === playedSan);
    return {
      status: playedSan === mainSan ? 'main' : inBook ? 'book' : 'offbook',
      mainSan,
      name: theory.opening?.name ?? null,
    };
  };

  const finishIfOver = (): boolean => {
    const g = gameRef.current;
    if (!g.isGameOver()) return false;
    let text: string;
    if (g.isCheckmate()) {
      const userLost = g.turn() === userColorRef.current;
      text = userLost ? 'Checkmate. You lost.' : 'Checkmate. You won! ♚';
    } else if (g.isStalemate()) text = 'Stalemate. Draw.';
    else if (g.isThreefoldRepetition()) text = 'Draw by repetition.';
    else if (g.isInsufficientMaterial()) text = 'Draw. Insufficient material.';
    else text = 'Draw.';
    setResultBoth(text);
    return true;
  };

  const playEngineMove = async () => {
    const g = gameRef.current;
    const clockOn = tcRef.current.base > 0;
    // Start the clock on this turn, then search — the search needs to run first so
    // its complexity read can shape the think time. The compute counts toward the
    // target (turnStart is before it), so a deep search isn't added on top.
    const turnStart = performance.now();
    const choice = await chooseEngineMove(g.fen(), eloRef.current);
    if (clockOn) await paceEngine(turnStart, engineTargetMs(choice.complexity));
    if (choice.uci) {
      const em = applyUci(g, choice.uci);
      if (em) {
        playMove(!!em.captured);
        setLastMove({ from: em.from, to: em.to });
        commitClock(em.color);
      }
      setFen(g.fen());
    }
    return choice;
  };

  // Handed a position where it's the engine's turn — e.g. "Play" from a puzzle
  // right after the solution move — open with the engine's reply, the same way
  // starting a game as Black does. Your colour and the board orientation stay
  // fixed (the board never flips to whoever's on move) and the game continues.
  useEffect(() => {
    if (!startFrom) return;
    const g = gameRef.current;
    if (g.isGameOver() || manualRef.current) return;
    if (g.turn() === userColorRef.current) return; // your move already
    void (async () => {
      setThinking(true);
      try {
        await playEngineMove();
        finishIfOver();
      } finally {
        setThinking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** After your move (normal mode): judge it + look up book, show that verdict
   *  while the board still shows *your* move, then — after a beat — the engine
   *  replies. Surfacing the rating before the reply (not at the same instant) is
   *  what stops it reading as a rating of the engine's move. */
  const runEngineTurn = async (fenBefore: string, playedSan: string) => {
    setThinking(true);
    // On a clock, the engine's whole turn (judging + choosing + this pause) runs
    // on its own clock, which is already ticking. Capture the human-time target
    // up front so the compute counts toward it; off the clock, keep the fixed
    // reply delay so nothing changes from today.
    const clockOn = tcRef.current.base > 0;
    const turnStart = performance.now();
    const bookP = lookupBook(fenBefore, playedSan); // in parallel with the engine
    try {
      const g = gameRef.current;
      if (finishIfOver()) {
        // Your move ended the game — there's no rating to show; drop any lingering
        // review so it doesn't sit under the game-over status.
        setRatedSan(null);
        clearVerdict();
        setBook(await bookP);
        return;
      }
      const before = await bestLine(fenBefore);
      const choice = await chooseEngineMove(g.fen(), eloRef.current);
      // Swap the whole review at once — rating label, body, the position it refers
      // to, and closing any stale best-move popup — replacing the previous move's
      // review with no empty state between the two.
      setRatedSan(playedSan);
      setLineOpen(false);
      setVerdict(
        judgeMove(
          before.cpWhite,
          before.san,
          before.uci,
          choice.bestCpWhite,
          userColorRef.current,
          playedSan,
          before.pv,
        ),
      );
      setVerdictFen(fenBefore);
      setBook(await bookP);
      // Surface the verdict first, then let the reply land after the human-time
      // pause (or the fixed delay when Off) — so the rating still reads as yours.
      // The pace is derived from the engine's own complexity read for this move.
      if (clockOn) await paceEngine(turnStart, engineTargetMs(choice.complexity));
      else await sleep(ENGINE_REPLY_DELAY);
      if (choice.uci) {
        const em = applyUci(g, choice.uci);
        if (em) {
          playMove(!!em.captured);
          setLastMove({ from: em.from, to: em.to });
          commitClock(em.color);
        }
        setFen(g.fen());
      }
      finishIfOver();
    } finally {
      setThinking(false);
    }
  };

  const applyUserMove = (m: { from: string; to: string; promotion?: string }) => {
    if (!canMove) return;
    const g = gameRef.current;
    // Branching from a reviewed position: drop the moves after it, then play on
    // from there (so the move list doubles as a multi-ply take-back).
    if (viewPly !== null && viewPly < g.history().length) {
      while (g.history().length > viewPly) g.undo();
      clearVerdict();
      setBook(null);
      setResultBoth(null);
    }
    setViewPly(null);
    const fenBefore = g.fen();
    let played: Move | null;
    try {
      played = g.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
    } catch {
      return;
    }
    if (!played) return;
    playMove(!!played.captured);
    // Your move is complete: charge your clock, add the increment, hand the
    // ticking clock to the side now to move (a no-op when Off / steering).
    commitClock(played.color);
    setSelected(null);
    setLastMove({ from: played.from, to: played.to });
    setFen(g.fen());

    if (manualRef.current) {
      // Steering the opening — no engine reply will judge this move, so drop the
      // previous rating and just annotate book.
      setRatedSan(played.san);
      clearVerdict();
      setBook(null);
      finishIfOver();
      void lookupBook(fenBefore, played.san).then(setBook);
    } else {
      // Deliberately DON'T clear the verdict here. Keeping the previous move's
      // review on screen while the engine judges this one means the panel never
      // drops to the empty hint state — runEngineTurn swaps the whole review
      // (rating label + body + the position it refers to) in one shot the instant
      // the new verdict is ready, so it goes straight from one move to the next
      // with no empty, smaller-for-a-frame flash in between.
      void runEngineTurn(fenBefore, played.san);
    }
  };

  const onSquareClick = (square: string) => {
    if (!canMove) return;
    if (selected) {
      const cands = (legalFrom[selected] ?? []).filter((mv) => mv.to === square);
      if (cands.length) {
        applyUserMove(cands.find((x) => x.promotion === 'q') ?? cands[0]);
        return;
      }
    }
    const piece = boardChess.get(square as Parameters<typeof boardChess.get>[0]);
    setSelected(piece && piece.color === sideToMove ? square : null);
  };

  const newGame = (color: Color) => {
    if (thinking) return;
    gameRef.current = new Chess();
    setUserColor(color);
    userColorRef.current = color;
    setOrientation(color);
    setFen(gameRef.current.fen());
    setSelected(null);
    setLastMove(null);
    clearVerdict();
    setBook(null);
    setResultBoth(null);
    setOpening(null);
    setViewPly(null);
    setRatedSan(null);
    // Fresh clocks at the control's base — both sides start level.
    resetClocks();
    // Engine opens only when you're Black and not steering moves yourself.
    if (color === 'b' && !manualRef.current) {
      void (async () => {
        setThinking(true);
        try {
          await playEngineMove();
        } finally {
          setThinking(false);
        }
      })();
    }
  };

  const toggleManual = () => {
    const next = !manual;
    setManual(next);
    manualRef.current = next;
    // Turning steering OFF while it's the opponent's move → let the engine play.
    if (!next) {
      const g = gameRef.current;
      if (!g.isGameOver() && g.turn() !== userColorRef.current) {
        void (async () => {
          setThinking(true);
          try {
            await playEngineMove();
            finishIfOver();
          } finally {
            setThinking(false);
          }
        })();
      }
    }
  };

  /** Switch time control. Persist it, then start a fresh game so both clocks
   *  begin at the new base — same reset as "New game as White/Black". */
  const setTimeControl = (tc: TimeControl) => {
    if (thinking) return;
    saveTimeControl(tc.id);
    tcRef.current = tc;
    setTcId(tc.id);
    newGame(userColorRef.current);
  };


  const setElo = (next: number) => {
    const v = clampElo(next);
    setEloState(v);
    saveEloOverride(v);
    setCustom(true);
  };
  const resetEloToEstimate = () => {
    saveEloOverride(null);
    setEloState(loadEstimatedElo() ?? 1500);
    setCustom(false);
  };

  // Clock bar (only when a control is active). The running pill is the live
  // side to move — paused (no highlight) when the game's over, steering both
  // sides, or scrubbing history. `< 20s` on the running clock turns it urgent.
  const oppColor: Color = userColor === 'w' ? 'b' : 'w';
  const clockRunning: Color | null =
    clockView && !result && !manual && !atPast && totalPlies > 0 ? sideToMove : null;
  const clockPills = clockView
    ? [
        { key: 'engine', label: 'Engine', ms: clockView[oppColor], run: clockRunning === oppColor },
        { key: 'you', label: 'You', ms: clockView[userColor], run: clockRunning === userColor },
      ]
    : null;

  // No abrupt "Thinking…" swap — the turn label ("Engine to move") covers it
  // calmly while the engine works, so the panel doesn't blink on every move.
  const statusHead = result
    ? 'Game over'
    : manual
      ? `Move for ${sideToMove === 'w' ? 'White' : 'Black'}`
      : sideToMove === userColor
        ? 'Your move'
        : 'Engine to move';

  return (
    <>
      {/* Settings live in the hamburger drawer, like the other modes. */}
      <aside className="side">
        <div className="side-block">
          <div className="side-h">Opponent strength</div>
          <div className="ps-elo">
            <button className="ps-step" onClick={() => setElo(elo - ELO_STEP)} disabled={elo <= MIN_ELO} aria-label="Weaker">−</button>
            <span className="ps-elo-val num">{elo}</span>
            <button className="ps-step" onClick={() => setElo(elo + ELO_STEP)} disabled={elo >= MAX_ELO} aria-label="Stronger">+</button>
          </div>
          <div className="ps-elo-note">
            {custom
              ? <>custom · <button className="ps-link" onClick={resetEloToEstimate}>use your rating</button></>
              : estimated != null
                ? `matched to your ~${estimated} rating`
                : 'import games to match your rating'}
          </div>
        </div>

        <div className="side-block">
          <div className="side-h">Time control</div>
          <div className="tc-grid">
            {TIME_CONTROLS.map((tc) => (
              <button
                key={tc.id}
                className={'ps-btn' + (tcId === tc.id ? ' on' : '')}
                onClick={() => setTimeControl(tc)}
                disabled={thinking}
                aria-pressed={tcId === tc.id}
              >
                {tc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="side-block">
          <div className="side-h">Game</div>
          <div className="ps-controls">
            {/* Primary action: start a fresh game keeping your current side. */}
            <button className="ps-btn prim" onClick={() => newGame(userColor)} disabled={thinking}>
              New game
            </button>
            <button className={'ps-btn' + (manual ? ' on' : '')} onClick={toggleManual} aria-pressed={manual}>
              {manual ? 'Steering opponent · on' : 'Move for both sides'}
            </button>
            <button className="ps-btn" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>
              Flip board
            </button>
            <div className="ps-new">
              <span className="ps-new-label">Play as</span>
              <div className="seg-tabs">
                <button className={'seg-tab' + (userColor === 'w' ? ' on' : '')} onClick={() => newGame('w')} disabled={thinking}>White</button>
                <button className={'seg-tab' + (userColor === 'b' ? ' on' : '')} onClick={() => newGame('b')} disabled={thinking}>Black</button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column: opening · board · move result · moves. */}
      <div className="main play-mode">
        <div className="play-col">
          <div className="ps-block ps-block-open">
            <div className="ps-open-body">
              {/* Title line first (opening name), then the small label — same
                  title-on-top layout as the puzzle and coords headers. */}
              <div className="ps-opening">
                {opening
                  ? <span className="ps-opening-name">{opening.name}</span>
                  : <span className="ps-opening-name">Starting position</span>}
              </div>
              <div className="ps-h">Opening</div>
            </div>
            {/* Menu (three-dash) lives in this top bracket, not the arrows. */}
            <BoardTopSlot />
          </div>

          <div className="play-board">
            <Board
              chess={boardChess}
              orientation={orientation === 'w' ? 'white' : 'black'}
              selected={selected}
              legalFrom={legalFrom}
              lastFrom={hlFrom}
              lastTo={hlTo}
              flashOk={null}
              flashFail={null}
              bounceBack={null}
              introMove={navTravel}
              revealed={!canMove}
              onSquareClick={onSquareClick}
              onDragMove={(mv) => applyUserMove(mv)}
              coords={coords}
            />
          </div>

          {/* Control bracket right under the board (portal target). */}
          <BoardControlsSlot />

          {/* Clocks sit under the arrows — so the board and the arrows keep the
              exact same position whether or not a time control is active. Shown
              only when one is. */}
          {clockPills && (
            <div className="play-clocks">
              {clockPills.map((p) => (
                <div
                  key={p.key}
                  className={'pc' + (p.run ? ' run' : '') + (p.run && p.ms < 20000 ? ' low' : '')}
                >
                  <span className="pc-label">{p.label}</span>
                  <span className="pc-time">{formatMs(p.ms)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="ps-block ps-block-status">
            <div className="ps-h">{statusHead}</div>
            {result ? (
              <div className="ps-result">{result}</div>
            ) : (
              <>
                {verdict ? (
                  <div className={'ps-verdict q-' + (verdict.isBest ? 'best' : verdict.quality)}>
                    <div className="ps-verdict-head">
                      {ratedSan && <span className="ps-verdict-move">{figurine(ratedSan, userColor)}</span>}
                      {verdict.isBest
                        ? 'Best move !'
                        : verdict.quality === 'ok'
                          ? 'Good move ✓'
                          : QUALITY_LABEL[verdict.quality]}
                    </div>
                    {/* Whenever your move wasn't the engine's pick — even a "good
                        move" — name the best move. (Redundant only when you already
                        played it, i.e. isBest.) */}
                    {!verdict.isBest && verdict.bestSan && (
                      <div className="ps-verdict-body">
                        Best was{' '}
                        {/* Tap the move to watch where it actually leads — the
                            engine's own line, replayed on a small board. */}
                        <button
                          className="ps-best-link"
                          onClick={() => setLineOpen(true)}
                          disabled={!verdictFen}
                          aria-label={`Show where ${verdict.bestSan} leads`}
                        >
                          {figurine(verdict.bestSan, userColor)}
                        </button>{' '}
                        <span className="num">({fmtEval(verdict.evalAfterPawns)} after yours)</span>
                      </div>
                    )}
                  </div>
                ) : !manual && !thinking && sideToMove === userColor && (
                  <div className="ps-hint">Make a move. I&apos;ll flag any mistakes and show the best reply.</div>
                )}
                {book && (
                  <div className={'ps-book b-' + book.status}>
                    {book.status === 'offbook'
                      ? <>Out of book. Theory plays <b>{figurine(book.mainSan, userColor)}</b></>
                      : book.status === 'main'
                        ? 'Main line ✓'
                        : 'Book move'}
                    {book.name && <div className="ps-book-name">{book.name}</div>}
                  </div>
                )}
                {manual && !book && (
                  <div className="ps-hint">Playing both sides. Set up your line, then turn steering off to face the engine.</div>
                )}
              </>
            )}
          </div>

          <div className={'ps-block ps-moves-block' + (movesOpen ? '' : ' min')}>
          <div className="ps-h ps-moves-h">
            <button className="ps-moves-toggle" onClick={() => setMovesOpen((o) => !o)} aria-expanded={movesOpen}>
              Moves{totalPlies > 0 ? ` · ${Math.ceil(totalPlies / 2)}` : ''}
              <span className="ps-moves-chevron">{movesOpen ? '▾' : '▸'}</span>
            </button>
            {movesOpen && atPast && (
              <button className="ps-live-link" onClick={() => setViewPly(null)}>● jump to latest</button>
            )}
          </div>
          {movesOpen && (
            moveRows.length === 0 ? (
              <div className="ps-moves-empty">No moves yet. Your game will be listed here. Click any move to step back.</div>
            ) : (
              <ol className="ps-moves" ref={movesRef}>
                {moveRows.map((r) => (
                  <li className="ps-move-row" key={r.n}>
                    <span className="ps-move-no num">{r.n}.</span>
                    <button
                      className={'ps-ply' + (curPly === r.wPly ? ' cur' : '')}
                      onClick={() => goPly(r.wPly)}
                    >
                      {figurine(r.w.san, 'w')}
                    </button>
                    {r.b ? (
                      <button
                        className={'ps-ply' + (curPly === r.bPly ? ' cur' : '')}
                        onClick={() => goPly(r.bPly)}
                      >
                        {figurine(r.b.san, 'b')}
                      </button>
                    ) : (
                      <span className="ps-ply ps-ply-empty" />
                    )}
                  </li>
                ))}
              </ol>
            )
          )}
          {movesOpen && atPast && (
            <div className="ps-review-note">Reviewing an earlier position. Play a move to continue from here.</div>
          )}
          </div>
        </div>
      </div>

      {/* Portalled overlay — the Play column behind it never moves. Keyed on the
          position so reopening (or a new verdict) always starts a fresh replay. */}
      {lineOpen && verdict && verdictFen && (
        <BestLinePopup
          key={verdictFen}
          fen={verdictFen}
          pvSan={
            verdict.bestPv.san.length > 0
              ? verdict.bestPv.san
              : verdict.bestSan
                ? [verdict.bestSan]
                : []
          }
          orient={orientation}
          onClose={() => setLineOpen(false)}
        />
      )}
    </>
  );
}

/** Build a game from a FEN, falling back to the initial position if invalid. */
function safeGame(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

/** FEN after replaying the first `n` plies of a verbose move history. */
function fenAtPly(history: Move[], n: number): string {
  const c = new Chess();
  for (let i = 0; i < n && i < history.length; i++) c.move(history[i].san);
  return c.fen();
}

/** Apply a UCI move to a game, returning the Move (or null). */
function applyUci(g: Chess, uci: string): Move | null {
  try {
    return g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    });
  } catch {
    return null;
  }
}

/** Pawns from the user's POV → "+1.2" / "−0.4" / "#". */
function fmtEval(pawns: number): string {
  if (pawns >= 100) return '#';
  if (pawns <= -100) return '-#';
  return (pawns > 0 ? '+' : '') + pawns.toFixed(1);
}
