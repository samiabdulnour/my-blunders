'use client';

import { useState, useRef } from 'react';
import { BATCH_SIZE, QUEUE_TARGET, type Importer } from '@/lib/useImporter';
import { useImportStatus } from '@/lib/import-status';
import { useAutoImport, setAutoImport } from '@/lib/use-auto-import';

interface ImportBarProps {
  /** The page-level importer. Owned by the page rather than this bar so the
   *  auto-import loop keeps running while the settings panel is closed. */
  importer: Importer;
  /** Wipe all imported puzzles and solved progress from cache. */
  onClearAll: () => void;
}

/**
 * Compact sidebar import bar: a username field + coral IMPORT button, an
 * auto-import switch, and quiet links for PGN upload / cache-clear. With
 * auto-import on, the app keeps pulling + analysing games in the background
 * toward a target library; off, the user pulls each batch with "Import more".
 * All the import machinery lives in the shared `useImporter` hook, which the
 * page creates once and passes in — this component is only its controls.
 */
export function ImportBar({ importer, onClearAll }: ImportBarProps) {
  const {
    username,
    setUsername,
    source,
    setSource,
    setStatus,
    oldestMs,
    fetchedCount,
    exhausted,
    runImport,
    importFile,
    resetCursor,
  } = importer;

  const autoImportEnabled = useAutoImport();
  const status = useImportStatus();
  const working = status.kind === 'working';

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
    setStatus({ kind: 'ok', message: 'Everything cleared. Tap Import to start again.' });
    setConfirmClear(false);
  };

  // How far through the current batch: whole games done, plus the fraction of
  // the game being scanned. Unknown while downloading — the stripe travels then.
  const batchFraction =
    status.progress && status.progress.total > 0
      ? (status.progress.current +
          (status.moveProgress && status.moveProgress.total > 0
            ? status.moveProgress.done / status.moveProgress.total
            : 0)) /
        status.progress.total
      : null;

  // Status caption: the live action + running count while working, then a clear
  // resting summary. Auto-import keeps pulling in the background with no cap, so
  // there's no "target" — just how many games have been turned into puzzles.
  let caption: React.ReactNode = null;
  if (working) {
    // The importer's own words: which game, how far through it, what it found.
    caption = status.message ?? 'Looking through your games…';
  } else if (status.kind === 'error') {
    caption = status.message;
  } else if (exhausted) {
    caption = `${fetchedCount} games · all your history imported`;
  } else if (fetchedCount > 0) {
    // Auto-import idles once plenty of unsolved puzzles are waiting (see
    // QUEUE_TARGET) and picks up again as they're solved.
    caption = autoImportEnabled
      ? `${fetchedCount} games analysed · more load as you solve`
      : `${fetchedCount} games analysed — “Import more” for the next ${BATCH_SIZE}`;
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
          {working ? 'Importing' : 'Import'}
        </button>
      </div>

      {fetchedCount > 0 && !exhausted && !working && (
        <button
          type="button"
          className="imp-more-btn"
          onClick={() => runImport(oldestMs ?? undefined)}
        >
          Import more
        </button>
      )}

      <button
        type="button"
        aria-pressed={autoImportEnabled}
        className={'auto-btn' + (autoImportEnabled ? ' on' : '')}
        onClick={() => setAutoImport(!autoImportEnabled)}
        title={
          autoImportEnabled
            ? 'Auto-import on — keeps a stock of unsolved puzzles ready, through your whole history'
            : 'Auto-import off — pull each batch with “Import more”'
        }
      >
        Auto-import: {autoImportEnabled ? <>on<span className="auto-btn-sub"> · keeps {QUEUE_TARGET} ready</span></> : 'off'}
      </button>

      {working && (
        <div className="imp-progress">
          {batchFraction == null ? (
            <div className="bar indeterminate" />
          ) : (
            <div className="bar" style={{ width: Math.round(batchFraction * 100) + '%' }} />
          )}
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
