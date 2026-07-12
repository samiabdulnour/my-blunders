import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import { ContactForm } from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact · My Blunders',
  description: 'Ask a question or send feedback about my·blunders.',
};

/**
 * Contact page. The page shell is static (pre-renders in the web build and the
 * Capacitor static export); the form itself is a small client component. This
 * also serves as the Support URL for the App Store listing.
 */
export default function ContactPage() {
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
            <div className="about-eyebrow">contact</div>
            <h1 className="about-title">Ask a question</h1>
            <p className="about-lead">
              Found a bug, have an idea, or just want to get in touch? Send a note and it&apos;ll
              reach me directly.
            </p>
          </div>

          <div className="about-section">
            <ContactForm />
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
