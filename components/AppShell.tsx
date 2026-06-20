'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { HistoryEntry, SessionStats } from '@/lib/types';
import type { ThemeMode } from '@/lib/storage';
import { BrandMark } from './BrandMark';
import { StatsSheet } from './StatsSheet';

interface AppShellProps {
  stats: SessionStats;
  /** Unseen puzzle count, shown as "queue" in the stats sheet. */
  queueSize: number;
  history: HistoryEntry[];
  randomOrder: boolean;
  onToggleRandom: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  /** Sidebar + main, supplied by the page. */
  children: React.ReactNode;
}

/**
 * Outer frame for the running app: a 48px topbar (sidebar toggle · brand ·
 * stats cluster · prefs) above a body row that holds the sidebar and board
 * area. Owns the two pieces of pure UI state the chrome needs — whether the
 * sidebar is open and whether the stats sheet is showing — while puzzle and
 * preference state stay in the page and arrive as props.
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
  children,
}: AppShellProps) {
  const [sideOpen, setSideOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLButtonElement | null>(null);

  // After mount, collapse the sidebar on narrow viewports (mobile).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 900px)').matches) setSideOpen(false);
  }, []);

  // Click-away for the stats sheet — ignore clicks on the toggle itself.
  useEffect(() => {
    if (!statsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sheetRef.current?.contains(target)) return;
      if (stripRef.current?.contains(target)) return;
      setStatsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [statsOpen]);

  // Close the sheet on Escape for keyboard users.
  useEffect(() => {
    if (!statsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [statsOpen]);

  const closeOnMobile = () => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 900px)').matches) setSideOpen(false);
  };

  const total = stats.correct + stats.wrong;
  const accuracy = total > 0 ? Math.round((stats.correct / total) * 100) : 0;

  return (
    <div className="app-root">
      <div className="topbar">
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

        <button
          type="button"
          ref={stripRef}
          className="stats-strip"
          onClick={() => setStatsOpen((o) => !o)}
          aria-label="Session stats"
          aria-expanded={statsOpen}
        >
          <div className="stat s-today">
            <span className="v pos">{stats.correct}</span>
            <span className="lbl">solved</span>
          </div>
          <div className="stat s-acc">
            <span className="v">{accuracy}%</span>
            <span className="lbl">accuracy</span>
          </div>
          <div className="stat s-streak">
            <span className="v">{stats.streak}</span>
            <span className="lbl">streak</span>
          </div>
        </button>

        <div className="topbar-prefs">
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

      <div className={'body-row' + (sideOpen ? '' : ' side-closed')}>
        {children}
        {sideOpen && <div className="scrim" onClick={closeOnMobile} />}
      </div>
    </div>
  );
}
