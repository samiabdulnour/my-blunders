'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { HistoryEntry, SessionStats } from '@/lib/types';
import type { ThemeMode } from '@/lib/storage';
import type { Importer } from '@/lib/useImporter';
import { BrandMark } from './BrandMark';
import { ImportBar } from './ImportBar';
import { BoardThemePicker } from './BoardThemePicker';
import { boardThemeById, type BoardThemeId } from '@/lib/board-theme';
import { BoardNavProvider, BoardSlotProvider, BoardExtrasProvider, useBoardNav, useBoardSlot, useBoardTopSlot, useBoardExtras } from '@/lib/board-nav';

interface AppShellProps {
  stats: SessionStats;
  /** Unseen puzzle count, shown as "queue" in the stats sheet. */
  queueSize: number;
  history: HistoryEntry[];
  randomOrder: boolean;
  onToggleRandom: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  /** Board colour theme per app-mode + its setter (the settings picker). */
  boardLight: BoardThemeId;
  boardDark: BoardThemeId;
  onSetBoard: (mode: 'light' | 'dark', id: BoardThemeId) => void;
  /** Board rank/file labels toggle (off by default). */
  coords: boolean;
  onToggleCoords: () => void;
  sound: boolean;
  onToggleSound: () => void;
  /** Puzzle · Opening · Play · Coordinates mode for the shared topbar switch. */
  mode: 'puzzle' | 'opening' | 'play' | 'coords';
  onModeChange: (mode: 'puzzle' | 'opening' | 'play' | 'coords') => void;
  /** Import controls live in a top-bar dropdown (one hub for every mode). */
  /** Created by the page (not here) so it outlives this panel. */
  importer: Importer;
  onClearAll: () => void;
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
  boardLight,
  boardDark,
  onSetBoard,
  coords,
  onToggleCoords,
  sound,
  onToggleSound,
  mode,
  onModeChange,
  importer,
  onClearAll,
  children,
}: AppShellProps) {
  const [sideOpen, setSideOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The settings sheet has a main view and a "board theme" palette sub-view.
  const [settingsView, setSettingsView] = useState<'main' | 'board'>('main');
  // Returning from the About page (which sets this flag on the way out) reopens
  // the sheet, so "About → back" lands on Settings rather than a bare board.
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('mb.reopenSettings') === '1') {
      sessionStorage.removeItem('mb.reopenSettings');
      setSettingsOpen(true);
    }
  }, []);
  // Closing the sheet always resets it to the main view.
  useEffect(() => {
    if (!settingsOpen) setSettingsView('main');
  }, [settingsOpen]);
  const settingsSheetRef = useRef<HTMLDivElement | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);

  // Collapse sidebar on narrow/landscape-phone viewports and keep it in sync
  // when the user rotates the device. orientationchange fires once per actual
  // rotation (unlike resize which fires on every animation frame), preventing
  // the layout from flickering between portrait and landscape styles mid-rotation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mqlNarrow = window.matchMedia('(max-width: 900px)');
    const mqlLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)');

    const sync = () => {
      if (mqlNarrow.matches || mqlLandscape.matches) {
        setSideOpen(false);
      } else {
        setSideOpen(true);
      }
    };

    sync(); // initial

    // screen.orientation is preferred; fall back to the older orientationchange.
    const orientationTarget: EventTarget =
      typeof screen !== 'undefined' && screen.orientation
        ? screen.orientation
        : window;
    const orientationEvent =
      typeof screen !== 'undefined' && screen.orientation ? 'change' : 'orientationchange';

    orientationTarget.addEventListener(orientationEvent, sync);
    // Also watch for window resize so desktop resizing to narrow collapses.
    mqlNarrow.addEventListener('change', sync);

    return () => {
      orientationTarget.removeEventListener(orientationEvent, sync);
      mqlNarrow.removeEventListener('change', sync);
    };
  }, []);

  // Click-away + Escape for the settings sheet.
  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsSheetRef.current?.contains(target)) return;
      if (settingsBtnRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  const closeOnMobile = () => {
    if (typeof window === 'undefined') return;
    const isNarrow = window.matchMedia('(max-width: 900px)').matches;
    const isLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    if (isNarrow || isLandscape) setSideOpen(false);
  };

  return (
    <BoardNavProvider>
    <BoardSlotProvider>
    <BoardExtrasProvider>
    <div className="app-root">
      <div className="topbar">
        <div className="topbar-lead">
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
          {/* Random-order + session stats now live in the puzzle sidebar. */}
          {/* Global settings: import · coordinates · dark mode · about. */}
          <button
            type="button"
            ref={settingsBtnRef}
            className={'icon-btn' + (settingsOpen ? ' on' : '')}
            onClick={() => setSettingsOpen((o) => !o)}
            title="Settings"
            aria-expanded={settingsOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </div>


      {settingsOpen && (
        <div className="settings-sheet" ref={settingsSheetRef}>
          {settingsView === 'board' ? (
            <>
              <button type="button" className="settings-back" onClick={() => setSettingsView('main')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              <h3>Board theme</h3>
              <BoardThemePicker boardLight={boardLight} boardDark={boardDark} onSet={onSetBoard} />
            </>
          ) : (
            <>
          <button type="button" className="settings-back" onClick={() => setSettingsOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <h3>Settings</h3>
          <div className="settings-toggles">
            <button type="button" className="settings-row" onClick={onToggleCoords} aria-pressed={coords}>
              <span className="settings-row-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="1" />
                  <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
                </svg>
                Board coordinates
              </span>
              <span className={'toggle-pill' + (coords ? ' on' : '')}>{coords ? 'On' : 'Off'}</span>
            </button>
            <button type="button" className="settings-row" onClick={onToggleSound} aria-pressed={sound}>
              <span className="settings-row-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                </svg>
                Move sound
              </span>
              <span className={'toggle-pill' + (sound ? ' on' : '')}>{sound ? 'On' : 'Off'}</span>
            </button>
            <button type="button" className="settings-row" onClick={onToggleTheme} aria-pressed={theme === 'dark'}>
              <span className="settings-row-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                Dark mode
              </span>
              <span className={'toggle-pill' + (theme === 'dark' ? ' on' : '')}>{theme === 'dark' ? 'On' : 'Off'}</span>
            </button>
            <button type="button" className="settings-row settings-link" onClick={() => setSettingsView('board')}>
              <span className="settings-row-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="1" />
                  <path d="M3 12h18M12 3v18" />
                </svg>
                Board theme
              </span>
              <span className="settings-row-end">
                <span className="settings-row-hint">
                  {boardThemeById(boardLight).label} · {boardThemeById(boardDark).label}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
              </span>
            </button>
            <Link
              href="/about"
              className="settings-row settings-link"
              onClick={() => {
                if (typeof window !== 'undefined') sessionStorage.setItem('mb.reopenSettings', '1');
              }}
            >
              <span className="settings-row-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                About My Blunders
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            </Link>
          </div>
          <div className="settings-import">
            <ImportBar importer={importer} onClearAll={onClearAll} />
          </div>
            </>
          )}
        </div>
      )}

      <div className={'body-row' + (sideOpen ? '' : ' side-closed')}>
        {children}
        {sideOpen && <div className="scrim" onClick={closeOnMobile} />}
      </div>

      <BoardControls onMenu={() => setSideOpen((o) => !o)} sideOpen={sideOpen} />
    </div>
    </BoardExtrasProvider>
    </BoardSlotProvider>
    </BoardNavProvider>
  );
}

/**
 * The board-control bracket: Lichess-style move navigation (first / prev / next
 * / last) on the left, the menu (☰) toggle on the right. The arrows drive
 * whichever board is active via the board-nav context and are disabled on
 * screens with no move history. It renders *into the active board's slot*
 * (right under the board) via a portal; on a board-less screen (Opening) the
 * slot is absent and it falls back to a bar pinned at the app-root bottom.
 */
function BoardControls({ onMenu, sideOpen }: { onMenu: () => void; sideOpen: boolean }) {
  const nav = useBoardNav();
  const slotEl = useBoardSlot();
  const topEl = useBoardTopSlot();
  const extras = useBoardExtras();
  // Show the move arrows where a board registered navigation (a solved puzzle,
  // a Play game, a famous-game replay). A mode may also inject its own buttons
  // (the coordinate-trainer switcher) via `extras`. With neither, the bracket
  // collapses to just the menu button.
  const hasNav = typeof nav.first === 'function';
  const chevron = (pts: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {pts.split('|').map((p, i) => <polyline key={i} points={p} />)}
    </svg>
  );
  const menuBtn = (
    <button
      type="button"
      className={'bc-menu' + (sideOpen ? ' on' : '')}
      onClick={onMenu}
      aria-label={sideOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={sideOpen}
    >
      {sideOpen ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      )}
    </button>
  );
  const arrows = (
    <div className="bc-nav">
      <button type="button" className="bc-btn" onClick={nav.first} disabled={!nav.canPrev} aria-label="First move">{chevron('11 17 6 12 11 7|18 17 13 12 18 7')}</button>
      <button type="button" className="bc-btn" onClick={nav.prev} disabled={!nav.canPrev} aria-label="Previous move">{chevron('15 18 9 12 15 6')}</button>
      <button type="button" className="bc-btn" onClick={nav.next} disabled={!nav.canNext} aria-label="Next move">{chevron('9 18 15 12 9 6')}</button>
      <button type="button" className="bc-btn" onClick={nav.last} disabled={!nav.canNext} aria-label="Last move">{chevron('13 17 18 12 13 7|6 17 11 12 6 7')}</button>
    </div>
  );
  // The menu (three-dash) always lives in the top header bracket — alongside the
  // coordinate-trainer mode switcher (`extras`) when present. The move arrows —
  // a solved puzzle, a Play game, a famous-game replay — sit in their own bracket
  // *under* the board. Each is portaled into the slot the active mode renders.
  const topBar = (
    <div className={'board-controls' + (extras ? '' : ' menu-only')}>
      {extras}
      {menuBtn}
    </div>
  );
  const arrowBar = hasNav ? <div className="board-controls">{arrows}</div> : null;
  return (
    <>
      {topEl ? createPortal(topBar, topEl) : <div className="board-controls is-bottom menu-only">{menuBtn}</div>}
      {arrowBar && slotEl ? createPortal(arrowBar, slotEl) : arrowBar}
    </>
  );
}
