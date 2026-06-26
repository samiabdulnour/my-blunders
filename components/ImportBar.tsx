'use client';

import { useRef } from 'react';
import type { Puzzle } from '@/lib/types';
import { useImporter } from '@/lib/useImporter';

interface ImportBarProps {
  /** Called as puzzles arrive from an import. */
  onImport: (newPuzzles: Puzzle[]) => void;
  /** Fired when the user's own games are fetched (before analysis produces
   *  puzzles), so the app can drop the famous-blunder placeholders at once. */
  onGamesFetched?: () => void;
  /** Wipe all imported puzzles and solved progress from cache. */
  onClearAll: () => void;
  /** Unsolved puzzle count — drives the quiet auto-import loop. */
  unseenCount: number;
}

/**
 * Compact sidebar import bar: a username field + coral IMPORT button, with a
 * thin progress bar during a streamed import and a status caption beneath.
 * PGN upload and cache-clear live as quiet text links so the common path
 * (type username → Import) stays front and centre. All the actual import
 * machinery lives in the shared `useImporter` hook.
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
    working,
    runImport,
    importFile,
    resetCursor,
  } = useImporter({ onImport, onGamesFetched, unseenCount });

  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) await importFile(file);
  };

  const progress = working ? status.progress : undefined;
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  // Status caption: live message while working / on error, otherwise the
  // quiet "N games · auto-import on" line once at least one import has run.
  let caption: React.ReactNode = null;
  if (working) {
    caption = status.message;
  } else if (status.kind === 'error') {
    caption = status.message;
  } else if (fetchedCount > 0) {
    caption = `${fetchedCount} games · auto-import ${exhausted ? 'off' : 'on'}`;
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

      {progress && (
        <div className="imp-progress">
          <div className="bar" style={{ width: pct + '%' }} />
        </div>
      )}

      {caption && (
        <div className={'imp-status' + (status.kind === 'error' ? ' err' : '')}>{caption}</div>
      )}

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
          disabled={working}
          onClick={() => {
            if (
              window.confirm(
                'Clear all imported puzzles and solved progress? Seed puzzles will remain.'
              )
            ) {
              onClearAll();
              resetCursor();
              setStatus({ kind: 'ok', message: 'cache cleared' });
            }
          }}
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
    </div>
  );
}
