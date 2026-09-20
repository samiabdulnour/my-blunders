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
import type { SessionStats } from '@/lib/types';
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
  /** Session stats + unsolved-queue size, shown condensed at the top. */
  stats: SessionStats;
  queueSize: number;
  /** Shuffle toggle, shown in the matched-count row. */
  randomOrder: boolean;
  onToggleRandom: () => void;
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
  stats,
  queueSize,
  randomOrder,
  onToggleRandom,
  onFilterChange,
  onEcoFilterChange,
  onSpeedFilterChange,
  onPhaseFilterChange,
  onSelect,
}: SidebarProps) {
  const answered = stats.correct + stats.wrong;
  const accuracy = answered > 0 ? Math.round((stats.correct / answered) * 100) : 0;
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
      {/* Condensed session stats — visible at a glance above the queue. */}
      <div className="side-block ps-session">
        <div className="side-h">Session</div>
        <div className="ps-stats-row">
          <div className="ps-stat"><span className="ps-stat-v">{stats.correct}</span><span className="ps-stat-l">correct</span></div>
          <div className="ps-stat"><span className="ps-stat-v num">{accuracy}%</span><span className="ps-stat-l">accuracy</span></div>
          <div className="ps-stat"><span className="ps-stat-v">{stats.streak}</span><span className="ps-stat-l">streak</span></div>
          <div className="ps-stat"><span className="ps-stat-v">{queueSize}</span><span className="ps-stat-l">queue</span></div>
        </div>
      </div>
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
            chipLabel="Time"
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
        <span>→ <em>{filtered.length}</em> matched</span>
        <button
          type="button"
          className={'qcount-random' + (randomOrder ? ' on' : '')}
          onClick={onToggleRandom}
          title="Random puzzle order"
          aria-pressed={randomOrder}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
          </svg>
          Random
        </button>
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
