'use client';

import { useClinic } from '@/lib/clinic-context';

/**
 * Left panel for Opening mode: a colour switch and a filterable list of your
 * openings. Picking one focuses the tree on that opening's subtree (the clinic
 * and this list share state via ClinicProvider). Import lives in the top-bar
 * import panel now, shared across modes.
 */
export function OpeningSidebar() {
  const { color, setColor, openings, focus, setFocus, setSelectedId, loading, fetching } = useClinic();

  return (
    <div className="side">

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
        {loading
          ? <span className="q-loading">mapping your openings…</span>
          : <>→ <em>{openings.length}</em> opening{openings.length === 1 ? '' : 's'}</>}
      </div>

      <div className="queue">
        {loading ? (
          <div className="queue-empty">Loading your openings…</div>
        ) : openings.length === 0 ? (
          <div className="queue-empty">
            {fetching ? 'Importing your games…' : 'Import games from Lichess above to map your openings.'}
          </div>
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
                onClick={() => { setFocus(o.pathId); setSelectedId(o.pathId); }}
                title={o.name}
              >
                <span className="op-name">{o.name}</span>
                <span className="op-ct num">{o.games} game{o.games === 1 ? '' : 's'} · <span className={'op-score ' + o.perf}>{o.score}%</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
