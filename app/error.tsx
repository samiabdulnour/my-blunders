'use client';

import { useEffect } from 'react';

/**
 * App-wide error boundary. Without one, any uncaught throw during render (e.g. a
 * corrupted localStorage value the read guards somehow miss, or a future bug)
 * unmounts the whole tree into a blank white page with no way out. This degrades
 * that to a recoverable screen — "Try again" re-renders, and "Reset app data"
 * clears local storage so a poisoned value can't keep re-bricking the app.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('App error boundary caught:', error);
  }, [error]);

  const resetData = () => {
    try {
      // Only our own keys, so we don't stomp on anything else on the origin.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('bt.'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.location.href = '/';
  };

  return (
    <div className="err-page">
      <div className="err-card">
        <div className="err-eyebrow">my·blunders</div>
        <h1 className="err-title">Something went wrong.</h1>
        <p className="err-sub">
          The app hit an unexpected error. Try again — if it keeps happening, resetting your local
          data usually fixes it (your games re-import from Lichess or Chess.com).
        </p>
        <div className="err-actions">
          <button type="button" className="err-btn primary" onClick={() => reset()}>
            Try again
          </button>
          <button type="button" className="err-btn" onClick={resetData}>
            Reset app data
          </button>
        </div>
      </div>
    </div>
  );
}
