'use client';

/**
 * Board move-navigation, shared between the mode that owns the board (Puzzle,
 * Play, Coordinates replay) and the persistent control bar that renders the
 * first/prev/next/last buttons. The mode registers handlers via
 * `useRegisterBoardNav`; the bar reads them via `useBoardNav`. When no mode has
 * registered (or a move-less screen), the arrows are simply disabled.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface BoardNav {
  first?: () => void;
  prev?: () => void;
  next?: () => void;
  last?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}

const BoardNavCtx = createContext<{ nav: BoardNav; setNav: (n: BoardNav) => void }>({
  nav: {},
  setNav: () => {},
});

export function BoardNavProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<BoardNav>({});
  return <BoardNavCtx.Provider value={{ nav, setNav }}>{children}</BoardNavCtx.Provider>;
}

/** Read the current nav handlers (for the control bar). */
export function useBoardNav(): BoardNav {
  return useContext(BoardNavCtx).nav;
}

/**
 * Register nav handlers for the active board. `deps` should list the primitive
 * state the handlers close over (current ply, total, enabled) so the bar
 * updates as you step. Clears on unmount so a mode without a board leaves the
 * arrows disabled.
 */
export function useRegisterBoardNav(nav: BoardNav, deps: unknown[]) {
  const { setNav } = useContext(BoardNavCtx);
  useEffect(() => {
    setNav(nav);
    return () => setNav({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNav, ...deps]);
}

/* ── Board-controls portal slot ──────────────────────────────────────────
 * The control bar lives in AppShell (which owns the menu-drawer state) but is
 * meant to sit *directly under the board* — and the board is inside whichever
 * mode is active. So each board-bearing mode drops a `<BoardControlsSlot/>`
 * right under its board and AppShell portals the bar into it. A mode with no
 * board (Opening) renders no slot, and the bar falls back to the app-root
 * bottom. The slot registers itself via a callback ref, so it tracks the board
 * mounting/unmounting (even async) rather than a brittle id lookup. */
const BoardSlotCtx = createContext<{
  slotEl: HTMLElement | null;
  setSlotEl: (el: HTMLElement | null) => void;
  topEl: HTMLElement | null;
  setTopEl: (el: HTMLElement | null) => void;
}>({ slotEl: null, setSlotEl: () => {}, topEl: null, setTopEl: () => {} });

export function BoardSlotProvider({ children }: { children: ReactNode }) {
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const [topEl, setTopEl] = useState<HTMLElement | null>(null);
  return (
    <BoardSlotCtx.Provider value={{ slotEl, setSlotEl, topEl, setTopEl }}>
      {children}
    </BoardSlotCtx.Provider>
  );
}

/** Read the under-board slot element (for AppShell's control bar to portal into). */
export function useBoardSlot(): HTMLElement | null {
  return useContext(BoardSlotCtx).slotEl;
}

/** Read the above-board slot element (for a mode switcher pinned over the board). */
export function useBoardTopSlot(): HTMLElement | null {
  return useContext(BoardSlotCtx).topEl;
}

/** Placeholder a board-bearing mode renders right under its board; the shared
 *  control bar portals itself here. */
export function BoardControlsSlot() {
  const { setSlotEl } = useContext(BoardSlotCtx);
  return <div className="bc-slot" ref={setSlotEl} />;
}

/** Placeholder a mode renders in its top header bracket; the menu (and, in the
 *  coordinate trainer, the mode switcher) portals here. `className` lets a mode
 *  size the slot — e.g. the coord switcher header stretches to board height. */
export function BoardTopSlot({ className }: { className?: string }) {
  const { setTopEl } = useContext(BoardSlotCtx);
  return <div className={'bc-top-slot' + (className ? ' ' + className : '')} ref={setTopEl} />;
}

/* ── Control-bar extras ──────────────────────────────────────────────────
 * A mode can inject extra buttons into the control bracket — e.g. the
 * coordinate trainer's Find / Colour / Games switcher — rendered to the left
 * of the arrows. */
const BoardExtrasCtx = createContext<{
  extras: ReactNode;
  setExtras: (n: ReactNode) => void;
}>({ extras: null, setExtras: () => {} });

export function BoardExtrasProvider({ children }: { children: ReactNode }) {
  const [extras, setExtras] = useState<ReactNode>(null);
  return <BoardExtrasCtx.Provider value={{ extras, setExtras }}>{children}</BoardExtrasCtx.Provider>;
}

/** Read the injected control-bar extras (for the control bar to render). */
export function useBoardExtras(): ReactNode {
  return useContext(BoardExtrasCtx).extras;
}

/** Inject extra control-bar buttons for the active mode. `deps` should list
 *  the state the buttons close over (e.g. the active sub-mode). */
export function useRegisterBoardExtras(node: ReactNode, deps: unknown[]) {
  const { setExtras } = useContext(BoardExtrasCtx);
  useEffect(() => {
    setExtras(node);
    return () => setExtras(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setExtras, ...deps]);
}
