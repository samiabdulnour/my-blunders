'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from '@/components/Board';
import { evalPosition, type EngineEval } from '@/lib/opening-engine';
import { formatEval, type DrillItem } from '@/lib/opening-tree';
import { IconWarn } from '@/components/repertoire/icons';

/** Legal moves grouped by from-square, for the interactive board. */
function groupLegal(c: Chess): Record<string, Move[]> {
  const out: Record<string, Move[]> = {};
  for (const m of c.moves({ verbose: true }) as Move[]) (out[m.from] ||= []).push(m);
  return out;
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

/**
 * Opening Drill — practice the best move in the positions where your repertoire
 * leaks. For each weak spot it shows the board (you to move), checks your move
 * against the engine's best, and tracks how you've done historically. Reuses the
 * trainer's interactive <Board>.
 */
export function OpeningDrill({ items, onExit }: { items: DrillItem[]; onExit: () => void }) {
  const [idx, setIdx] = useState(0);
  const item = items[idx];

  const [chess, setChess] = useState(() => new Chess(item.fen));
  const [legalFrom, setLegalFrom] = useState<Record<string, Move[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [lastFrom, setLastFrom] = useState<string | null>(null);
  const [lastTo, setLastTo] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [flashFail, setFlashFail] = useState<string | null>(null);

  const [correct, setCorrect] = useState<EngineEval | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'right' | 'wrong'>('idle');
  const [attempts, setAttempts] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [nRight, setNRight] = useState(0);
  const [finished, setFinished] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset board + analyse the new position whenever the item changes.
  useEffect(() => {
    const c = new Chess(item.fen);
    setChess(c);
    setLegalFrom(groupLegal(c));
    setSelected(null); setLastFrom(null); setLastTo(null); setFlashOk(null); setFlashFail(null);
    setStatus('idle'); setAttempts(0); setRevealed(false); setDone(false);
    setCorrect(null); setLoading(true);
    let cancelled = false;
    evalPosition(item.fen).then((e) => { if (!cancelled) setCorrect(e); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (revertTimer.current) clearTimeout(revertTimer.current); };
  }, [item.fen]);

  const locked = done || loading || status === 'wrong';

  const playCorrect = () => {
    if (!correct?.bestUci) return;
    const c = new Chess(item.fen);
    try {
      const mv = c.move({ from: correct.bestUci.slice(0, 2), to: correct.bestUci.slice(2, 4), promotion: 'q' });
      setChess(c); setLegalFrom({}); setSelected(null);
      setLastFrom(mv.from); setLastTo(mv.to); setFlashOk(mv.to); setFlashFail(null);
    } catch {
      /* ignore */
    }
    setDone(true);
  };

  const attempt = (mv: Move) => {
    if (locked || !correct) return;
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const ok = uci === correct.bestUci || mv.san === correct.bestSan;
    const c = new Chess(item.fen);
    c.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? 'q' });
    setChess(c); setLastFrom(mv.from); setLastTo(mv.to); setSelected(null);
    if (ok) {
      setFlashOk(mv.to); setFlashFail(null); setLegalFrom({}); setStatus('right'); setDone(true);
      if (attempts === 0 && !revealed) setNRight((n) => n + 1);
    } else {
      setFlashFail(mv.to); setStatus('wrong'); setAttempts((a) => a + 1);
      revertTimer.current = setTimeout(() => {
        const back = new Chess(item.fen);
        setChess(back); setLegalFrom(groupLegal(back)); setFlashFail(null); setLastFrom(null); setLastTo(null); setStatus('idle');
      }, 750);
    }
  };

  const onSquareClick = (sq: string) => {
    if (locked) return;
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
  const toMove = item.color === 'w' ? 'White' : 'Black';

  if (finished) {
    return (
      <div className="odrill">
        <div className="od-topbar">
          <button className="od-back" onClick={onExit}>← Back to tree</button>
        </div>
        <div className="od-complete">
          <h2>Drill complete</h2>
          <p className="num">{nRight} / {items.length} found first try</p>
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
              <span className="od-tomove"><span className="od-turndot" /> {toMove} to move</span>
              {item.name && <span>{item.name}</span>}
            </div>
            <div className={'od-frame' + (status === 'right' ? ' ok' : '') + (status === 'wrong' ? ' bad' : '')}>
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
                revealed={locked}
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
            <div className={'od-prompt' + (status === 'right' ? ' ok' : '') + (status === 'wrong' ? ' bad' : '')}>
              {loading ? (
                <span className="q">Analysing…</span>
              ) : status === 'right' ? (
                <><span className="q">Correct — {bestSan} ✓</span><span className="qs">{bestEval} for White.</span></>
              ) : status === 'wrong' ? (
                <><span className="q">Not that one.</span><span className="qs">Try again — find the best move.</span></>
              ) : revealed ? (
                <><span className="q">The move is {bestSan}.</span><span className="qs">Play it on the board to continue.</span></>
              ) : (
                <><span className="q">Find the best move.</span><span className="qs">{toMove} to move.</span></>
              )}
            </div>
            {item.usualSan && status !== 'right' && (
              <div className="od-usual">
                <span className="um num">{item.usualSan}</span>
                <span className="ut">Your usual move here{item.blundered > 0 ? ' — the recurring leak.' : '.'}</span>
              </div>
            )}
          </div>

          <div className="od-sec od-grow">
            <div className="od-actions">
              {done ? (
                <button className="od-btn primary" onClick={next}>{idx + 1 >= items.length ? 'Finish' : 'Next position'} →</button>
              ) : (
                <>
                  <button className="od-btn primary" onClick={playCorrect} disabled={loading || !correct}>Show the move</button>
                  <button className="od-btn ghost" onClick={() => setRevealed((v) => !v)} disabled={loading || !correct}>{revealed ? 'Hide hint' : 'Hint'}</button>
                </>
              )}
            </div>
            {(revealed || done) && bestSan && (
              <div className="od-reveal">Best move: <b>{bestSan}</b> ({bestEval}). {item.usualSan && item.usualSan !== bestSan && <>You usually play <b className="bad">{item.usualSan}</b>.</>}</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
