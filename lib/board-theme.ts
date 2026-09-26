/**
 * Board colour themes. Each theme is a flat pair of square colours (plus the
 * last-move highlight tint over each) shown as-is on the board — what you see in
 * the picker swatch is exactly what the board becomes. The user chooses one
 * theme for light app-mode and one for dark app-mode; `app/page.tsx` writes the
 * *active* theme's four CSS variables onto <html>, so every board in the app
 * (the trainer, Play, the opening mini-boards and the replay popup) recolours at
 * once — they all read `--sq-l` / `--sq-d` / `--lm-l` / `--lm-d`.
 */
export type BoardThemeId = 'green' | 'wood' | 'walnut';

export interface BoardTheme {
  id: BoardThemeId;
  label: string;
  /** Light square, dark square. */
  sqL: string;
  sqD: string;
  /** Last-move highlight tint over the light and the dark square. */
  lmL: string;
  lmD: string;
}

export const BOARD_THEMES: readonly BoardTheme[] = [
  { id: 'green', label: 'Green', sqL: '#f8f7f5', sqD: '#8fae86', lmL: '#e8e08a', lmD: '#d2c45f' },
  { id: 'wood', label: 'Wood', sqL: '#ece2cc', sqD: '#a89a75', lmL: '#e7d78a', lmD: '#c4ab5b' },
  { id: 'walnut', label: 'Walnut', sqL: '#ada492', sqD: '#575349', lmL: '#b8aa6b', lmD: '#6f6740' },
];

/** Light mode keeps the original green board; dark mode defaults to the dark
 *  "walnut" board. Both are user-overridable and persisted. */
export const DEFAULT_BOARD_LIGHT: BoardThemeId = 'green';
export const DEFAULT_BOARD_DARK: BoardThemeId = 'walnut';

export function boardThemeById(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

export function isBoardThemeId(v: unknown): v is BoardThemeId {
  return typeof v === 'string' && BOARD_THEMES.some((t) => t.id === v);
}
