'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildOpeningTree, POSTER_BUDGET, POSTER_MAX_NODES, type OpeningGame } from '@/lib/opening-tree';
import { buildOpeningTreePdf, renderOpeningTreePreview, savePdf, type OpeningPdfOpts } from '@/lib/opening-pdf';
import { fillPosterEvals } from '@/lib/opening-engine';

/**
 * Print dialog for the opening-tree poster. Shows a fit-to-page preview image
 * and one choice before you commit: orientation (portrait or landscape).
 * The whole repertoire is drawn on ONE A1 sheet: full-depth columns for the
 * lines played most, short stubs for the rest where there is room (see
 * POSTER_BUDGET). The preview is a rasterised page-1 image (not an embedded PDF), so it
 * fits reliably everywhere. "Save / share" builds the real PDF and hands it off
 * (share sheet on iOS, download on web). Re-renders whenever a choice changes.
 */

type Orientation = 'landscape' | 'portrait';

interface PrintDialogProps {
  /** Raw games — the poster builds its own tree, denser than the clinic's and
   *  shaped to the chosen sheet, so it can't take a prebuilt one. */
  games: OpeningGame[];
  color: 'w' | 'b';
  focusPath: string | null;
  focusName: string | null;
  onClose: () => void;
}

export function PrintDialog({ games, color, focusPath, focusName, onClose }: PrintDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [building, setBuilding] = useState(true);
  const [img, setImg] = useState<string | null>(null);
  const [pages, setPages] = useState(1);
  const [branches, setBranches] = useState<string[]>([]);
  const [err, setErr] = useState(false);
  const [saving, setSaving] = useState(false);
  // Bumps to invalidate an in-flight render when options change or we unmount.
  const runRef = useRef(0);
  // Engine evals by FEN, filled in the background so every board shows one (only
  // ~1 in 5 positions comes from a server-analysed game). Held in a ref because
  // the render effect must not re-fire on every position analysed — `evalsReady`
  // bumps once, when a pass finishes and actually added something.
  const evalsRef = useRef<Map<string, number>>(new Map());
  // Positions we've already searched — including ones the engine gave nothing
  // for, which would otherwise be retried on every redraw.
  const triedRef = useRef<Set<string>>(new Set());
  const [evalsReady, setEvalsReady] = useState(0);
  const [analysing, setAnalysing] = useState<{ done: number; total: number } | null>(null);

  // The poster's own tree: a lower games floor than the clinic (every line you
  // played, not just the ≥2 core) and budgeted to the chosen sheet — portrait
  // gets fewer, longer lines; landscape more, shorter ones. Rebuilt on an
  // orientation switch, which is why it isn't built once by the sidebar.
  // `focusPath` goes in here rather than being filtered out later, so a focused
  // poster spends the whole budget inside that opening.
  const tree = useMemo(
    () => buildOpeningTree(games, color, 1, POSTER_MAX_NODES, POSTER_BUDGET[orientation], focusPath),
    [games, color, orientation, focusPath]
  );

  const opts = useCallback(
    (): OpeningPdfOpts => ({ focusPath, focusName, orientation, evals: evalsRef.current }),
    [focusPath, focusName, orientation]
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // (Re)render the preview image whenever a choice changes. Stale renders are
  // dropped so the <img> only ever shows the current one.
  useEffect(() => {
    const run = ++runRef.current;
    setBuilding(true);
    setErr(false);
    renderOpeningTreePreview(tree, color, opts())
      .then(({ dataUrl, pages: n, branches: br, fens }) => {
        if (run !== runRef.current) return; // superseded
        setImg(dataUrl);
        setPages(n);
        setBranches(br);
        setBuilding(false);
        // Preview is up; now fill in the missing evals. Cached per position, so
        // this is instant on a re-render and only searches what's genuinely new.
        const missing = fens.filter((f) => !evalsRef.current.has(f) && !triedRef.current.has(f));
        if (!missing.length) return;
        setAnalysing({ done: 0, total: missing.length });
        fillPosterEvals(
          missing,
          (done, total) => { if (run === runRef.current) setAnalysing({ done, total }); },
          () => run !== runRef.current,
        )
          .then((found) => {
            if (run !== runRef.current) return;
            setAnalysing(null);
            for (const f of missing) triedRef.current.add(f);
            let added = 0;
            for (const [fen, cp] of found) {
              if (!evalsRef.current.has(fen)) { evalsRef.current.set(fen, cp); added++; }
            }
            if (added) setEvalsReady((v) => v + 1); // redraw with the evals in
          })
          .catch(() => { if (run === runRef.current) setAnalysing(null); });
      })
      .catch(() => {
        if (run !== runRef.current) return;
        setErr(true);
        setBuilding(false);
      });
    return () => {
      runRef.current++;
    };
  }, [tree, color, opts, evalsReady]);

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const built = await buildOpeningTreePdf(tree, color, opts());
      await savePdf(built);
    } finally {
      setSaving(false);
    }
  }, [saving, tree, color, opts]);

  if (!mounted) return null;

  const orientOpts: [Orientation, string][] = [
    ['portrait', 'Portrait'],
    ['landscape', 'Landscape'],
  ];

  const dialog = (
    <div className="pv-backdrop" onClick={onClose}>
      <div
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Print opening poster"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pd-head">
          <div className="pd-title">
            Print · {focusName ? focusName : `full ${color === 'w' ? 'White' : 'Black'} tree`}
          </div>
          <button className="pv-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="pd-preview">
          {err ? (
            <div className="pd-msg">Couldn’t build the preview. Try again.</div>
          ) : img ? (
            <img className="pd-frame" src={img} alt="Poster preview" />
          ) : (
            <div className="pd-msg">Rendering preview…</div>
          )}
          {building && !err && img && <div className="pd-badge">Rendering…</div>}
        </div>

        <div className="pd-controls">
          <div className="pd-row">
            <span className="pd-lbl">Orientation</span>
            <div className="seg-tabs">
              {orientOpts.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={'seg-tab' + (orientation === val ? ' on' : '')}
                  onClick={() => setOrientation(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {analysing && (
            <div className="pd-note">
              Analysing positions with Stockfish… {analysing.done}/{analysing.total}
              {' '}— you can save now and the evals will be missing, or wait a moment.
            </div>
          )}
          <div className="pd-note">
            One A1 sheet. The columns go to the lines you play most; openings you only
            tried appear as a few boards where there is room.
          </div>
        </div>

        <div className="pv-actions">
          <button className="ps-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="ps-btn prim" onClick={onSave} disabled={building || err || saving}>
            {saving ? 'Opening…' : 'Save / share'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
