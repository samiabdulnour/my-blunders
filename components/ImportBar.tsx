'use client';

import { useState, useRef } from 'react';
import type { Puzzle } from '@/lib/types';
import { useImporter, BATCH_SIZE } from '@/lib/useImporter';
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
    capped,
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

  // Progress reflects the *analysis* — how many games we've turned into puzzles,
  // toward the auto target (which is smaller on phones to save battery). The
  // opening-study corpus fills separately and cheaply, so it isn't counted here.
  const analysed = Math.min(target, fetchedCount);
  const pct = target > 0 ? Math.round((analysed / target) * 100) : 0;

  // Status caption: the live action + count while working, then a clear resting
  // summary that points to "Import more" once the auto target is reached.
  let caption: React.ReactNode = null;
  if (working) {
    caption = `${status.message ?? 'analysing your games…'} · ${analysed}/${target}`;
  } else if (status.kind === 'error') {
    caption = status.message;
  } else if (capped) {
    caption = `${fetchedCount} games analysed — “Import more” for the next ${BATCH_SIZE}`;
  } else if (exhausted) {
    caption = `${fetchedCount} games · all your history imported`;
  } else if (fetchedCount > 0) {
    caption = `${fetchedCount} games analysed`;
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
        aria-pressed={autoImportEnabled}
        className={'auto-btn' + (autoImportEnabled ? ' on' : '')}
        onClick={() => setAutoImport(!autoImportEnabled)}
        title={
          autoImportEnabled
            ? `Auto-import on — building toward ${target} games in the background`
            : 'Auto-import off — pull each batch with “Import more”'
        }
      >
        Auto-import: {autoImportEnabled ? <>on<span className="auto-btn-sub"> · to {target}</span></> : 'off'}
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
