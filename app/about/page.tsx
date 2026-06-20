import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';

export const metadata: Metadata = {
  title: 'About · My Blunders',
  description: 'What my-blunders is and who built it.',
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
              <strong>my·blunders</strong> turns your real Lichess mistakes into chess puzzles.
              It pulls your recent games, finds the moves where your position actually slipped,
              and asks you to find what you should have played instead — so you practice the
              positions you get wrong, not generic puzzles someone else picked.
            </p>
          </div>

          <div className="about-section">
            <div className="about-h">How it works</div>
            <div className="about-steps">
              <div className="about-step">
                <div className="n">1</div>
                <div>
                  <h4>Connect</h4>
                  <p>Enter your Lichess username — we fetch your recent public games.</p>
                </div>
              </div>
              <div className="about-step">
                <div className="n">2</div>
                <div>
                  <h4>Analyze</h4>
                  <p>
                    Stockfish reviews each move to find the blunders. On the web that runs right
                    in your browser, so your games never need a server to be analyzed.
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
            Game data from <a className="about-link" href="https://lichess.org" target="_blank" rel="noopener noreferrer">Lichess</a>.
            Analysis by the <a className="about-link" href="https://stockfishchess.org" target="_blank" rel="noopener noreferrer">Stockfish</a> engine,
            used under the GPL-3.0 license.
          </div>
        </div>
      </div>
    </div>
  );
}
