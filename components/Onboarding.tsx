'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Puzzle } from '@/lib/types';
import { useImporter } from '@/lib/useImporter';

interface OnboardingProps {
  /** Feed imported puzzles into the app as they arrive. */
  onImport: (newPuzzles: Puzzle[]) => void;
  /** Fired when the user's own games have been fetched (before analysis), so
   *  the app can drop the famous-blunder placeholders right away. */
  onGamesFetched?: () => void;
  /** Called once onboarding is finished (with the username, or '' if skipped). */
  onComplete: (username: string) => void;
}

type Phase = 'idle' | 'running' | 'done' | 'error';

/**
 * First-run screen: captures the user's Lichess username and kicks off a real
 * import (the same pipeline the sidebar uses — no simulated progress). A
 * three-step checklist tracks idle → importing → solve, and the progress bar
 * reflects live analysis status. Users can also upload a PGN or skip straight
 * into the app.
 */
export function Onboarding({ onImport, onGamesFetched, onComplete }: OnboardingProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  // Hand off to the app exactly once — whether that's triggered by the first
  // puzzle, the batch finishing with none, or a skip link.
  const enteredRef = useRef(false);
  // Latest username, read inside the import callback (which is created before
  // useImporter returns `username`).
  const usernameRef = useRef('');

  const enterApp = useCallback(
    (name: string) => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      onComplete(name);
    },
    [onComplete]
  );

  // Don't strand the new user on this screen while the *whole* batch analyses —
  // on a phone that's minutes of WASM Stockfish. The instant the first real
  // puzzle is ready, hand off to the app; the rest of the batch keeps streaming
  // in behind it via this same callback. (autoImport off: the import is driven
  // by the CTA, not the queue-drain loop — there's no queue on screen yet.)
  const handleImport = useCallback(
    (puzzles: Puzzle[]) => {
      onImport(puzzles);
      if (puzzles.length > 0) enterApp(usernameRef.current.trim());
    },
    [onImport, enterApp]
  );

  const { username, setUsername, source, setSource, status, runImport, importFile } = useImporter({
    onImport: handleImport,
    onGamesFetched,
    unseenCount: 0,
    autoImport: false,
  });
  usernameRef.current = username;

  // Drive the step checklist off the import status. A finished batch (even one
  // that yielded no puzzles) or an error still resolves here so nobody is stuck.
  useEffect(() => {
    if (phase !== 'running') return;
    if (status.kind === 'ok') setPhase('done');
    else if (status.kind === 'error') setPhase('error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.kind, phase]);

  // Fallback hand-off: the batch finished without ever producing a puzzle (a
  // rare run of clean games). Briefly show the success state, then enter. If a
  // puzzle already took us in, enteredRef makes this a no-op.
  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => enterApp(username.trim()), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = () => {
    if (!username.trim()) return;
    setPhase('running');
    runImport();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!username.trim()) {
      // Let the importer surface "enter your username" without flipping phase.
      await importFile(file);
      return;
    }
    setPhase('running');
    await importFile(file);
  };

  const stepClass = (n: number) => {
    if (n === 1) return 'onb-step ' + (phase === 'idle' ? 'active' : 'done');
    if (n === 2)
      return (
        'onb-step ' +
        (phase === 'running' || phase === 'error' ? 'active' : phase === 'done' ? 'done' : '')
      );
    return 'onb-step ' + (phase === 'done' ? 'active' : '');
  };

  return (
    <div className="onboarding">
      <div className="onb-hero">
        <div className="onb-eyebrow">my·blunders</div>
        <div className="onb-title">
          Train on <em>your own</em> blunders.
        </div>
        <div className="onb-sub">
          We&apos;ll pull your recent Lichess or chess.com games, run Stockfish on each move, and
          turn your mistakes into puzzles.
        </div>
      </div>

      <div className="onb-steps">
        <div className={stepClass(1)}>
          <div className="n">1</div>
          <div>
            <h4>Your username</h4>
            <p>Lichess or chess.com — we fetch your public game history.</p>
          </div>
        </div>
        <div className={stepClass(2)}>
          <div className="n">2</div>
          <div>
            <h4>Import &amp; analyze</h4>
            <p>Stockfish scores every move to find the blunders.</p>
          </div>
        </div>
        <div className={stepClass(3)}>
          <div className="n">3</div>
          <div>
            <h4>Solve your blunders</h4>
            <p>One position per mistake, sorted by severity.</p>
          </div>
        </div>
      </div>

      {phase === 'idle' && (
        <div className="onb-form">
          <div className="seg-tabs src-seg" role="tablist" aria-label="Import source">
            <button
              type="button"
              role="tab"
              aria-selected={source === 'lichess'}
              className={'seg-tab' + (source === 'lichess' ? ' on' : '')}
              onClick={() => setSource('lichess')}
            >
              Lichess
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'chesscom'}
              className={'seg-tab' + (source === 'chesscom' ? ' on' : '')}
              onClick={() => setSource('chesscom')}
            >
              Chess.com
            </button>
          </div>
          <input
            className="onb-input"
            placeholder={source === 'chesscom' ? 'e.g. hikaru' : 'e.g. magnuscarlsen'}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            spellCheck={false}
            autoCapitalize="none"
            autoFocus
          />
          <button className="onb-go" onClick={start} disabled={!username.trim()}>
            Start importing →
          </button>
          <div className="onb-or">or</div>
          <button
            type="button"
            className="onb-famous"
            onClick={() => enterApp('')}
          >
            ♟ Play famous blunders
            <span className="sub">no account needed</span>
          </button>
          <div className="onb-alt">
            already have a PGN?{' '}
            <a onClick={() => fileRef.current?.click()}>upload file</a>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pgn,text/plain"
            style={{ display: 'none' }}
            onChange={onFile}
          />
        </div>
      )}

      {(phase === 'running' || phase === 'error') && (
        <div className="onb-running">
          {phase !== 'error' && (
            <div className="progress-track">
              <div className="progress-fill indeterminate" />
            </div>
          )}
          <div className="progress-text solo">
            <span>{phase === 'error' ? status.message ?? 'Import failed' : 'Finding your first blunder…'}</span>
          </div>
          {phase === 'error' ? (
            <div className="onb-alt">
              <a onClick={() => enterApp(username.trim())}>continue anyway →</a>
            </div>
          ) : (
            <>
              <div className="progress-note">analysing your recent games — opens as soon as your first puzzle is ready</div>
              <div className="onb-alt">
                <a onClick={() => enterApp(username.trim())}>
                  play famous blunders while this loads →
                </a>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="onb-done">✓ All set. Loading your first puzzle…</div>
      )}

      <div className="onb-alt">
        <Link href="/about">about my·blunders →</Link>
      </div>
    </div>
  );
}
