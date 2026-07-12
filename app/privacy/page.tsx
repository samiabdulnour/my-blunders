import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';

export const metadata: Metadata = {
  title: 'Privacy Policy · My Blunders',
  description:
    'How my·blunders handles your data: public games only, nothing stored on our servers, no accounts, no tracking.',
};

/**
 * Privacy policy. Static (no client state) so it pre-renders in both the web
 * build and the Capacitor static export — and so it can serve as the privacy
 * policy URL required by App Store Connect.
 *
 * It must stay accurate to what the app actually does: no accounts, public
 * games only, nothing stored server-side, all state on-device, analysis on
 * the user's own device, no analytics/ads/tracking.
 */
export default function PrivacyPage() {
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
            <div className="about-eyebrow">privacy</div>
            <h1 className="about-title">Privacy Policy</h1>
            <p className="about-lead">
              <strong>my·blunders</strong> is built to need as little of your data as possible. There
              are no accounts, nothing about you is stored on our servers, and everything you train
              on stays on your own device. This page explains exactly what that means.
            </p>
            <p className="about-lead" style={{ opacity: 0.7, fontSize: '0.9em' }}>
              Last updated: July 2026.
            </p>
          </div>

          <div className="about-section">
            <div className="about-h">What we access</div>
            <div className="about-notes">
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>Public games only.</strong> You give a Lichess or Chess.com username — never
                  a password. We only read games you have already made public on those sites, and we
                  never sign in as you or act on your behalf.
                </p>
              </div>
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>No account, no personal details.</strong> We don&apos;t ask for your email,
                  name, or any sign-up. A public username is the only thing you provide.
                </p>
              </div>
            </div>
          </div>

          <div className="about-section">
            <div className="about-h">What we store</div>
            <div className="about-notes">
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>Nothing on our servers.</strong> Your games are fetched and handed straight
                  back to you — we keep no copy. On the iOS app, your device talks to Lichess and
                  Chess.com directly, with no server of ours in between. On the web, games pass
                  through a thin stateless relay (browsers can&apos;t call those sites directly) that
                  stores nothing.
                </p>
              </div>
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>Everything stays on your device.</strong> Imported games, generated
                  puzzles, your progress, and your settings are saved only in your browser / the app
                  (local storage). We can&apos;t see them. Clearing your browser data — or using the
                  in-app “Clear all” — deletes them permanently.
                </p>
              </div>
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>Analysis runs on your device.</strong> The Stockfish engine that finds your
                  blunders runs locally (in your browser on the web, in the app on iOS). Your moves
                  are not sent anywhere to be analysed.
                </p>
              </div>
            </div>
          </div>

          <div className="about-section">
            <div className="about-h">Third parties</div>
            <div className="about-notes">
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>Lichess &amp; Chess.com.</strong> To fetch your games we contact{' '}
                  <a className="about-link" href="https://lichess.org" target="_blank" rel="noopener noreferrer">lichess.org</a>{' '}
                  and{' '}
                  <a className="about-link" href="https://www.chess.com" target="_blank" rel="noopener noreferrer">chess.com</a>{' '}
                  using the username you enter. Their handling of that request is governed by their
                  own privacy policies.
                </p>
              </div>
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  <strong>No analytics, ads, or tracking.</strong> We don&apos;t use analytics SDKs,
                  advertising, or third-party trackers. Nothing follows you around, and we don&apos;t
                  build a profile of you.
                </p>
              </div>
            </div>
          </div>

          <div className="about-section">
            <div className="about-h">Children</div>
            <div className="about-notes">
              <div className="about-note">
                <span className="tick" aria-hidden="true">✓</span>
                <p>
                  my·blunders collects no personal information from anyone, including children. It
                  reads only the public game data tied to the username you provide.
                </p>
              </div>
            </div>
          </div>

          <div className="about-section">
            <div className="about-h">Contact</div>
            <div className="about-author">
              <div className="who">
                Questions about privacy? Reach the author, <strong>Sami Abdulnour</strong>, via the{' '}
                <Link className="about-link" href="/contact">contact page</Link> or at{' '}
                <a className="about-link" href="mailto:hi@samiabdulnour.com">hi@samiabdulnour.com</a>.
              </div>
              <div className="about-links">
                <a
                  className="about-link"
                  href="https://github.com/samiabdulnour/my-blunders"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/samiabdulnour/my-blunders
                </a>
              </div>
            </div>
          </div>

          <div className="about-foot">
            <Link className="about-link" href="/about">
              ← About my·blunders
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
