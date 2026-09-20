'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chess } from 'chess.js';
import { OpeningBoard } from '@/components/repertoire/OpeningBoard';
import { getWasmEngine } from '@/lib/engine/wasm-engine';
import { figurine } from '@/lib/figurine';

/**
 * "Where does the best move lead?" — a small board popup for Assisted Play.
 *
 * When your move wasn't the engine's pick, the verdict names the best move.
 * Naming it isn't the same as *seeing* it, so tapping that move opens this: the
 * position you actually had, then the best move, then the engine's own
 * continuation played out a move at a time. The line comes straight from the
 * principal variation of the search that judged your move — no second search.
 *
 * The board is the read-only `OpeningBoard` the Opening Clinic uses, so the
 * squares, pieces and highlights match the rest of the app.
 */

/** Delay before the best move lands, so you register the starting position. */
const FIRST_DELAY = 620;
/** Pace of every following move — slow enough to read, not slow enough to bore. */
const STEP_MS = 780;
/** Longest line we'll play out, in plies — 10 = five full moves. Must stay ≤
 *  `PV_PLIES` in lib/play-engine.ts (12), which is what the engine hands us. */
const MAX_PLIES = 10;
/**
 * Board sizing. The panel is sized to its board so nothing overflows: the modal
 * is border-box, so its width has to cover 8 squares plus `OpeningBoard`'s 1px
 * frame, `.pv-modal`'s 14px padding and its 1px border — a pixel out either way
 * and the panel grows a scrollbar. `MODAL_CHROME` adds the backdrop's own 12px
 * inset, which is what the square size is fitted against.
 */
const SQ_MAX = 40;
const SQ_MIN = 20;
const MODAL_PAD = 14;
const MODAL_BORDER = 1;
const BOARD_FRAME = 1;
const MODAL_EXTRA = 2 * (MODAL_PAD + MODAL_BORDER + BOARD_FRAME);
/** A slim engine eval bar sits to the left of the board (its width + gap). */
const EVAL_BAR_W = 12;
const EVAL_BAR_GAP = 8;
/** Shallow depth keeps ~13 position evals quick — plenty for a bar. */
const EVAL_DEPTH = 12;
const MODAL_CHROME = 2 * 12 + MODAL_EXTRA + EVAL_BAR_W + EVAL_BAR_GAP;

interface Step {
  /** Position after this ply. */
  fen: string;
  san: string;
  from: string;
  to: string;
  /** Full-move number this ply belongs to, and whose move it was. */
  no: number;
  color: 'w' | 'b';
}

/** Replay SAN onto a FEN, one position per ply. Stops at the first move the
 *  position won't accept (a truncated PV is still worth showing). */
function buildSteps(fen: string, sans: string[], maxPlies: number): Step[] {
  const out: Step[] = [];
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return out;
  }
  for (const san of sans.slice(0, maxPlies)) {
    const no = Number(game.fen().split(' ')[5]) || 1;
    try {
      const mv = game.move(san);
      if (!mv) break;
      out.push({ fen: game.fen(), san: mv.san, from: mv.from, to: mv.to, no, color: mv.color });
    } catch {
      break;
    }
  }
  return out;
}

/** Chip label: "1. e4", "e5" — numbered on White's moves, plus "1…" when the
 *  line opens on a Black move so the numbering still reads correctly. */
function plyLabel(s: Step, i: number): string {
  const fig = figurine(s.san, s.color);
  if (s.color === 'w') return `${s.no}. ${fig}`;
  return i === 0 ? `${s.no}… ${fig}` : fig;
}

/** Square size that keeps the whole popup inside a phone viewport. */
function pickSq(): number {
  if (typeof window === 'undefined') return 34;
  const vw = Math.min(window.innerWidth, 420);
  return Math.max(SQ_MIN, Math.min(SQ_MAX, Math.floor((vw - MODAL_CHROME) / 8)));
}

/** White-positive eval → white's share of the bar, clamped to [0.02, 0.98]. */
function whiteFraction(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 0.985 : 0.015;
  if (cp == null) return 0.5;
  const f = 1 / (1 + Math.exp(-cp / 350));
  return Math.max(0.02, Math.min(0.98, f));
}

interface BestLinePopupProps {
  /** The position the line applies to — i.e. before its first move. */
  fen: string;
  /** The line in SAN, first move first (engine PV, or the real game). */
  pvSan: string[];
  /** Board orientation (your colour). */
  orient: 'w' | 'b';
  /** Header lead before the first move, e.g. "Best was" / "You played". */
  lead?: string;
  /** One-line caption under the board. */
  note?: string;
  /** Plies to play out (default 10 = five moves). */
  maxPlies?: number;
  /** Delay before the first move lands. */
  firstDelay?: number;
  /** Pace of each following move. */
  stepMs?: number;
  onClose: () => void;
}

export function BestLinePopup({
  fen,
  pvSan,
  orient,
  lead = 'Best was',
  note = 'The position you had, then the engine’s line. Tap a move to jump to it.',
  maxPlies = MAX_PLIES,
  firstDelay = FIRST_DELAY,
  stepMs = STEP_MS,
  onClose,
}: BestLinePopupProps) {
  const steps = useMemo(() => buildSteps(fen, pvSan, maxPlies), [fen, pvSan, maxPlies]);
  /** Plies shown: 0 = the position you had, 1 = after the best move, … */
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [sq, setSq] = useState(pickSq);
  const [mounted, setMounted] = useState(false);
  // White-positive eval per ply index (0 = start position, k = after ply k).
  const [evals, setEvals] = useState<Record<number, { cp: number | null; mate: number | null }>>({});

  useEffect(() => setMounted(true), []);

  // Re-fit the board on rotate/resize so the popup never outgrows the screen.
  useEffect(() => {
    const onResize = () => setSq(pickSq());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Escape closes, matching the settings/stats sheets.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Engine eval per position, for the bar: booted lazily and evaluated in order
  // as a background pass. The bar fills in as results arrive and the animation
  // reads whatever's ready; a missing engine just leaves it neutral.
  useEffect(() => {
    setEvals({});
    if (steps.length === 0) return;
    let cancelled = false;
    const engine = getWasmEngine();
    const fens = [fen, ...steps.map((s) => s.fen)];
    (async () => {
      for (let p = 0; p < fens.length; p++) {
        if (cancelled) return;
        try {
          const res = await engine.analyze({ fen: fens[p], depth: EVAL_DEPTH });
          if (cancelled) return;
          const top = res.lines[0];
          setEvals((prev) => ({ ...prev, [p]: { cp: top?.cp ?? null, mate: top?.mate ?? null } }));
        } catch {
          if (cancelled) return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fen, steps]);

  // One timer per step, cleared on every change *and* on unmount — so closing
  // the popup mid-animation can never land a setState on a gone component.
  useEffect(() => {
    if (!playing) return;
    if (ply >= steps.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setPly((p) => p + 1), ply === 0 ? firstDelay : stepMs);
    return () => clearTimeout(t);
  }, [playing, ply, steps.length, firstDelay, stepMs]);

  const replay = useCallback(() => {
    setPly(0);
    setPlaying(true);
  }, []);

  const shown = ply > 0 ? steps[ply - 1] : null;
  const boardFen = shown ? shown.fen : fen;
  const hl: [string, string] | null = shown ? [shown.from, shown.to] : null;

  // Eval bar: the current ply's eval, or the nearest earlier one until it's
  // ready, else neutral. The bar's bottom is whichever side sits at the board's
  // bottom (its orientation), so bar and board read the same way.
  let curEval = evals[ply];
  if (!curEval) {
    for (let p = ply - 1; p >= 0; p--) {
      if (evals[p]) {
        curEval = evals[p];
        break;
      }
    }
  }
  const wf = curEval ? whiteFraction(curEval.cp, curEval.mate) : 0.5;
  const bottomFrac = orient === 'w' ? wf : 1 - wf;
  const bottomColor = orient === 'w' ? '#efe9dc' : '#2b2925';
  const topColor = orient === 'w' ? '#2b2925' : '#efe9dc';

  if (!mounted) return null;

  const popup = (
    <div className="pv-backdrop" onClick={onClose}>
      <div
        className="pv-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Where the best move leads"
        style={{ width: sq * 8 + MODAL_EXTRA + EVAL_BAR_W + EVAL_BAR_GAP }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pv-head">
          <div className="pv-title">
            {lead} <span className="num">{figurine(steps[0]?.san ?? pvSan[0] ?? '—', steps[0]?.color ?? orient)}</span>
          </div>
          <button className="pv-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="pv-board-wrap">
          {steps.length > 0 && (
            <div className="pv-evalbar" style={{ background: topColor }} aria-hidden="true">
              <div
                className="pv-evalbar-fill"
                style={{ height: `${bottomFrac * 100}%`, background: bottomColor }}
              />
            </div>
          )}
          <div className="pv-board">
            <OpeningBoard fen={boardFen} hl={hl} sqSize={sq} orient={orient} />
          </div>
        </div>

        {steps.length > 0 && (
          <ol className="pv-line">
            {steps.map((s, i) => (
              <li key={i}>
                <button
                  className={'ps-ply' + (ply === i + 1 ? ' cur' : '')}
                  onClick={() => {
                    setPlaying(false);
                    setPly(i + 1);
                  }}
                >
                  {plyLabel(s, i)}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="pv-note">
          {steps.length === 0
            ? 'No continuation available for this position.'
            : note}
        </div>

        <div className="pv-actions">
          <button className="ps-btn" onClick={replay} disabled={steps.length === 0}>
            Replay
          </button>
          <button className="ps-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // Portalled to <body> so no ancestor's overflow/stacking can clip it, and the
  // Play column behind it is untouched.
  return createPortal(popup, document.body);
}
