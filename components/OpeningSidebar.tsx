'use client';

import { useState } from 'react';
import { useClinic } from '@/lib/clinic-context';
import { PrintDialog } from '@/components/PrintDialog';

/**
 * Left panel for Opening mode: a colour switch and a filterable list of your
 * openings. Picking one focuses the tree on that opening's subtree (the clinic
 * and this list share state via ClinicProvider). Import lives in the top-bar
 * import panel now, shared across modes. "Print" exports an A1 PDF poster — the
 * focused opening's subtree when one is picked, else the whole colour, at full
 * depth (auto-reduced only when a huge tree wouldn't fit A1). Share sheet on
 * iOS, download on web.
 */
export function OpeningSidebar() {
  const { color, setColor, tree, games, openings, focus, setFocus, setSelectedId, loading, fetching } = useClinic();
  const [showPrint, setShowPrint] = useState(false);


  // The named opening for the current focus, so Print can scope + title the
  // poster. Prefer an exact match; otherwise the most specific ancestor opening
  // (longest matching path) — never the broad first-move opening just because it
  // happens to sort first.
  const focusOpening = focus
    ? openings.find((o) => o.pathId === focus) ??
      openings
        .filter((o) => focus.startsWith(`${o.pathId}/`))
        .sort((a, b) => b.pathId.length - a.pathId.length)[0] ??
      null
    : null;

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
        <button
          type="button"
          className="side-print"
          onClick={() => setShowPrint(true)}
          disabled={loading || openings.length === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <span className="side-print-lbl">
            Print {focusOpening ? focusOpening.name : `full ${color === 'w' ? 'White' : 'Black'} tree`} · A1
          </span>
        </button>
        {showPrint && (
          <PrintDialog
            games={games}
            color={color}
            focusPath={focus}
            focusName={focusOpening?.name ?? null}
            onClose={() => setShowPrint(false)}
          />
        )}
      </div>

      <div className="qcount">
        {loading
          ? <span className="q-loading">mapping your openings…</span>
          : <span>→ <em>{openings.length}</em> opening{openings.length === 1 ? '' : 's'}</span>}
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
