'use client';

import { useEffect, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from '@/components/Board';
import { evalPosition, candidateMoves, type EngineEval, type EngineMove } from '@/lib/opening-engine';
import { fetchTheory } from '@/lib/opening-explorer';
import { formatEval, type DrillItem } from '@/lib/opening-tree';
import { IconWarn } from '@/components/repertoire/icons';

/** Half-moves to drill out from each weak spot — far enough to play the
 *  opening's idea, short enough not to drag. */
const DRILL_PLIES = 8;

/** Legal moves grouped by from-square, for the interactive board. */
function groupLegal(c: Chess): Record<string, Move[]> {
  const out: Record<string, Move[]> = {};
  for (const m of c.moves({ verbose: true }) as Move[]) (out[m.from] ||= []).push(m);
  return out;
}

/**
 * Pick a *varied but good* opponent reply so a drilled line isn't identical
 * every time. Prefer real opening theory (popular human moves, weighted by how
 * often they're played); fall back to a near-best engine move when the position
 * is out of book (or theory can't be reached).
 */
async function opponentReply(fen: string): Promise<string | null> {
  try {
    const t = await fetchTheory(fen);
    if (t && t.moves.length) {
      const top = t.moves.slice(0, 4);
      const total = top.reduce((s, m) => s + Math.max(1, m.share), 0);
      let r = Math.random() * total;
      for (const m of top) {
        r -= Math.max(1, m.share);
        if (r <= 0) return m.uci;
      }
      return top[0].uci;
    }
  } catch {
    /* theory unreachable — use the engine */
  }
  const cands = await candidateMoves(fen, 4, 12);
  if (!cands.length) return null;
  const stm = fen.split(' ')[1] === 'w' ? 1 : -1;
  const score = (m: EngineMove) =>
    m.mate != null ? (m.mate > 0 ? 1e6 : -1e6) * stm : (m.cp ?? 0) * stm;
  const best = score(cands[0]);
  const good = cands.filter((m) => best - score(m) <= 70);
  return (good.length ? good[Math.floor(Math.random() * good.length)] : cands[0]).uci;
}

function AttemptDots({ reached, losing }: { reached: number; losing: number }) {
  const dots = [];
  const n = Math.min(reached, 24);
  for (let i = 0; i < n; i++) {
    const bad = i < losing;
    dots.push(<span key={i} className={'od-att ' + (bad ? 'bad' : 'ok')}>{bad ? '✗' : '✓'}</span>);
  }
  return <div className="od-dots">{dots}</div>;
}

type Phase = 'analyzing' | 'awaitUser' | 'wrong' | 'opponent' | 'lineDone';

/**
 * Opening Drill — practice the best move in the positions where your repertoire
 * leaks, then *play the line out*: find the best move, the opponent answers with
 * a good (varied) reply, and you keep going for several moves so you rehearse the
 * whole opening idea — not just one move. Reuses the trainer's interactive board.
 */
export function OpeningDrill({ items, onExit }: { items: DrillItem[]; onExit: () => void }) {
  const [idx, setIdx] = useState(0);
  const item = items[idx];

  const [chess, setChess] = useState(() => new Chess(item.fen));
  const [ply, setPly] = useState(0); // half-moves played from the weak spot
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [correct, setCorrect] = useState<EngineEval | null>(null);
  const [played, setPlayed] = useState<string[]>([]); // SANs played in the drill

  const [selected, setSelected] = useState<string | null>(null);
  const [legalFrom, setLegalFrom] = useState<Record<string, Move[]>>({});
  const [lastFrom, setLastFrom] = useState<string | null>(null);
  const [lastTo, setLastTo] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [flashFail, setFlashFail] = useState<string | null>(null);

  const [attempts, setAttempts] = useState(0); // wrong tries at the current ply
  const [revealed, setRevealed] = useState(false);
  const [nRight, setNRight] = useState(0); // weak spots solved first try
  const [finished, setFinished] = useState(false);

  // Async safety: every reset bumps the generation; stale engine/timeout
  // callbacks check it before touching state.
  const genRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  // Start (or restart) the current weak spot: reset the board to the weak-spot
  // position and analyse it for the first move to find.
  useEffect(() => {
    const gen = ++genRef.current;
    clearTimers();
    const c = new Chess(item.fen);
    setChess(c); setPly(0); setPlayed([]); setAttempts(0); setRevealed(false);
    setSelected(null); setLegalFrom(groupLegal(c)); setLastFrom(null); setLastTo(null);
    setFlashOk(null); setFlashFail(null);
    setCorrect(null); setPhase('analyzing');
    evalPosition(item.fen).then((e) => {
      if (genRef.current !== gen) return;
      setCorrect(e); setPhase('awaitUser');
    });
    return () => { clearTimers(); };
  }, [item.fen]);

  // Move on to the next user position (after an opponent reply): show it, then
  // analyse for the best move.
  const loadUserPosition = (c: Chess, gen: number) => {
    setChess(new Chess(c.fen()));
    setLegalFrom(groupLegal(c));
    setSelected(null);
    setCorrect(null); setPhase('analyzing'); setAttempts(0); setRevealed(false);
    evalPosition(c.fen()).then((e) => {
      if (genRef.current !== gen) return;
      setCorrect(e); setPhase('awaitUser');
    });
  };

  // After the user's correct move, play a good opponent reply, then either end
  // the line (depth/terminal) or hand back to the user for the next move.
  const advance = (afterUser: Chess, newPly: number, gen: number) => {
    if (newPly >= DRILL_PLIES || afterUser.isGameOver()) { setPhase('lineDone'); return; }
    setPhase('opponent');
    opponentReply(afterUser.fen()).then((uci) => {
      if (genRef.current !== gen) return;
      if (!uci) { setPhase('lineDone'); return; }
      after(560, () => {
        if (genRef.current !== gen) return;
        const c = new Chess(afterUser.fen());
        let rep: Move | null = null;
        try { rep = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: 'q' }); } catch { rep = null; }
        if (!rep) { setPhase('lineDone'); return; }
        setChess(new Chess(c.fen()));
        setLastFrom(rep.from); setLastTo(rep.to); setFlashOk(null); setFlashFail(null);
        setPlayed((s) => [...s, rep!.san]);
        const ply2 = newPly + 1;
        setPly(ply2);
        if (ply2 >= DRILL_PLIES || c.isGameOver()) { after(250, () => { if (genRef.current === gen) setPhase('lineDone'); }); return; }
        after(220, () => { if (genRef.current === gen) loadUserPosition(c, gen); });
      });
    });
  };

  const attempt = (mv: Move) => {
    if (phase !== 'awaitUser' || !correct) return;
    const beforeFen = chess.fen();
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const ok = uci === correct.bestUci || mv.san === correct.bestSan;
    const c = new Chess(beforeFen);
    let applied: Move | null = null;
    try { applied = c.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? 'q' }); } catch { return; }
    if (!applied) return;

    if (ok) {
      setChess(new Chess(c.fen())); setSelected(null); setLegalFrom({});
      setLastFrom(mv.from); setLastTo(mv.to); setFlashOk(mv.to); setFlashFail(null);
      setPlayed((s) => [...s, applied!.san]);
      if (ply === 0 && attempts === 0 && !revealed) setNRight((n) => n + 1);
      const newPly = ply + 1;
      setPly(newPly);
      advance(c, newPly, genRef.current);
    } else {
      setChess(new Chess(c.fen())); setSelected(null);
      setLastFrom(mv.from); setLastTo(mv.to); setFlashFail(mv.to); setPhase('wrong');
      setAttempts((a) => a + 1);
      const gen = genRef.current;
      after(750, () => {
        if (genRef.current !== gen) return;
        const back = new Chess(beforeFen);
        setChess(back); setLegalFrom(groupLegal(back)); setFlashFail(null);
        setLastFrom(null); setLastTo(null); setPhase('awaitUser');
      });
    }
  };

  // "Show the move": play the best move for the user, then continue the line.
  const playCorrect = () => {
    if (phase !== 'awaitUser' || !correct?.bestUci) return;
    const c = new Chess(chess.fen());
    let mv: Move | null = null;
    try { mv = c.move({ from: correct.bestUci.slice(0, 2), to: correct.bestUci.slice(2, 4), promotion: 'q' }); } catch { mv = null; }
    if (!mv) return;
    setChess(new Chess(c.fen())); setSelected(null); setLegalFrom({});
    setLastFrom(mv.from); setLastTo(mv.to); setFlashOk(mv.to); setFlashFail(null);
    setPlayed((s) => [...s, mv!.san]);
    setRevealed(false);
    const newPly = ply + 1;
    setPly(newPly);
    advance(c, newPly, genRef.current);
  };

  const onSquareClick = (sq: string) => {
    if (phase !== 'awaitUser') return;
    if (selected === sq) { setSelected(null); return; }
    if (selected) {
      const cands = (legalFrom[selected] ?? []).filter((m) => m.to === sq);
      if (cands.length) { attempt(cands.find((m) => m.promotion === 'q') ?? cands[0]); return; }
    }
    setSelected((legalFrom[sq] ?? []).length > 0 ? sq : null);
  };

  const next = () => {
    if (idx + 1 >= items.length) { setFinished(true); return; }
    setIdx((i) => i + 1);
  };

  const bestSan = correct?.bestSan;
  const bestEval = correct ? formatEval(correct.mate !== null ? (correct.mate > 0 ? 10000 : -10000) : correct.cp) : '';
  const turnColor = chess.turn() === 'w' ? 'White' : 'Black';
  const lineDone = phase === 'lineDone';
  const isFirstMove = ply === 0;

  if (finished) {
    return (
      <div className="odrill">
        <div className="od-topbar">
          <button className="od-back" onClick={onExit}>← Back to tree</button>
        </div>
        <div className="od-complete">
          <h2>Drill complete</h2>
          <p className="num">{nRight} / {items.length} weak spots solved first try</p>
          <button className="od-next" onClick={onExit}>Back to the tree</button>
        </div>
      </div>
    );
  }

  return (
    <div className="odrill">
      <div className="od-topbar">
        <button className="od-back" onClick={onExit}>← Back to tree</button>
        <div className="od-progress num">{idx + 1} / {items.length}</div>
        <div className="od-meta num">
          <span>reached <b>{item.reached}</b></span>
          {item.blundered > 0 && <span>blundered <b className="bad">{item.blundered}</b></span>}
        </div>
      </div>

      <div className="od-body">
        <div className="od-stage">
          <div className="od-board-col">
            <div className="od-row">
              <span className="od-tomove"><span className={'od-turndot' + (chess.turn() === 'w' ? ' white' : '')} /> {turnColor} to move</span>
              {item.name && <span>{item.name}</span>}
            </div>
            <div className={'od-frame' + (phase === 'wrong' ? ' bad' : '') + (lineDone || phase === 'opponent' ? ' ok' : '')}>
              <Board
                chess={chess}
                orientation={item.color === 'w' ? 'white' : 'black'}
                selected={selected}
                legalFrom={legalFrom}
                lastFrom={lastFrom}
                lastTo={lastTo}
                flashOk={flashOk}
                flashFail={flashFail}
                bounceBack={null}
                introMove={null}
                revealed={phase !== 'awaitUser'}
                onSquareClick={onSquareClick}
                onDragMove={attempt}
              />
            </div>
          </div>
        </div>

        <aside className="od-panel">
          <div className="od-sec">
            <div className="od-eyebrow"><IconWarn /> Opening drill</div>
            <div className="od-title">{item.name || 'Your move'}</div>
            {item.line && <div className="od-line num">{item.line}</div>}
            {played.length > 0 && <div className="od-played num">{played.join('  ')}</div>}
          </div>

          {item.reached > 0 && (
            <div className="od-sec">
              <div className="od-record">
                Reached <b className="num">{item.reached}×</b>
                {item.blundered > 0 ? <> — blundered <b className="bad num">{item.blundered}</b> of them.</> : ' in your games.'}
              </div>
              <AttemptDots reached={item.reached} losing={item.blundered} />
            </div>
          )}

          <div className="od-sec">
            <div className={'od-prompt' + (lineDone || phase === 'opponent' ? ' ok' : '') + (phase === 'wrong' ? ' bad' : '')}>
              {phase === 'analyzing' ? (
                <span className="q">Analysing…</span>
              ) : lineDone ? (
                <><span className="q">Line complete ✓</span><span className="qs">You played the opening accurately.</span></>
              ) : phase === 'opponent' ? (
                <><span className="q">Good move.</span><span className="qs">Your opponent replies…</span></>
              ) : phase === 'wrong' ? (
                <><span className="q">Not that one.</span><span className="qs">Try again — find the best move.</span></>
              ) : revealed ? (
                <><span className="q">The move is {bestSan}.</span><span className="qs">Play it to continue the line.</span></>
              ) : isFirstMove ? (
                <><span className="q">Find the best move.</span><span className="qs">{turnColor} to move.</span></>
              ) : (
                <><span className="q">Find the next move.</span><span className="qs">Keep the line going — {turnColor} to move.</span></>
              )}
            </div>
            {item.usualSan && isFirstMove && (phase === 'awaitUser' || phase === 'wrong') && (
              <div className="od-usual">
                <span className="um num">{item.usualSan}</span>
                <span className="ut">Your usual move here{item.blundered > 0 ? ' — the recurring leak.' : '.'}</span>
              </div>
            )}
          </div>

          <div className="od-sec od-grow">
            <div className="od-actions">
              {lineDone ? (
                <button className="od-btn primary" onClick={next}>{idx + 1 >= items.length ? 'Finish' : 'Next position'} →</button>
              ) : (
                <>
                  <button className="od-btn primary" onClick={playCorrect} disabled={phase !== 'awaitUser' || !correct}>Show the move</button>
                  <button className="od-btn ghost" onClick={() => setRevealed((v) => !v)} disabled={phase !== 'awaitUser' || !correct}>{revealed ? 'Hide hint' : 'Hint'}</button>
                </>
              )}
            </div>
            {(revealed || lineDone) && bestSan && phase !== 'opponent' && (
              <div className="od-reveal">
                {lineDone ? <>Last best move: <b>{bestSan}</b> ({bestEval}).</> : <>Best move: <b>{bestSan}</b> ({bestEval}).</>}
                {isFirstMove && item.usualSan && item.usualSan !== bestSan && <> You usually play <b className="bad">{item.usualSan}</b>.</>}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
