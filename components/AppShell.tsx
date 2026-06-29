'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { HistoryEntry, Puzzle, SessionStats } from '@/lib/types';
import type { ThemeMode } from '@/lib/storage';
import { BrandMark } from './BrandMark';
import { StatsSheet } from './StatsSheet';
import { ImportBar } from './ImportBar';

interface AppShellProps {
  stats: SessionStats;
  /** Unseen puzzle count, shown as "queue" in the stats sheet. */
  queueSize: number;
  history: HistoryEntry[];
  randomOrder: boolean;
  onToggleRandom: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  /** Puzzle · Opening · Play · Coordinates mode for the shared topbar switch. */
  mode: 'puzzle' | 'opening' | 'play' | 'coords';
  onModeChange: (mode: 'puzzle' | 'opening' | 'play' | 'coords') => void;
  /** Import controls live in a top-bar dropdown (one hub for every mode). */
  onImport: (newPuzzles: Puzzle[]) => void;
  onGamesFetched?: () => void;
  onClearAll: () => void;
  unseenCount: number;
  /** Sidebar + main, supplied by the page. */
  children: React.ReactNode;
}

/**
 * Outer frame for the running app: a 48px topbar (sidebar toggle · brand ·
 * mode tabs · prefs) above a body row that holds the sidebar and board area.
 * The topbar is identical in both modes; session stats are a prefs icon whose
 * sheet drops from the top-right. Owns the sidebar-open and stats-sheet state.
 *
 * The sidebar defaults open on desktop and collapses on mobile; we detect the
 * viewport after mount to avoid an SSR/CSR hydration mismatch. On mobile the
 * sidebar becomes a slide-in drawer with a click-away scrim.
 */
export function AppShell({
  stats,
  queueSize,
  history,
  randomOrder,
  onToggleRandom,
  theme,
  onToggleTheme,
  mode,
  onModeChange,
  onImport,
  onGamesFetched,
  onClearAll,
  unseenCount,
  children,
}: AppShellProps) {
  const [sideOpen, setSideOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const statsBtnRef = useRef<HTMLButtonElement | null>(null);
  const importSheetRef = useRef<HTMLDivElement | null>(null);
  const importBtnRef = useRef<HTMLButtonElement | null>(null);

  // After mount, collapse the sidebar on mobile and landscape phones.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isNarrow = window.matchMedia('(max-width: 900px)').matches;
    const isLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    if (isNarrow || isLandscape) setSideOpen(false);
  }, []);

  // Click-away + Escape for the stats sheet (ignore clicks on the toggle).
  useEffect(() => {
    if (!statsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sheetRef.current?.contains(target)) return;
      if (statsBtnRef.current?.contains(target)) return;
      setStatsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [statsOpen]);

  // Click-away + Escape for the import sheet.
  useEffect(() => {
    if (!importOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (importSheetRef.current?.contains(target)) return;
      if (importBtnRef.current?.contains(target)) return;
      setImportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [importOpen]);

  const closeOnMobile = () => {
    if (typeof window === 'undefined') return;
    const isNarrow = window.matchMedia('(max-width: 900px)').matches;
    const isLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    if (isNarrow || isLandscape) setSideOpen(false);
  };

  return (
    <div className="app-root">
      <div className="topbar">
        <div className="topbar-lead">
        <button
          type="button"
          className="topbar-toggle"
          onClick={() => setSideOpen((o) => !o)}
          aria-label={sideOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-expanded={sideOpen}
        >
          {sideOpen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>

        <BrandMark />
        </div>

        <div className="mode-seg" role="tablist" aria-label="Mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'puzzle'}
            className={mode === 'puzzle' ? 'on' : ''}
            onClick={() => onModeChange('puzzle')}
          >
            Puzzles
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'opening'}
            className={mode === 'opening' ? 'on' : ''}
            onClick={() => onModeChange('opening')}
          >
            Opening
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'coords'}
            className={mode === 'coords' ? 'on' : ''}
            onClick={() => onModeChange('coords')}
          >
            Coordinates
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'play'}
            className={mode === 'play' ? 'on' : ''}
            onClick={() => onModeChange('play')}
          >
            Play
          </button>
        </div>

        <div className="topbar-spacer" />

        {/* On phones these don't fit the bar, so CSS hides them here and shows
            them as a strip at the top of the hamburger drawer (the `open`
            class). On desktop they stay inline and `open` is a no-op. */}
        <div className={'topbar-prefs' + (sideOpen ? ' open' : '')}>
          <button
            type="button"
            ref={importBtnRef}
            className={'icon-btn' + (importOpen ? ' on' : '')}
            onClick={() => setImportOpen((o) => !o)}
            title="Import games"
            aria-label="Import games"
            aria-expanded={importOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            type="button"
            ref={statsBtnRef}
            className={'icon-btn' + (statsOpen ? ' on' : '')}
            onClick={() => setStatsOpen((o) => !o)}
            title="Session stats"
            aria-label="Session stats"
            aria-expanded={statsOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="6" y1="20" x2="6" y2="14" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="18" y1="20" x2="18" y2="10" />
            </svg>
          </button>
          <Link
            href="/about"
            className="icon-btn"
            title="About my·blunders"
            aria-label="About my·blunders"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </Link>
          <button
            type="button"
            className={'icon-btn' + (randomOrder ? ' on' : '')}
            onClick={onToggleRandom}
            title="Random order"
            aria-label="Random order"
            aria-pressed={randomOrder}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {statsOpen && (
        <StatsSheet
          stats={stats}
          queueSize={queueSize}
          history={history}
          onClose={() => setStatsOpen(false)}
          sheetRef={sheetRef}
        />
      )}

      {importOpen && (
        <div className="import-sheet" ref={importSheetRef}>
          <ImportBar
            onImport={onImport}
            onGamesFetched={onGamesFetched}
            onClearAll={onClearAll}
            unseenCount={unseenCount}
          />
        </div>
      )}

      <div className={'body-row' + (sideOpen ? '' : ' side-closed')}>
        {children}
        {sideOpen && <div className="scrim" onClick={closeOnMobile} />}
      </div>
    </div>
  );
}
