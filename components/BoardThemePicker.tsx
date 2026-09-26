'use client';

import { BOARD_THEMES, boardThemeById, type BoardThemeId } from '@/lib/board-theme';

interface BoardThemePickerProps {
  boardLight: BoardThemeId;
  boardDark: BoardThemeId;
  onSet: (mode: 'light' | 'dark', id: BoardThemeId) => void;
}

/** A 2×2 checker swatch of one theme — the same shape as the reference chips. */
function Swatch({
  id,
  selected,
  onClick,
}: {
  id: BoardThemeId;
  selected: boolean;
  onClick: () => void;
}) {
  const t = boardThemeById(id);
  return (
    <button
      type="button"
      className={'board-swatch' + (selected ? ' sel' : '')}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="board-swatch-grid" aria-hidden="true">
        <span style={{ background: t.sqD }} />
        <span style={{ background: t.sqL }} />
        <span style={{ background: t.sqL }} />
        <span style={{ background: t.sqD }} />
      </span>
      <span className="board-swatch-label">{t.label}</span>
    </button>
  );
}

/**
 * Picks the board colour theme for light and dark app-mode independently. The
 * swatch for the *currently active* mode recolours the board live; the other
 * mode's choice takes effect when the app is next in that mode. Reused by the
 * settings sheet and the onboarding "choose your board" step.
 */
export function BoardThemePicker({ boardLight, boardDark, onSet }: BoardThemePickerProps) {
  return (
    <div className="board-picker">
      <div className="board-picker-group">
        <div className="board-picker-mode">Light mode</div>
        <div className="board-picker-row">
          {BOARD_THEMES.map((t) => (
            <Swatch
              key={t.id}
              id={t.id}
              selected={boardLight === t.id}
              onClick={() => onSet('light', t.id)}
            />
          ))}
        </div>
      </div>
      <div className="board-picker-group">
        <div className="board-picker-mode">Dark mode</div>
        <div className="board-picker-row">
          {BOARD_THEMES.map((t) => (
            <Swatch
              key={t.id}
              id={t.id}
              selected={boardDark === t.id}
              onClick={() => onSet('dark', t.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
