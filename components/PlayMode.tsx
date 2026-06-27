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

/** How much the strength buttons nudge the opponent Elo. */
const ELO_STEP = 50;

const QUALITY_LABEL: Record<MoveVerdict['quality'], string> = {
  ok: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/**
 * Assisted Play — play a full game against the engine sized to your rating, and
 * get told, move by move, where you went wrong and what the best move was.
 *
 * The opponent samples from its top candidates with a temperature tied to the
 * target Elo (see lib/play-engine), so a lower setting genuinely plays weaker.
 * After every move you make, a full-strength check grades it and, when it's not
 * the best, surfaces the move you should have played — that's the "assisted"
 * part: you learn your mistakes in live play, not just in puzzles.
 */
export function PlayMode() {
  // The authoritative game (kept in a ref so it carries full history for
  // take-backs); `fen` mirrors it to drive renders.
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [userColor, setUserColor] = useState<Color>('w');
  const [orientation, setOrientation] = useState<Color>('w');
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [verdict, setVerdict] = useState<MoveVerdict | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const [elo, setEloState] = useState(1500);
  const [estimated, setEstimated] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  // Read whenever the engine needs it, free of stale closures.
  const eloRef = useRef(elo);
  eloRef.current = elo;
  const userColorRef = useRef(userColor);
  userColorRef.current = userColor;

  useEffect(() => {
    setEloState(effectiveElo());
    setEstimated(loadEstimatedElo());
    setCustom(loadEloOverride() != null);
  }, []);

  const boardChess = useMemo(() => new Chess(fen), [fen]);
  const userTurn = boardChess.turn() === userColor && !result;
  const inputLocked = thinking || !!result || !userTurn;

  const legalFrom = useMemo(() => {
    const out: Record<string, Move[]> = {};
    if (inputLocked) return out;
    for (const m of boardChess.moves({ verbose: true })) (out[m.from] ??= []).push(m);
    return out;
  }, [boardChess, inputLocked]);

  /** Record the game result once the position is terminal. */
  const finishIfOver = () => {
    const g = gameRef.current;
    if (!g.isGameOver()) return false;
    let text: string;
    if (g.isCheckmate()) {
      const userLost = g.turn() === userColorRef.current; // side to move is mated
      text = userLost ? 'Checkmate — you lost.' : 'Checkmate — you won! ♚';
    } else if (g.isStalemate()) text = 'Stalemate — draw.';
    else if (g.isThreefoldRepetition()) text = 'Draw by repetition.';
    else if (g.isInsufficientMaterial()) text = 'Draw — insufficient material.';
    else text = 'Draw.';
    setResult(text);
    return true;
  };

  /** Play one engine move from the current position (its turn). */
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

  /** After the user moves: judge it at full strength, then let the engine reply. */
  const runEngineTurn = async (fenBefore: string, playedSan: string) => {
    setThinking(true);
    try {
      const g = gameRef.current;
      if (finishIfOver()) return; // the user's move ended the game
      // Best move in the position the user faced (for the verdict)…
      const before = await bestLine(fenBefore);
      // …and the engine's reply, whose top candidate doubles as the eval after
      // the user's move.
      const choice = await chooseEngineMove(g.fen(), eloRef.current);
      setVerdict(
        judgeMove(before.cpWhite, before.san, before.uci, choice.bestCpWhite, userColorRef.current, playedSan),
      );
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
    if (inputLocked) return;
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
    setVerdict(null);
    setLastMove({ from: played.from, to: played.to });
    setFen(g.fen());
    void runEngineTurn(fenBefore, played.san);
  };

  const onSquareClick = (square: string) => {
    if (inputLocked) return;
    if (selected) {
      const cands = (legalFrom[selected] ?? []).filter((mv) => mv.to === square);
      if (cands.length) {
        applyUserMove(cands.find((x) => x.promotion === 'q') ?? cands[0]);
        return;
      }
    }
    const piece = boardChess.get(square as Parameters<typeof boardChess.get>[0]);
    setSelected(piece && piece.color === userColor ? square : null);
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
    setResult(null);
    if (color === 'b') {
      // Engine has the first move.
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

  /** Undo back to the user's turn so they can try a better move. */
  const takeBack = () => {
    if (thinking) return;
    const g = gameRef.current;
    if (g.history().length === 0) return;
    g.undo(); // the engine's reply (or the user's move if engine hasn't replied)
    if (g.turn() !== userColorRef.current && g.history().length > 0) g.undo();
    const hist = g.history({ verbose: true });
    const last = hist[hist.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setSelected(null);
    setVerdict(null);
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
    const est = loadEstimatedElo();
    setEloState(est ?? 1500);
    setCustom(false);
  };

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
          revealed={inputLocked}
          onSquareClick={onSquareClick}
          onDragMove={(mv) => applyUserMove(mv)}
        />
      </div>

      <aside className="play-side">
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
          <div className="ps-h">{result ? 'Game over' : thinking ? 'Thinking…' : userTurn ? 'Your move' : 'Engine to move'}</div>
          {result ? (
            <div className="ps-result">{result}</div>
          ) : verdict ? (
            <div className={'ps-verdict q-' + verdict.quality}>
              <div className="ps-verdict-head">{verdict.isBest ? 'Best move ✓' : QUALITY_LABEL[verdict.quality]}</div>
              {verdict.quality !== 'ok' && verdict.bestSan && (
                <div className="ps-verdict-body">
                  Best was <b>{verdict.bestSan}</b> <span className="num">({fmtEval(verdict.evalAfterPawns)} after yours)</span>
                </div>
              )}
            </div>
          ) : (
            <div className="ps-hint">Make a move — I&apos;ll flag any mistakes and show the best reply.</div>
          )}
        </div>

        <div className="ps-block ps-controls">
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
