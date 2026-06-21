'use client';

import type { Puzzle } from '@/lib/types';
import { ImportBar } from './ImportBar';
import { useClinic } from '@/lib/clinic-context';

interface OpeningSidebarProps {
  onImport: (newPuzzles: Puzzle[]) => void;
  onGamesFetched?: () => void;
  onClearAll: () => void;
  unseenCount: number;
}

/**
 * Left panel for Opening mode: the same import bar as the trainer, plus a
 * colour switch and a filterable list of your openings. Picking one focuses the
 * tree on that opening's subtree (the clinic and this list share state via
 * ClinicProvider). Replaces the puzzle queue, which is irrelevant here.
 */
export function OpeningSidebar({ onImport, onGamesFetched, onClearAll, unseenCount }: OpeningSidebarProps) {
  const { color, setColor, openings, focus, setFocus, setSelectedId } = useClinic();

  return (
    <div className="side">
      <ImportBar
        onImport={onImport}
        onGamesFetched={onGamesFetched}
        onClearAll={onClearAll}
        unseenCount={unseenCount}
      />

      <div className="side-block">
        <div className="side-h">Repertoire</div>
        <div className="seg-tabs">
          <button type="button" className={'seg-tab' + (color === 'w' ? ' on' : '')} onClick={() => setColor('w')}>
            White
          </button>
          <button type="button" className={'seg-tab' + (color === 'b' ? ' on' : '')} onClick={() => setColor('b')}>
            Black
          </button>
        </div>
      </div>

      <div className="qcount">
        → <em>{openings.length}</em> opening{openings.length === 1 ? '' : 's'}
      </div>

      <div className="queue">
        {openings.length === 0 ? (
          <div className="queue-empty">Import games from Lichess above to map your openings.</div>
        ) : (
          <div className="op-list">
            <button
              type="button"
              className={'op-item' + (focus === null ? ' cur' : '')}
              onClick={() => { setFocus(null); setSelectedId(null); }}
            >
              <span className="op-name">All openings</span>
            </button>
            {openings.map((o) => (
              <button
                key={o.pathId}
                type="button"
                className={'op-item' + (focus === o.pathId ? ' cur' : '')}
                onClick={() => { setFocus(o.pathId); setSelectedId(o.pathId.split('/').pop() ?? null); }}
              >
                <span className="op-name">{o.name}</span>
                <span className="op-ct num">{o.games}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
