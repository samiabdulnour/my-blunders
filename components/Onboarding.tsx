'use client';

import { useEffect, useRef, useState } from 'react';
import type { Puzzle } from '@/lib/types';
import { useImporter } from '@/lib/useImporter';

interface OnboardingProps {
  /** Feed imported puzzles into the app as they arrive. */
  onImport: (newPuzzles: Puzzle[]) => void;
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
export function Onboarding({ onImport, onComplete }: OnboardingProps) {
  // autoImport off: the import here is driven explicitly by the CTA, not by
  // the queue-drain loop (there's no queue on screen yet).
  const { username, setUsername, status, runImport, importFile } = useImporter({
    onImport,
    unseenCount: 0,
    autoImport: false,
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  // Advance the step machine off the shared import status. Kept separate
  // from the completion timer below: if we scheduled onComplete here, the
  // setPhase('done') re-render would change this effect's deps and run its
  // cleanup — cancelling the timeout before it ever fired (the app would
  // hang on the "All set" screen).
  useEffect(() => {
    if (phase !== 'running') return;
    if (status.kind === 'ok') setPhase('done');
    else if (status.kind === 'error') setPhase('error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.kind, phase]);

  // Once import has finished, briefly show the success state, then hand off
  // to the main app. This effect owns the timer so it survives the phase
  // transition that triggers it.
  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => onComplete(username.trim()), 700);
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

  const progress = status.progress;
  const pct =
    phase === 'done'
      ? 100
      : progress && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : phase === 'running'
          ? 5
          : 0;

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
          We&apos;ll pull your recent Lichess games, run Stockfish on each move, and turn your
          mistakes into puzzles.
        </div>
      </div>

      <div className="onb-steps">
        <div className={stepClass(1)}>
          <div className="n">1</div>
          <div>
            <h4>Your Lichess username</h4>
            <p>We use it to fetch your public game history.</p>
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
          <input
            className="onb-input"
            placeholder="e.g. magnuscarlsen"
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
          <div className="onb-alt">
            already have a PGN?{' '}
            <a onClick={() => fileRef.current?.click()}>upload file</a>
            &nbsp;·&nbsp;
            <a onClick={() => onComplete('')}>skip for now</a>
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
          <div className="progress-track">
            <div className="progress-fill" style={{ width: pct + '%' }} />
          </div>
          <div className="progress-text">
            <span>{status.message ?? 'Connecting to Lichess…'}</span>
            <span>{pct}%</span>
          </div>
          {phase === 'error' ? (
            <div className="onb-alt">
              <a onClick={() => onComplete(username.trim())}>continue anyway →</a>
            </div>
          ) : (
            <div className="progress-note">analysis runs on the server — hang tight</div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="onb-done">✓ All set. Loading your first puzzle…</div>
      )}
    </div>
  );
}
