'use client';

import { useEffect, useState } from 'react';
import { evalPosition } from '@/lib/opening-engine';

/** White-positive eval → white's share of the bar, clamped to [0.02, 0.98].
 *  Same curve as the best-line popup's bar, so the two always agree. */
function whiteFraction(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 0.985 : 0.015;
  if (cp == null) return 0.5;
  const f = 1 / (1 + Math.exp(-cp / 350));
  return Math.max(0.02, Math.min(0.98, f));
}

/**
 * The engine bar beside the main boards (the "Engine bar" setting): a slim
 * vertical bar whose bottom share is the side at the board's bottom, exactly
 * like the best-line popup's bar. Positions are analysed through the shared
 * opening-engine cache (depth 14), so a position is only ever searched once —
 * and the last known eval stays on screen while the next one computes, so the
 * bar glides rather than snapping to neutral on every move.
 */
export function EvalBar({ fen, orientation }: { fen: string; orientation: 'white' | 'black' }) {
  const [ev, setEv] = useState<{ cp: number | null; mate: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    evalPosition(fen).then((e) => {
      if (!cancelled && e) setEv({ cp: e.cp, mate: e.mate });
    });
    return () => {
      cancelled = true;
    };
  }, [fen]);

  const wf = ev ? whiteFraction(ev.cp, ev.mate) : 0.5;
  const bottomFrac = orientation === 'white' ? wf : 1 - wf;
  const bottomColor = orientation === 'white' ? 'var(--eval-w)' : 'var(--eval-b)';
  const topColor = orientation === 'white' ? 'var(--eval-b)' : 'var(--eval-w)';

  return (
    <div className="board-evalbar" style={{ background: topColor }} aria-hidden="true">
      <div
        className="pv-evalbar-fill"
        style={{ height: `${bottomFrac * 100}%`, background: bottomColor }}
      />
    </div>
  );
}
