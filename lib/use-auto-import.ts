'use client';

import { useSyncExternalStore } from 'react';
import { loadAutoImport, saveAutoImport } from './storage';

/**
 * Tiny shared store for the auto-import preference.
 *
 * The toggle now lives as a button in the top bar (AppShell) while the import
 * behaviour lives in `useImporter` (mounted deep in the sidebar). Rather than
 * drill the value/​setter through every component between them, both subscribe
 * to this module-level store, so a flip from the top bar is seen instantly by
 * the importer and vice-versa. Persisted via storage.
 */
let value: boolean | null = null; // null = not yet read from storage
const listeners = new Set<() => void>();

function snapshot(): boolean {
  if (value === null) value = loadAutoImport();
  return value;
}

// SSR / first paint: the app is prerendered "on" (the common case); the client
// reconciles to the stored value on hydrate, like the theme/onboarded prefs.
function serverSnapshot(): boolean {
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Set the preference (persisted) and notify all subscribers. */
export function setAutoImport(on: boolean): void {
  value = on;
  saveAutoImport(on);
  listeners.forEach((l) => l());
}

/** Reactive read of the auto-import preference. */
export function useAutoImport(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
