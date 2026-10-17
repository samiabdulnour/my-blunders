'use client';

import { useEffect, useState } from 'react';
import { APP_STORE_URL } from '@/lib/app-store';
import { isNativeApp } from '@/lib/platform';

/**
 * Whether to advertise the iOS app: on the web only, and not on Android, where
 * an App Store link leads nowhere. Starts false and resolves after mount, so
 * the server render, the static export and the first client render all agree,
 * and the app itself never flashes a link to its own listing.
 */
function useShowAppPromo(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(!isNativeApp() && !/android/i.test(navigator.userAgent));
  }, []);
  return show;
}

/** First-run card: the app icon, a line of pitch, and an App Store button. */
export function AppStoreCard() {
  const show = useShowAppPromo();
  if (!show) return null;
  return (
    <a className="app-promo" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
      <img className="app-promo-icon" src="/icons/icon-192.png" alt="" width={40} height={40} />
      <span className="app-promo-text">
        <span className="app-promo-title">My Blunders for iPhone and iPad</span>
        <span className="app-promo-sub">Free on the App Store.</span>
      </span>
      <span className="btn app-promo-cta">Get the app</span>
    </a>
  );
}

/** Topbar button beside Settings (in the hamburger drawer's strip on phones). */
export function AppStoreTopLink() {
  const show = useShowAppPromo();
  if (!show) return null;
  return (
    <a
      className="icon-btn"
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="My Blunders on the App Store"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
      <span>Get the app</span>
    </a>
  );
}
