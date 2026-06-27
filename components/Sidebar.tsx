'use client';

import { useMemo } from 'react';
import type {
  EcoFilter,
  Filter,
  PhaseFilter,
  Puzzle,
  SolveStatus,
  SpeedFilter,
} from '@/lib/types';
import { ecoName } from '@/lib/eco-names';
import { FilterChip } from './FilterChip';

interface SidebarProps {
  all: Puzzle[];
  filtered: Puzzle[];
  filter: Filter;
  ecoFilter: EcoFilter;
  speedFilter: SpeedFilter;
  phaseFilter: PhaseFilter;
  current: Puzzle | null;
  solved: Record<string, SolveStatus>;
  /** Tab counts across the whole library (not narrowed by chips). */
  counts: { new: number; retry: number; all: number };
  onFilterChange: (f: Filter) => void;
  onEcoFilterChange: (e: EcoFilter) => void;
  onSpeedFilterChange: (s: SpeedFilter) => void;
  onPhaseFilterChange: (p: PhaseFilter) => void;
  onSelect: (p: Puzzle) => void;
}

const PHASE_OPTIONS = [
  { value: 'opening', label: 'Opening' },
  { value: 'middlegame', label: 'Middlegame' },
  { value: 'endgame', label: 'Endgame' },
];

/** Move number the puzzle starts from (1-based), derived from ply count. */
function moveNumber(p: Puzzle): number {
  return Math.floor(p.setupMoves.length / 2) + 1;
}

/**
 * Left sidebar: import bar, a NEW/RETRY/ALL segmented control, add-filter
 * chips (time format · phase · opening), a matched-count line, and the
 * scrollable queue of puzzle cards. Filter dimensions are derived from the
 * puzzles actually loaded, so chips only ever offer values that exist.
 */
export function Sidebar({
  all,
  filtered,
  filter,
  ecoFilter,
  speedFilter,
  phaseFilter,
  current,
  solved,
  counts,
  onFilterChange,
  onEcoFilterChange,
  onSpeedFilterChange,
  onPhaseFilterChange,
  onSelect,
}: SidebarProps) {
  // Distinct ECO codes present, sorted, with full opening names attached.
  const ecoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of all) if (p.eco) set.add(p.eco);
    return Array.from(set)
      .sort()
      .map((code) => {
        const name = ecoName(code);
        return { value: code, label: name ? `${code} · ${name}` : code };
      });
  }, [all]);

  // Distinct speed buckets present (skip unknown/missing).
  const speedOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of all) if (p.speed && p.speed !== 'unknown') set.add(p.speed);
    return Array.from(set).map((s) => ({ value: s, label: s }));
  }, [all]);

  const activeFilterCount = [speedFilter, phaseFilter, ecoFilter].filter(
    (v) => v !== 'all'
  ).length;

  return (
    <div className="side">
      <div className="side-block">
        <div className="side-h">Queue</div>
        <div className="seg-tabs">
          {(['new', 'retry', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={'seg-tab' + (filter === f ? ' on' : '')}
              onClick={() => onFilterChange(f)}
            >
              {f} <span className="ct">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="side-block">
        <div className="side-h">
          Filters
          {activeFilterCount > 0 && (
            <span className="active-count">· {activeFilterCount} active</span>
          )}
        </div>
        <div className="chip-row">
          <FilterChip
            label="Time format"
            allLabel="Any time"
            value={speedFilter}
            onChange={(v) => onSpeedFilterChange(v as SpeedFilter)}
            options={speedOptions}
          />
          <FilterChip
            label="Phase"
            allLabel="Any phase"
            value={phaseFilter}
            onChange={(v) => onPhaseFilterChange(v as PhaseFilter)}
            options={PHASE_OPTIONS}
          />
          <FilterChip
            label="Opening"
            allLabel="Any opening"
            value={ecoFilter}
            onChange={(v) => onEcoFilterChange(v)}
            options={ecoOptions}
          />
        </div>
      </div>

      <div className="qcount">
        → <em>{filtered.length}</em> matched
      </div>

      <div className="queue">
        {filtered.length === 0 && (
          <div className="queue-empty">
            {all.length === 0
              ? 'No puzzles yet. Import games from Lichess above.'
              : 'No puzzles match your filters.'}
          </div>
        )}
        {filtered.map((p) => {
          const st = solved[p.id];
          const initials = p.opponent.slice(0, 2).toUpperCase();
          const cls =
            'qcard' +
            (current?.id === p.id ? ' cur' : '') +
            (st === 'ok' ? ' solved-ok' : st === 'fail' ? ' solved-fail' : '');
          return (
            <div key={p.id} className={cls} onClick={() => onSelect(p)}>
              <div className="ava">
                {st === 'ok' ? '✓' : st === 'fail' ? '✗' : initials}
              </div>
              <div className="qinfo">
                <div className="qopp">vs {p.opponent}</div>
                <div className="qmeta">
                  {p.eco} · move {moveNumber(p)}
                  {p.speed && p.speed !== 'unknown' ? ` · ${p.speed}` : ''}
                </div>
              </div>
              <div className="qdrop">{st === 'ok' ? 'solved' : `−${p.drop.toFixed(1)}`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
