'use client';

import { useEffect, useRef, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface FilterChipProps {
  /** The dimension this chip filters, e.g. "Time format". Shown as the
   *  add-affordance label and the popover header. */
  label: string;
  /** Label for the reset/"all" option at the top of the popover. */
  allLabel: string;
  /** Current value; `'all'` means inactive (renders the dashed add-chip). */
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

/**
 * A single filter chip with a click-to-open popover of options. Inactive it
 * renders as a dashed "+ Label" add-affordance; active it fills coral and
 * shows the chosen option with an × to clear. Closes on outside click.
 */
export function FilterChip({ label, allLabel, value, options, onChange }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isActive = value !== 'all';
  const display = isActive ? (options.find((o) => o.value === value)?.label ?? value) : label;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={'chip ' + (isActive ? 'on' : 'add')}
        onClick={() => setOpen((o) => !o)}
      >
        {!isActive && '+ '}
        {display}
        {isActive && (
          <span
            className="x"
            onClick={(e) => {
              e.stopPropagation();
              onChange('all');
            }}
          >
            ×
          </span>
        )}
      </button>
      {open && (
        <div className="filter-popover">
          <div className="filter-popover-h">{label}</div>
          <button
            type="button"
            className={'opt ' + (value === 'all' ? 'on' : '')}
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
          >
            {allLabel}
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={'opt ' + (value === o.value ? 'on' : '')}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
