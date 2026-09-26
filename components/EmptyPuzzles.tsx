'use client';

import type { Importer } from '@/lib/useImporter';
import { useImportStatus } from '@/lib/import-status';

/**
 * What the puzzle screen shows when there is no puzzle to put on the board —
 * a first import still running, a fresh "Clear all", or a username whose games
 * held no blunders.
 *
 * It used to be two static lines pointing at an import box in the sidebar. The
 * box moved into Settings, so the message led nowhere, and while an import was
 * running the screen said nothing at all. Now it reports the import live, and
 * when nothing is running it offers the one action that gets puzzles: import.
 * Body text only (the `.empty` style) plus the standard primary button — no new
 * type styles.
 */
export function EmptyPuzzles({ importer }: { importer: Importer }) {
  const status = useImportStatus();
  const { username, source, oldestMs, exhausted, runImport } = importer;
  const site = source === 'chesscom' ? 'chess.com' : 'Lichess';

  if (status.kind === 'working') {
    return (
      <div className="empty" aria-live="polite">
        <div>Finding your blunders…</div>
        <div>{status.message}</div>
      </div>
    );
  }

  if (!username.trim()) {
    return (
      <div className="empty">
        <div>No puzzles yet.</div>
        <div>Open the menu, then Settings, and add your Lichess or chess.com username.</div>
      </div>
    );
  }

  return (
    <div className="empty">
      <div>No puzzles yet.</div>
      {status.kind === 'error' && <div>{status.message}</div>}
      {exhausted ? (
        <div>Every game by {username.trim()} on {site} has been checked.</div>
      ) : (
        <>
          <div>
            {username.trim()} on {site}
          </div>
          <button type="button" className="btn prim" onClick={() => runImport(oldestMs ?? undefined)}>
            Import my games
          </button>
        </>
      )}
    </div>
  );
}
