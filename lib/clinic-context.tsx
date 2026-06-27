'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadOpeningGames,
  loadUsername,
  loadSource,
  loadOpeningFetchState,
  openingFetchKey,
} from './storage';
import { importOpeningGames, OPENING_TARGET_GAMES } from './opening-import';
import { ensureOpeningBook } from './opening-book';
import {
  buildOpeningTree,
  namedOpenings,
  type OpeningGame,
  type OpeningEntry,
  type TreeNode,
} from './opening-tree';


interface ClinicValue {
  ready: boolean;
  fetching: boolean;
  color: 'w' | 'b';
  setColor: (c: 'w' | 'b') => void;
  /** Path id of the opening to focus the tree on, or null for the whole tree. */
  focus: string | null;
  setFocus: (id: string | null) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  tree: TreeNode;
  openings: OpeningEntry[];
}

const Ctx = createContext<ClinicValue | null>(null);

export function useClinic(): ClinicValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useClinic must be used within <ClinicProvider>');
  return v;
}

/**
 * Owns the Opening Clinic's shared state so the left-panel opening filter and
 * the tree/detail view stay in sync: the imported games, the chosen colour, the
 * focused opening, and the selected node. Also runs the one-time ~150-game
 * background fetch the first time a user opens the clinic.
 */
export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = useState<OpeningGame[]>([]);
  const [username, setUsername] = useState('');
  const [color, setColorState] = useState<'w' | 'b'>('w');
  const [focus, setFocus] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [bookReady, setBookReady] = useState(false);
  const fetchStarted = useRef(false);

  useEffect(() => {
    const g = loadOpeningGames();
    setGames(g);
    setUsername(loadUsername());
    const whites = g.filter((x) => x.color === 'w').length;
    setColorState(g.length - whites > whites ? 'b' : 'w');
    setReady(true);
  }, []);

  // Load the position-keyed opening-name book (its own lazy chunk), then rebuild
  // the tree so every node picks up its accurate name.
  useEffect(() => {
    let cancelled = false;
    ensureOpeningBook().then(() => { if (!cancelled) setBookReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!username || fetchStarted.current) return;
    const source = loadSource();
    // Build whenever the corpus is below target and history isn't exhausted —
    // gating on the actual size (not a sticky flag) means a cleared or
    // never-built corpus always rebuilds, while a full one is left alone.
    if (loadOpeningGames().length >= OPENING_TARGET_GAMES) return;
    const state = loadOpeningFetchState();
    if (state && state.key === openingFetchKey(source, username) && state.exhausted) return;
    fetchStarted.current = true;
    setFetching(true);
    // Grow the tree live: re-read the store after each page lands.
    importOpeningGames(username, source, () => setGames(loadOpeningGames()))
      .then(() => setGames(loadOpeningGames()))
      .finally(() => setFetching(false));
  }, [username]);

  // bookReady is a dep so names fill in once the book chunk loads.
  const tree = useMemo(() => buildOpeningTree(games, color), [games, color, bookReady]);
  const openings = useMemo(() => namedOpenings(tree), [tree]);

  const setColor = (c: 'w' | 'b') => {
    setColorState(c);
    setFocus(null);
    setSelectedId(null);
  };

  const value: ClinicValue = {
    ready, fetching, color, setColor, focus, setFocus, selectedId, setSelectedId, tree, openings,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
