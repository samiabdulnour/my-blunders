'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Importer } from '@/lib/useImporter';
import { useImportStatus } from '@/lib/import-status';
import { BoardThemePicker } from '@/components/BoardThemePicker';
import type { BoardThemeId } from '@/lib/board-theme';

interface OnboardingProps {
  /** The page-level importer. Shared with the settings panel so the batch
   *  started here keeps its cursor + "working" state after this screen hands
   *  off (a private instance died with the screen, stranding auto-import). */
  importer: Importer;
  /** How many of the user's own puzzles the app holds. Growth during an import
   *  means the first real puzzle is ready — the cue to hand off. */
  ownPuzzleCount: number;
  /** Called once onboarding is finished (with the username, or '' if skipped).
   *  `showFamous` asks the app to show the famous-blunder library to play while
   *  a real import is still streaming in (or as the guest fallback). */
  onComplete: (username: string, opts?: { showFamous?: boolean }) => void;
  /** Board theme choice for the "choose your board" step, applied live. */
  boardLight: BoardThemeId;
  boardDark: BoardThemeId;
  onSetBoard: (mode: 'light' | 'dark', id: BoardThemeId) => void;
}

type Phase = 'idle' | 'board' | 'running' | 'done' | 'error';

/**
 * First-run screen: captures the user's Lichess username and kicks off a real
 * import (the same pipeline the sidebar uses — no simulated progress). A
 * three-step checklist tracks idle → importing → solve, and the progress bar
 * reflects live analysis status. Users can also upload a PGN or skip straight
 * into the app.
 */
export function Onboarding({
  importer,
  ownPuzzleCount,
  onComplete,
  boardLight,
  boardDark,
  onSetBoard,
}: OnboardingProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  // Which action the "choose your board" step continues into: a real import or
  // the guest famous-library entry.
  const [pending, setPending] = useState<'import' | 'famous'>('import');
  const fileRef = useRef<HTMLInputElement>(null);
  // Hand off to the app exactly once — whether that's triggered by the first
  // puzzle, the batch finishing with none, or a skip link.
  const enteredRef = useRef(false);
  // Own-puzzle count when the import started, so the hand-off keys on puzzles
  // *this* import produced rather than anything already in the store.
  const baselineRef = useRef(0);

  // Always enter with the famous library available: real puzzles replace it as
  // they stream in, and the app's own guard keeps famous from clobbering real
  // puzzles once they exist. So nobody ever lands on an empty board.
  const enterApp = useCallback(
    (name: string) => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      onComplete(name, { showFamous: true });
    },
    [onComplete]
  );

  const { username, setUsername, source, setSource, runImport, importFile } = importer;
  const status = useImportStatus();

  // Hand off the moment the first real puzzle is ready, landing the user
  // straight on one of their own blunders. Until then they wait on the progress
  // screen — or tap "play famous blunders while this loads" to start solving the
  // famous library immediately while the rest analyses behind them. (The page
  // keeps the auto-import loop off until onboarding completes: the import here
  // is driven by the CTA.)
  useEffect(() => {
    if (phase !== 'running') return;
    if (ownPuzzleCount > baselineRef.current) enterApp(username.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownPuzzleCount, phase]);

  // Fetching-window progress: a real bar that fills as the engine works through
  // the current game's moves; falls back to an indeterminate sweep before the
  // first move-level update arrives (e.g. Lichess games that ship evals).
  const moveProg = status.moveProgress;
  const pct = moveProg && moveProg.total > 0 ? Math.round((moveProg.done / moveProg.total) * 100) : 0;

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

  // Entering a name (or choosing the guest path) lands on the "choose your
  // board" step first; the import / famous entry runs when you continue.
  const start = () => {
    if (!username.trim()) return;
    setPending('import');
    setPhase('board');
  };
  const proceedFromBoard = () => {
    if (pending === 'famous') {
      enterApp('');
      return;
    }
    baselineRef.current = ownPuzzleCount;
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
    baselineRef.current = ownPuzzleCount;
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
        <div className="onb-eyebrow">My Blunders</div>
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
            onClick={() => {
              setPending('famous');
              setPhase('board');
            }}
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

      {phase === 'board' && (
        <div className="onb-board">
          <div className="onb-board-h">Choose your chessboard</div>
          <div className="onb-board-sub">
            Pick a look for light and dark mode. You can change this any time in Settings.
          </div>
          <BoardThemePicker boardLight={boardLight} boardDark={boardDark} onSet={onSetBoard} />
          <button className="onb-go" onClick={proceedFromBoard}>
            {pending === 'famous' ? '♟ Play famous blunders →' : 'Continue →'}
          </button>
          <div className="onb-alt">
            <a onClick={() => setPhase('idle')}>← back</a>
          </div>
        </div>
      )}

      {(phase === 'running' || phase === 'error') && (
        <div className="onb-running">
          {phase !== 'error' && (
            <div className="progress-track">
              {moveProg ? (
                <div className="progress-fill" style={{ width: pct + '%' }} />
              ) : (
                <div className="progress-fill indeterminate" />
              )}
            </div>
          )}
          <div className={'progress-text' + (phase === 'error' || !moveProg ? ' solo' : '')}>
            <span>{phase === 'error' ? status.message ?? 'Import failed' : 'Finding your first blunder…'}</span>
            {phase !== 'error' && moveProg && <span>{pct}%</span>}
          </div>
          {phase === 'error' ? (
            <>
              {/* A bad username is the common case — let them go straight back to
                  the form (the entered name is kept, ready to fix). */}
              <button className="onb-go" onClick={() => setPhase('idle')}>
                ← Try a different name
              </button>
              <div className="onb-alt">
                <a onClick={() => enterApp(username.trim())}>continue anyway →</a>
              </div>
            </>
          ) : (
            <>
              {/* Live detail so it's clear work is happening, plus the working
                  "play while it loads" escape into the famous library. */}
              <div className="progress-note">{status.message ?? 'Looking through your recent games…'}</div>
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
        <Link href="/about">about My Blunders →</Link>
      </div>
    </div>
  );
}
