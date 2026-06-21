/**
 * Lucide-style stroke icons + the myblunders brand mark for the Repertoire
 * X-ray, ported from the design handoff. Kept local to the feature so the
 * X-ray surface owns its own iconography.
 */
import type { ReactNode } from 'react';

function Svg({ children, size = 17, sw = 2 }: { children: ReactNode; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export type NavIconName = 'grid' | 'stack' | 'branch' | 'target' | 'bars';

export function NavIcon({ name, size = 17 }: { name: NavIconName; size?: number }) {
  const m: Record<NavIconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </>
    ),
    stack: (
      <>
        <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" /><polyline points="2 15.5 12 22 22 15.5" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2.4" /><circle cx="6" cy="19" r="2.4" /><circle cx="18" cy="12" r="2.4" />
        <path d="M6 7.4v9.2M8.4 5H13a3 3 0 0 1 3 3v1.8M8.4 19H13a3 3 0 0 0 3-3v-1.4" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
    bars: (
      <>
        <line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="9" />
      </>
    ),
  };
  return <Svg size={size} sw={1.7}>{m[name]}</Svg>;
}

export function IconWarn({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} sw={2.4}>
      <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
  );
}

export function IconArrow({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} sw={2.4}>
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </Svg>
  );
}

export function IconTarget({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} sw={2}>
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** 4×4 mint board with one coral accent square. */
export function BrandMark({ size = 22 }: { size?: number }) {
  const mint = '#7CE3A0';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
      <rect x="0" y="0" width="5" height="5" fill={mint} />
      <rect x="10" y="0" width="5" height="5" fill={mint} />
      <rect x="5" y="5" width="5" height="5" fill={mint} />
      <rect x="15" y="5" width="5" height="5" fill={mint} />
      <rect x="10" y="5" width="5" height="5" fill="#F4342C" />
      <rect x="0" y="10" width="5" height="5" fill={mint} />
      <rect x="10" y="10" width="5" height="5" fill={mint} />
      <rect x="5" y="15" width="5" height="5" fill={mint} />
      <rect x="15" y="15" width="5" height="5" fill={mint} />
    </svg>
  );
}
