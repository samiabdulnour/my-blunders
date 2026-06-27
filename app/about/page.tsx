import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';

export const metadata: Metadata = {
  title: 'About · My Blunders',
  description: 'Turn your real Lichess and Chess.com mistakes into training. How my-blunders works, what it does with your data, and who built it.',
};

/**
 * Static "about" page. Server-rendered (no client state) so it pre-renders in
 * both the web build and the Capacitor static export.
 */
export default function AboutPage() {
  return (
    <div className="app-root">
      <div className="topbar">
        <BrandMark />
        <Link href="/" className="about-back" style={{ marginLeft: 'auto' }}>
          ← Trainer
        </Link>
      </div>

      <div className="about-scroll">
        <div className="about-page">
          <div className="about-hero">
            <div className="about-eyebrow">about</div>
            <h1 className="about-title">
              Train on <em>your own</em> blunders.
            </h1>
            <p className="about-lead">
              <strong>my·blunders</strong> turns the games you actually played — on{' '}
              <strong>Lichess</strong> or <strong>Chess.com</strong> — into training built around
              your own mistakes. It pulls your recent games, finds the moves where your position
              really slipped, and asks you to find what you should have played instead, so you
              practise the positions you get wrong rather than generic puzzles someone else picked.
              Around that core sit an opening clinic, a coordinate trainer, and a play-against-the-engine
              mode.
            </p>
          </div>

          <div className="about-section">
            <div className="about-h">How it works</div>
            <div className="about-steps">
              <div className="about-step">
                <div className="n">1</div>
                <div>
                  <h4>Connect</h4>
                  <p>Enter your Lichess or Chess.com username — we fetch your recent public games. No password, no sign-in.</p>
                </div>
              </div>
              <div className="about-step">
                <div className="n">2</div>
                <div>
                  <h4>Analyze</h4>
                  <p>
                    Stockfish reviews each move to find the blunders. On the web that runs right
                    in your browser, so your games are analysed on your own device.
                  </p>
                </div>
              </div>
              <div className="about-step">
                <div className="n">3</div>
                <div>
                  <h4>Solve</h4>
                  <p>One puzzle per mistake, sorted by severity, with your progress tracked across sessions.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="about-section">
            <div className="about-h">Privacy</div>
            <div className="about-notes">
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>Public games only.</strong> You give a username, not a password.
                  my·blunders only reads games you&apos;ve already made public on Lichess or
                  Chess.com — it never signs in as you.
                </p>
              </div>
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>We don&apos;t keep your games.</strong> They&apos;re fetched through a thin
                  relay (browsers can&apos;t call Lichess and Chess.com directly) and handed straight
                  back to you — nothing is stored on our servers. On the web, Stockfish runs in your
                  browser, so the analysis happens on your device too.
                </p>
              </div>
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>Your progress stays with you.</strong> Imported games, puzzles and
                  results are saved only on your device. Clearing your browser data — or the in-app
                  “Clear all” — wipes them for good.
                </p>
              </div>
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>No accounts, no tracking.</strong> Nothing to sign up for, no ads, and no
                  analytics following you around. What you train on is yours.
                </p>
              </div>
            </div>
          </div>

          <div className="about-section">
            <div className="about-h">Author</div>
            <div className="about-author">
              <div className="who">
                Built by <strong>Sami Abdulnour</strong>.
              </div>
              <div className="about-links">
                <a
                  className="about-link"
                  href="https://github.com/samiabdulnour"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/samiabdulnour
                </a>
                <a
                  className="about-link"
                  href="https://github.com/samiabdulnour/my-blunders"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source repository
                </a>
              </div>
            </div>
          </div>

          <div className="about-foot">
            Game data from <a className="about-link" href="https://lichess.org" target="_blank" rel="noopener noreferrer">Lichess</a> and{' '}
            <a className="about-link" href="https://www.chess.com" target="_blank" rel="noopener noreferrer">Chess.com</a>.
            Analysis by the <a className="about-link" href="https://stockfishchess.org" target="_blank" rel="noopener noreferrer">Stockfish</a> engine,
            used under the GPL-3.0 license.
          </div>
        </div>
      </div>
    </div>
  );
}
