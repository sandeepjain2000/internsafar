'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MessageCircle, RotateCcw, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { helpWelcomeForRole } from '@/lib/ipHelpChatContext';
import { helpFollowUps, helpStarters } from '@/lib/ipHelpChat/suggestions';
import './ip-help-chatbot.css';

const NEGATIVE_REASONS = [
  'Did not answer my question',
  'Information seems incorrect',
  'Need more detail',
  'Other',
];

function newMsg(partial) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...partial,
  };
}

export default function HelpChatbot() {
  const { data: session, status } = useSession();
  const pathname = usePathname() || '/';
  const role = status === 'authenticated' ? session?.user?.role : null;
  const welcome = useMemo(() => helpWelcomeForRole(role), [role]);
  const starters = useMemo(() => helpStarters({ role, pathname }), [role, pathname]);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showStarters, setShowStarters] = useState(true);
  const [followUps, setFollowUps] = useState([]);
  const [messages, setMessages] = useState(() => [
    newMsg({ role: 'assistant', content: welcome }),
  ]);
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const welcomeRoleRef = useRef(role);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (welcomeRoleRef.current === role) return;
    welcomeRoleRef.current = role;
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.role === 'assistant') {
        return [newMsg({ role: 'assistant', content: welcome })];
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
  }, [open, messages, busy, error, followUps]);

  function startNewConversation() {
    setError('');
    setBusy(false);
    inFlightRef.current = false;
    setShowStarters(true);
    setFollowUps([]);
    setFeedbackFor(null);
    setLastFailedQuestion('');
    setInput('');
    setMessages([newMsg({ role: 'assistant', content: welcome })]);
  }

  async function postHelp(q, historyMessages) {
    const res = await fetch('/api/ip/help-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: q,
        history: historyMessages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })),
        page: { pathname },
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function isTransientHelpFailure(res, data, err) {
    if (err) return true;
    if (res?.status === 429 || res?.status >= 500) return true;
    const fallback = String(data?.fallbackState || '');
    if (fallback === 'service_unavailable') return true;
    const msg = String(data?.error || data?.answer || data?.reply || '').toLowerCase();
    return /temporarily unavailable|rate limit|try again|busy/.test(msg);
  }

  async function ask(question) {
    const q = String(question || '').trim();
    if (!q || busy || inFlightRef.current) return;
    inFlightRef.current = true;
    setError('');
    setLastFailedQuestion('');
    setShowStarters(false);
    setFollowUps([]);
    setFeedbackFor(null);
    setBusy(true);
    const nextMessages = [...messages, newMsg({ role: 'user', content: q })];
    setMessages(nextMessages);
    setInput('');
    const historyForApi = nextMessages.slice(0, -1);
    try {
      let { res, data } = await postHelp(q, historyForApi);
      // One automatic retry for flaky provider / timeout / 429 / service_unavailable
      if (isTransientHelpFailure(res, data, null) && (!res.ok || data.fallbackState === 'service_unavailable')) {
        await new Promise((r) => setTimeout(r, 900));
        ({ res, data } = await postHelp(q, historyForApi));
      }
      if (!res.ok && !data.answer && !data.reply) {
        throw new Error(data.error || 'Help request failed');
      }
      const answer = String(data.answer || data.reply || data.error || '').trim() || 'No reply returned.';
      const stillDown = isTransientHelpFailure(res, data, null) && (
        data.fallbackState === 'service_unavailable' || !res.ok
      );
      setMessages((prev) => [
        ...prev,
        newMsg({
          role: 'assistant',
          content: answer,
          actions: Array.isArray(data.actions) ? data.actions : [],
          relatedResources: Array.isArray(data.relatedResources) ? data.relatedResources : [],
          eventId: data.eventId || null,
          fallbackState: data.fallbackState || (res.ok ? 'answered' : 'service_unavailable'),
          feedback: null,
        }),
      ]);
      if (Array.isArray(data.suggestions) && data.suggestions.length) {
        setFollowUps(data.suggestions.filter((c) => c.toLowerCase() !== q.toLowerCase()).slice(0, 3));
      } else {
        setFollowUps(
          helpFollowUps({ role, topic: data.topic, pathname }).filter(
            (c) => c.toLowerCase() !== q.toLowerCase(),
          ),
        );
      }
      if (stillDown) {
        setError(data.error || answer);
        setLastFailedQuestion(q);
      }
    } catch (err) {
      setError(err.message || 'Help chatbot unavailable');
      setLastFailedQuestion(q);
      setFollowUps(helpFollowUps({ role, topic: 'troubleshooting', pathname }));
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }

  async function sendFeedback(msg, feedback, reason = null) {
    if (!msg?.eventId || msg.feedback) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, feedback } : m)),
    );
    if (feedback === 'not_helpful') setFeedbackFor(msg.id);
    else setFeedbackFor(null);
    try {
      await fetch('/api/ip/help-chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: msg.eventId, feedback, reason }),
      });
    } catch {
      /* non-blocking */
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
            <div className="ip-helpbot__head-actions">
              <button
                type="button"
                className="ip-helpbot__icon-btn"
                aria-label="Start new conversation"
                title="New conversation"
                onClick={startNewConversation}
              >
                <RotateCcw className="ip-helpbot__close-icon" aria-hidden />
              </button>
              <button
                type="button"
                className="ip-helpbot__close"
                aria-label="Close help chat"
                onClick={closePanel}
              >
                <X className="ip-helpbot__close-icon" aria-hidden />
              </button>
            </div>
          </header>

          <div className="ip-helpbot__body" role="log" aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={`ip-helpbot__msg ip-helpbot__msg--${m.role}`}>
                <div className="ip-helpbot__bubble">{m.content}</div>
                {m.role === 'assistant' && Array.isArray(m.actions) && m.actions.length ? (
                  <div className="ip-helpbot__actions">
                    {m.actions.map((a) => (
                      <Link key={a.id} href={a.href} className="ip-helpbot__action-link">
                        {a.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {m.role === 'assistant' &&
                Array.isArray(m.relatedResources) &&
                m.relatedResources.length ? (
                  <div className="ip-helpbot__resources">
                    {m.relatedResources.map((r) => (
                      <Link key={r.id} href={r.href} className="ip-helpbot__resource-link">
                        {r.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {m.role === 'assistant' && m.eventId && m.content !== welcome ? (
                  <div className="ip-helpbot__feedback">
                    <span className="ip-helpbot__feedback-label">Was this helpful?</span>
                    <button
                      type="button"
                      className="ip-helpbot__feedback-btn"
                      aria-label="Helpful"
                      disabled={Boolean(m.feedback)}
                      onClick={() => void sendFeedback(m, 'helpful')}
                    >
                      <ThumbsUp size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ip-helpbot__feedback-btn"
                      aria-label="Not helpful"
                      disabled={Boolean(m.feedback)}
                      onClick={() => void sendFeedback(m, 'not_helpful')}
                    >
                      <ThumbsDown size={14} aria-hidden />
                    </button>
                    {m.feedback === 'helpful' ? (
                      <span className="ip-helpbot__feedback-thanks">Thanks</span>
                    ) : null}
                  </div>
                ) : null}
                {feedbackFor === m.id && m.feedback === 'not_helpful' ? (
                  <div className="ip-helpbot__reasons">
                    {NEGATIVE_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        className="ip-helpbot__reason-btn"
                        onClick={() => {
                          void sendFeedback(m, 'not_helpful', reason);
                          setFeedbackFor(null);
                        }}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                ) : null}
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
                {lastFailedQuestion ? (
                  <>
                    <br />
                    <br />
                    <button
                      type="button"
                      className="ip-helpbot__retry-btn"
                      onClick={() => void ask(lastFailedQuestion)}
                    >
                      Try Again
                    </button>
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
