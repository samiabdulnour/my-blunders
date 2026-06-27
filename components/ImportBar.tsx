'use client';

import { useState, useRef } from 'react';
import type { Puzzle } from '@/lib/types';
import { useImporter } from '@/lib/useImporter';
import { useAutoImport, setAutoImport } from '@/lib/use-auto-import';

interface ImportBarProps {
  /** Called as puzzles arrive from an import. */
  onImport: (newPuzzles: Puzzle[]) => void;
  /** Fired when the user's own games are fetched (before analysis produces
   *  puzzles), so the app can drop the famous-blunder placeholders at once. */
  onGamesFetched?: () => void;
  /** Wipe all imported puzzles and solved progress from cache. */
  onClearAll: () => void;
  /** Unsolved puzzle count (passed through for API compatibility). */
  unseenCount: number;
}

/**
 * Compact sidebar import bar: a username field + coral IMPORT button, an
 * auto-import switch, and quiet links for PGN upload / cache-clear. With
 * auto-import on, the app keeps pulling + analysing games in the background
 * toward a target library; off, the user pulls each batch with "Import more".
 * All the import machinery lives in the shared `useImporter` hook.
 */
export function ImportBar({ onImport, onGamesFetched, onClearAll, unseenCount }: ImportBarProps) {
  const {
    username,
    setUsername,
    source,
    setSource,
    status,
    setStatus,
    oldestMs,
    fetchedCount,
    exhausted,
    target,
    working,
    runImport,
    importFile,
    resetCursor,
  } = useImporter({ onImport, onGamesFetched, unseenCount });

  const autoImportEnabled = useAutoImport();

  const fileRef = useRef<HTMLInputElement>(null);
  // Two-step clear: avoids window.confirm (unreliable in mobile / in-app
  // webviews) and gives a real, mis-tap-proof touch target for a destructive act.
  const [confirmClear, setConfirmClear] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) await importFile(file);
  };

  const doClear = () => {
    onClearAll();
    resetCursor();
    setStatus({ kind: 'ok', message: 'cache cleared' });
    setConfirmClear(false);
  };

  const progress = working ? status.progress : undefined;
  // With auto-import building the library, show progress toward the whole target
  // (e.g. 143/500), not the current 20-game batch — "/20" while fetching 500 is
  // confusing. Off, the per-batch count is what's meaningful.
  const libraryDone = Math.min(target, fetchedCount + (progress?.current ?? 0));
  const pct = autoImportEnabled
    ? Math.round((libraryDone / target) * 100)
    : progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  // Status caption: live message while working / on error, otherwise a quiet
  // summary of how far the library has filled.
  let caption: React.ReactNode = null;
  if (working) {
    caption = autoImportEnabled
      ? `building library · ${libraryDone} / ${target} games`
      : status.message;
  } else if (status.kind === 'error') {
    caption = status.message;
  } else if (fetchedCount > 0) {
    if (exhausted) caption = `${fetchedCount} games · all your history imported`;
    else if (autoImportEnabled) caption = `${fetchedCount} / ${target} games imported`;
    else caption = `${fetchedCount} games imported`;
  } else if (status.kind === 'ok' && status.message) {
    caption = status.message;
  }

  return (
    <div className="side-block import-bar">
      <div className="side-h">Import games</div>
      <div className="seg-tabs src-seg" role="tablist" aria-label="Import source">
        <button
          type="button"
          role="tab"
          aria-selected={source === 'lichess'}
          className={'seg-tab' + (source === 'lichess' ? ' on' : '')}
          onClick={() => setSource('lichess')}
          disabled={working}
        >
          Lichess
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'chesscom'}
          className={'seg-tab' + (source === 'chesscom' ? ' on' : '')}
          onClick={() => setSource('chesscom')}
          disabled={working}
        >
          Chess.com
        </button>
      </div>
      <div className="username-row">
        <input
          type="text"
          className="username-input"
          placeholder={source === 'chesscom' ? 'chess.com username' : 'Lichess username'}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !working) runImport(oldestMs ?? undefined);
          }}
          spellCheck={false}
          autoCapitalize="none"
          disabled={working}
        />
        <button
          type="button"
          className="imp-btn"
          disabled={working}
          onClick={() => runImport(oldestMs ?? undefined)}
        >
          {working ? 'Importing' : fetchedCount > 0 ? 'Import more' : 'Import'}
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={autoImportEnabled}
        className={'auto-toggle' + (autoImportEnabled ? ' on' : '')}
        onClick={() => setAutoImport(!autoImportEnabled)}
        title={
          autoImportEnabled
            ? `Auto-import on — building toward ${target} games in the background`
            : 'Auto-import off — pull each batch with “Import more”'
        }
      >
        <span className="auto-track"><span className="auto-thumb" /></span>
        <span className="auto-label">
          Auto-import{autoImportEnabled ? <span className="auto-sub"> · to {target}</span> : null}
        </span>
      </button>

      {working && (
        <div className="imp-progress">
          <div className="bar" style={{ width: pct + '%' }} />
        </div>
      )}

      {caption && (
        <div className={'imp-status' + (status.kind === 'error' ? ' err' : '')}>{caption}</div>
      )}

      {confirmClear ? (
        <div className="imp-confirm">
          <span className="imp-confirm-q">Clear everything?</span>
          <button type="button" className="imp-confirm-btn yes" onClick={doClear}>
            Clear
          </button>
          <button type="button" className="imp-confirm-btn no" onClick={() => setConfirmClear(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="imp-row">
          <button
            type="button"
            className="imp-link"
            disabled={working}
            onClick={() => fileRef.current?.click()}
          >
            Upload PGN
          </button>
          <span className="imp-sep">·</span>
          <button
            type="button"
            className="imp-link danger"
            onClick={() => setConfirmClear(true)}
          >
            Clear all
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pgn,text/plain"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  );
}
