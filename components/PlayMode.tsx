'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import {
  bestLine,
  chooseEngineMove,
  judgeMove,
  type MoveVerdict,
} from '@/lib/play-engine';
import { fetchTheory } from '@/lib/opening-explorer';
import {
  effectiveElo,
  loadEstimatedElo,
  loadEloOverride,
  saveEloOverride,
  clampElo,
  MIN_ELO,
  MAX_ELO,
} from '@/lib/player-elo';

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
export function PlayMode() {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [userColor, setUserColor] = useState<Color>('w');
  const [orientation, setOrientation] = useState<Color>('w');
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [verdict, setVerdict] = useState<MoveVerdict | null>(null);
  const [book, setBook] = useState<BookNote | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  /** Opening name/ECO for the current position (from the explorer), kept sticky
   *  so it still reads "Dutch Defense" once you're past named theory. */
  const [opening, setOpening] = useState<{ eco: string; name: string } | null>(null);

  const [elo, setEloState] = useState(1500);
  const [estimated, setEstimated] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);

  // Refs so async engine callbacks read live values, free of stale closures.
  const eloRef = useRef(elo);
  eloRef.current = elo;
  const userColorRef = useRef(userColor);
  userColorRef.current = userColor;
  const manualRef = useRef(manual);
  manualRef.current = manual;

  useEffect(() => {
    setEloState(effectiveElo());
    setEstimated(loadEstimatedElo());
    setCustom(loadEloOverride() != null);
  }, []);

  // Name the current opening from the explorer; sticky (don't clear on the deep,
  // unnamed positions the explorer returns null for).
  useEffect(() => {
    let cancelled = false;
    fetchTheory(fen)
      .then((t) => { if (!cancelled && t?.opening) setOpening(t.opening); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fen]);

  const boardChess = useMemo(() => new Chess(fen), [fen]);
  const sideToMove: Color = boardChess.turn();
  // In manual mode either side is yours to move; otherwise only your colour.
  const canMove = !thinking && !result && (manual || sideToMove === userColor);

  const legalFrom = useMemo(() => {
    const out: Record<string, Move[]> = {};
    if (!canMove) return out;
    for (const m of boardChess.moves({ verbose: true })) (out[m.from] ??= []).push(m);
    return out;
  }, [boardChess, canMove]);

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
      text = userLost ? 'Checkmate — you lost.' : 'Checkmate — you won! ♚';
    } else if (g.isStalemate()) text = 'Stalemate — draw.';
    else if (g.isThreefoldRepetition()) text = 'Draw by repetition.';
    else if (g.isInsufficientMaterial()) text = 'Draw — insufficient material.';
    else text = 'Draw.';
    setResult(text);
    return true;
  };

  const playEngineMove = async () => {
    const g = gameRef.current;
    const choice = await chooseEngineMove(g.fen(), eloRef.current);
    if (choice.uci) {
      const em = applyUci(g, choice.uci);
      if (em) setLastMove({ from: em.from, to: em.to });
      setFen(g.fen());
    }
    return choice;
  };

  /** After your move (normal mode): judge it + look up book, then the engine replies. */
  const runEngineTurn = async (fenBefore: string, playedSan: string) => {
    setThinking(true);
    const bookP = lookupBook(fenBefore, playedSan); // in parallel with the engine
    try {
      const g = gameRef.current;
      if (finishIfOver()) {
        setBook(await bookP);
        return;
      }
      const before = await bestLine(fenBefore);
      const choice = await chooseEngineMove(g.fen(), eloRef.current);
      setVerdict(
        judgeMove(before.cpWhite, before.san, before.uci, choice.bestCpWhite, userColorRef.current, playedSan),
      );
      setBook(await bookP);
      if (choice.uci) {
        const em = applyUci(g, choice.uci);
        if (em) setLastMove({ from: em.from, to: em.to });
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
    const fenBefore = g.fen();
    let played: Move | null;
    try {
      played = g.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
    } catch {
      return;
    }
    if (!played) return;
    setSelected(null);
    setLastMove({ from: played.from, to: played.to });
    setFen(g.fen());
    // Note: we deliberately keep the previous verdict/book visible until the new
    // ones are ready — blanking them each move made the panel blink.

    if (manualRef.current) {
      // Steering the opening — just annotate book, no engine reply.
      finishIfOver();
      void lookupBook(fenBefore, played.san).then(setBook);
    } else {
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
    setVerdict(null);
    setBook(null);
    setResult(null);
    setOpening(null);
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

  const takeBack = () => {
    if (thinking) return;
    const g = gameRef.current;
    if (g.history().length === 0) return;
    g.undo();
    // In normal play, also undo your own move so it's your turn again.
    if (!manualRef.current && g.turn() !== userColorRef.current && g.history().length > 0) g.undo();
    const hist = g.history({ verbose: true });
    const last = hist[hist.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setSelected(null);
    setVerdict(null);
    setBook(null);
    setResult(null);
    setFen(g.fen());
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
    <div className="play">
      <div className="play-board">
        <Board
          chess={boardChess}
          orientation={orientation === 'w' ? 'white' : 'black'}
          selected={selected}
          legalFrom={legalFrom}
          lastFrom={lastMove?.from ?? null}
          lastTo={lastMove?.to ?? null}
          flashOk={null}
          flashFail={null}
          bounceBack={null}
          introMove={null}
          revealed={!canMove}
          onSquareClick={onSquareClick}
          onDragMove={(mv) => applyUserMove(mv)}
        />
      </div>

      <aside className="play-side">
        <div className="ps-block">
          <div className="ps-h">Opening</div>
          <div className="ps-opening">
            {opening
              ? <><span className="ps-opening-name">{opening.name}</span> <span className="ps-opening-eco num">{opening.eco}</span></>
              : <span className="ps-dim">Starting position</span>}
          </div>
        </div>

        <div className="ps-block">
          <div className="ps-h">Opponent strength</div>
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

        <div className="ps-block">
          <div className="ps-h">{statusHead}</div>
          {result ? (
            <div className="ps-result">{result}</div>
          ) : (
            <>
              {verdict ? (
                <div className={'ps-verdict q-' + verdict.quality}>
                  <div className="ps-verdict-head">{verdict.isBest ? 'Best move ✓' : QUALITY_LABEL[verdict.quality]}</div>
                  {verdict.quality !== 'ok' && verdict.bestSan && (
                    <div className="ps-verdict-body">
                      Best was <b>{verdict.bestSan}</b> <span className="num">({fmtEval(verdict.evalAfterPawns)} after yours)</span>
                    </div>
                  )}
                </div>
              ) : !manual && (
                <div className="ps-hint">Make a move — I&apos;ll flag any mistakes and show the best reply.</div>
              )}
              {book && (
                <div className={'ps-book b-' + book.status}>
                  {book.status === 'offbook'
                    ? <>Out of book — theory plays <b>{book.mainSan}</b></>
                    : book.status === 'main'
                      ? 'Main line ✓'
                      : 'Book move'}
                  {book.name && <div className="ps-book-name">{book.name}</div>}
                </div>
              )}
              {manual && !book && (
                <div className="ps-hint">Playing both sides — set up your line, then turn steering off to face the engine.</div>
              )}
            </>
          )}
        </div>

        <div className="ps-block ps-controls">
          <button className={'ps-btn' + (manual ? ' on' : '')} onClick={toggleManual} aria-pressed={manual}>
            {manual ? 'Steering opponent · on' : 'Move for both sides'}
          </button>
          <button className="ps-btn" onClick={takeBack} disabled={thinking || gameRef.current.history().length === 0}>
            Take back
          </button>
          <button className="ps-btn" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>
            Flip board
          </button>
          <div className="ps-new">
            <span className="ps-new-label">New game as</span>
            <div className="seg-tabs">
              <button className={'seg-tab' + (userColor === 'w' ? ' on' : '')} onClick={() => newGame('w')} disabled={thinking}>White</button>
              <button className={'seg-tab' + (userColor === 'b' ? ' on' : '')} onClick={() => newGame('b')} disabled={thinking}>Black</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
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
