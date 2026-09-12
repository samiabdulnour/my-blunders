'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TreeNode } from '@/lib/opening-tree';
import { buildOpeningTreePdf, renderOpeningTreePreview, savePdf, type OpeningPdfOpts } from '@/lib/opening-pdf';

/**
 * Print dialog for the opening-tree poster. Shows a fit-to-page preview image
 * and one choice before you commit: orientation (portrait or landscape).
 * The whole repertoire is drawn on ONE A1 sheet; if it's too large to fit at a
 * readable board size, the least-played lines are pruned so the main lines stay
 * legible. The preview is a rasterised page-1 image (not an embedded PDF), so it
 * fits reliably everywhere. "Save / share" builds the real PDF and hands it off
 * (share sheet on iOS, download on web). Re-renders whenever a choice changes.
 */

type Orientation = 'landscape' | 'portrait';

interface PrintDialogProps {
  tree: TreeNode;
  color: 'w' | 'b';
  focusPath: string | null;
  focusName: string | null;
  onClose: () => void;
}

export function PrintDialog({ tree, color, focusPath, focusName, onClose }: PrintDialogProps) {
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

  const opts = useCallback(
    (): OpeningPdfOpts => ({ focusPath, focusName, orientation }),
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
      .then(({ dataUrl, pages: n, branches: br }) => {
        if (run !== runRef.current) return; // superseded
        setImg(dataUrl);
        setPages(n);
        setBranches(br);
        setBuilding(false);
      })
      .catch(() => {
        if (run !== runRef.current) return;
        setErr(true);
        setBuilding(false);
      });
    return () => {
      runRef.current++;
    };
  }, [tree, color, opts]);

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
          <div className="pd-note">
            One A1 sheet. If your repertoire is too large to fit, the least-played lines are
            dropped so your main lines stay readable.
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
