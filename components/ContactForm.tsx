'use client';

import { useState } from 'react';

/** Where questions are delivered. Visible in the bundle by design — this is the
 *  public contact address for the app. */
const CONTACT_EMAIL = 'hi@samiabdulnour.com';

/**
 * Contact form for "submit a question".
 *
 * The app is self-contained (no backend), so rather than POST to a server we
 * don't have, Send composes a pre-filled `mailto:` and hands off to the user's
 * mail app. This works identically on the web and inside the iOS App Store
 * build, with no third-party service and nothing sent anywhere until the user
 * hits send in their own mail client.
 */
export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    const subject = `my·blunders — question${name.trim() ? ` from ${name.trim()}` : ''}`;
    const body = [
      message.trim(),
      '',
      '—',
      name.trim() ? `Name: ${name.trim()}` : '',
      email.trim() ? `Reply to: ${email.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  return (
    <div className="contact-form">
      <label className="contact-field">
        <span className="contact-label">Your name (optional)</span>
        <input
          className="contact-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          autoComplete="name"
        />
      </label>
      <label className="contact-field">
        <span className="contact-label">Your email (so I can reply)</span>
        <input
          className="contact-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
        />
      </label>
      <label className="contact-field">
        <span className="contact-label">Your question</span>
        <textarea
          className="contact-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What would you like to ask?"
          rows={5}
        />
      </label>
      <button className="contact-send" onClick={send} disabled={!canSend}>
        Send question →
      </button>
      {sent ? (
        <p className="contact-note">
          Your mail app should have opened with the message ready — just hit send. If nothing
          happened, email <a className="about-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
          directly.
        </p>
      ) : (
        <p className="contact-note">
          This opens your mail app with the question pre-filled — nothing is sent until you press
          send there.
        </p>
      )}
    </div>
  );
}
