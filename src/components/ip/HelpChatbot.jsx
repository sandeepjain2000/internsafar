'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MessageCircle, X } from 'lucide-react';
import {
  helpFollowUpsForRole,
  helpStartersForRole,
  helpWelcomeForRole,
} from '@/lib/ipHelpChatContext';
import './ip-help-chatbot.css';

export default function HelpChatbot() {
  const { data: session, status } = useSession();
  const role = status === 'authenticated' ? session?.user?.role : null;
  const starters = useMemo(() => helpStartersForRole(role), [role]);
  const followUpPool = useMemo(() => helpFollowUpsForRole(role), [role]);
  const welcome = useMemo(() => helpWelcomeForRole(role), [role]);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showStarters, setShowStarters] = useState(true);
  const [followUps, setFollowUps] = useState([]);
  const [messages, setMessages] = useState([{ role: 'assistant', content: welcome }]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const welcomeRoleRef = useRef(role);

  // Refresh welcome + reset starters when auth role becomes known / changes
  useEffect(() => {
    if (welcomeRoleRef.current === role) return;
    welcomeRoleRef.current = role;
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.role === 'assistant') {
        return [{ role: 'assistant', content: welcome }];
      }
      return prev;
    });
    setShowStarters(true);
    setFollowUps([]);
  }, [role, welcome]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    inputRef.current?.focus();
  }, [open, messages, busy, error]);

  async function ask(question) {
    const q = String(question || '').trim();
    if (!q || busy) return;
    setError('');
    setShowStarters(false);
    setFollowUps([]);
    setBusy(true);
    const nextMessages = [...messages, { role: 'user', content: q }];
    setMessages(nextMessages);
    setInput('');
    try {
      const res = await fetch('/api/ip/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          history: nextMessages.slice(0, -1).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Help request failed');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: String(data.reply || '').trim() || 'No reply returned.' },
      ]);
      setFollowUps(followUpPool.filter((c) => c.toLowerCase() !== q.toLowerCase()).slice(0, 3));
    } catch (err) {
      setError(err.message || 'Help chatbot unavailable');
      setFollowUps([]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    void ask(input);
  }

  function closePanel() {
    setOpen(false);
  }

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) closePanel();
  }

  return (
    <div
      className="ip-helpbot"
      data-open={open ? '1' : '0'}
      onClick={open ? onOverlayClick : undefined}
    >
      {open ? (
        <section
          className="ip-helpbot__panel"
          aria-label="InternSafar help chatbot"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="ip-helpbot__head">
            <div className="ip-helpbot__brand">
              <div className="ip-helpbot__logo-frame" aria-hidden>
                <Image
                  src="/internsafar-icon.png"
                  alt=""
                  width={28}
                  height={28}
                  className="ip-helpbot__logo-img"
                />
              </div>
              <div>
                <div className="ip-helpbot__title">InternSafar Help</div>
                <div className="ip-helpbot__subtitle">Portal &amp; Account Assistance</div>
              </div>
            </div>
            <button
              type="button"
              className="ip-helpbot__close"
              aria-label="Close help chat"
              onClick={closePanel}
            >
              <X className="ip-helpbot__close-icon" aria-hidden />
            </button>
          </header>

          <div className="ip-helpbot__body" role="log" aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`ip-helpbot__msg ip-helpbot__msg--${m.role}`}
              >
                <div className="ip-helpbot__bubble">{m.content}</div>
              </div>
            ))}

            {busy ? (
              <div className="ip-helpbot__msg ip-helpbot__msg--assistant">
                <div className="ip-helpbot__typing" aria-label="Assistant is thinking">
                  <span className="ip-helpbot__dot" />
                  <span className="ip-helpbot__dot" />
                  <span className="ip-helpbot__dot" />
                </div>
              </div>
            ) : null}

            {error && !busy ? (
              <div className="ip-helpbot__error-banner" role="alert">
                Unable to fetch a live answer right now. Please refer to our documentation guides:
                <br />
                <br />
                • Visit the <Link href="/help">Help Center</Link>
                <br />
                • Read <Link href="/how-it-works">How it works</Link>
                {error ? (
                  <>
                    <br />
                    <br />
                    <span className="ip-helpbot__error-detail">{error}</span>
                  </>
                ) : null}
              </div>
            ) : null}

            {!busy && !error && showStarters ? (
              <div className="ip-helpbot__starters">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="ip-helpbot__starter"
                    onClick={() => void ask(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            {!busy && !error && followUps.length > 0 ? (
              <div className="ip-helpbot__quick">
                {followUps.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="ip-helpbot__quick-btn"
                    onClick={() => void ask(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          <div className="ip-helpbot__composer">
            <form className="ip-helpbot__input-row" onSubmit={onSubmit}>
              <input
                ref={inputRef}
                className="ip-helpbot__input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type product question..."
                disabled={busy}
                maxLength={2000}
                aria-label="Help question"
              />
              <button
                type="submit"
                className="ip-helpbot__send"
                disabled={busy || !input.trim()}
              >
                Send
              </button>
            </form>
            <p className="ip-helpbot__footer-note">
              Grounded in official <Link href="/help">Help Center</Link> &amp;{' '}
              <Link href="/how-it-works">How it Works</Link> docs.
            </p>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="ip-helpbot__launcher"
        aria-expanded={open}
        aria-label={open ? 'Close help assistant' : 'Open InternSafar Help Chat'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {open ? (
          <X className="ip-helpbot__launcher-icon" aria-hidden />
        ) : (
          <MessageCircle className="ip-helpbot__launcher-icon" aria-hidden />
        )}
      </button>
    </div>
  );
}
