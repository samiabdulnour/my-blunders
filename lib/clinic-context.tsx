'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadOpeningGames, loadUsername, loadSource } from './storage';
import { importOpeningGames } from './opening-import';
import {
  buildOpeningTree,
  namedOpenings,
  type OpeningGame,
  type OpeningEntry,
  type TreeNode,
} from './opening-tree';

const FETCHED_KEY = 'bt.openingFetchedUser';
// Bump when the summary shape changes so users re-pull. 'e1' = added per-ply evals.
// Keyed by source too, so switching Lichess ↔ chess.com re-pulls.
const FETCH_TAG = (u: string, src: string) => `${src}:${u}:e1`;

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
  const fetchStarted = useRef(false);

  useEffect(() => {
    const g = loadOpeningGames();
    setGames(g);
    setUsername(loadUsername());
    const whites = g.filter((x) => x.color === 'w').length;
    setColorState(g.length - whites > whites ? 'b' : 'w');
    setReady(true);
  }, []);

  useEffect(() => {
    if (!username || fetchStarted.current) return;
    const source = loadSource();
    if (typeof window !== 'undefined' && window.localStorage.getItem(FETCHED_KEY) === FETCH_TAG(username, source)) return;
    fetchStarted.current = true;
    setFetching(true);
    importOpeningGames(username, source)
      .then(() => {
        setGames(loadOpeningGames());
        try {
          window.localStorage.setItem(FETCHED_KEY, FETCH_TAG(username, source));
        } catch {
          /* ignore quota */
        }
      })
      .finally(() => setFetching(false));
  }, [username]);

  const tree = useMemo(() => buildOpeningTree(games, color), [games, color]);
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
