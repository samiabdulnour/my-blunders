'use client';

import { useSyncExternalStore } from 'react';

export interface ImportStatus {
  kind: 'idle' | 'working' | 'ok' | 'error';
  message?: string;
  /** Current/total game count for the progress bar, when known. */
  progress?: { current: number; total: number };
  /** Move-level analysis progress within the current game (engine-scanned
   *  games only), so a fetching screen can show a bar that actually fills. */
  moveProgress?: { done: number; total: number };
}

/**
 * Live import status, kept outside React state on purpose.
 *
 * The importer is created once at the page root (it must outlive the settings
 * panel — see `useImporter`), and it reports progress several times a second.
 * As page state, every one of those ticks would re-render the whole app — board,
 * puzzle list and all — while someone is mid-drag on a phone. As a store, only
 * the components that actually show the status (import bar, onboarding, the
 * empty state) subscribe and re-render. Same pattern as `use-auto-import`.
 */
const IDLE: ImportStatus = { kind: 'idle' };
let current: ImportStatus = IDLE;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replace the status (or derive it from the previous one) and notify. */
export function setImportStatus(next: ImportStatus | ((prev: ImportStatus) => ImportStatus)): void {
  current = typeof next === 'function' ? next(current) : next;
  listeners.forEach((l) => l());
}

/** Reactive read of the live import status. */
export function useImportStatus(): ImportStatus {
  return useSyncExternalStore(subscribe, () => current, () => IDLE);
}
