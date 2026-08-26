'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '@/components/ip/PageHeader';
import MessageRichComposer from '@/components/ip/MessageRichComposer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { plainTextFromMessageHtml, sanitizeMessageHtml } from '@/lib/ipRichText';
import { cn } from '@/lib/utils';

/**
 * Full-page conversation (sub-screen). Email-style thread, not Internshala bubbles.
 */
export default function MessageThreadView({ role }) {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id || '';
  const backHref = role === 'candidate' ? '/candidate/messages' : '/employer/messages';
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/messages/threads/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Thread not found');
      setThread(data.thread);
      setMessages(data.messages || []);
    } catch (e) {
      setError(e.message);
      setThread(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!plainTextFromMessageHtml(draft)) return;
    setSending(true);
    try {
      const res = await fetch(`/api/ip/messages/threads/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setDraft('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  async function toggleArchive() {
    if (!thread) return;
    setArchiving(true);
    setError('');
    try {
      const next = !thread.archived;
      const res = await fetch(`/api/ip/messages/threads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update archive');
      if (data.thread) setThread(data.thread);
      else await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setArchiving(false);
    }
  }

  const counterpart =
    role === 'candidate'
      ? thread?.company_name || thread?.employer_name || 'Employer'
      : thread?.candidate_name || 'Candidate';
  const subject = (thread?.last_message || thread?.subject || thread?.internship_title || 'Conversation').trim();

  function isMine(m) {
    if (currentUserId) return m.sender_user_id === currentUserId;
    const myId = role === 'employer' ? thread?.employer_user_id : thread?.candidate_user_id;
    return Boolean(myId) && m.sender_user_id === myId;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" render={<Link href={backHref} />} nativeButton={false}>
          <ArrowLeft data-icon="inline-start" className="size-4" />
          Back to inbox
        </Button>
        {thread ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={archiving}
            onClick={toggleArchive}
          >
            {archiving ? 'Updating…' : thread.archived ? 'Unarchive' : 'Archive'}
          </Button>
        ) : null}
      </div>

      <PageHeader
        title={counterpart}
        description={
          thread
            ? `${thread.internship_title || 'Conversation'}${subject ? ` · ${subject.slice(0, 120)}` : ''}`
            : 'Loading conversation…'
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="flex min-h-[60vh] flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Thread</CardTitle>
          <CardDescription>Full conversation — reply below.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="min-h-[40vh] flex-1 space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3">
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {!loading &&
              messages.map((m) => {
                const mine = isMine(m);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-md border bg-card p-3 text-sm',
                      mine && 'border-primary/30 ml-6',
                      !mine && 'mr-6',
                    )}
                  >
                    <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {mine ? 'You' : m.sender_name || m.sender_role || 'User'}
                      </span>
                      <span>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ''}</span>
                    </div>
                    <p
                      className="whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(m.body) }}
                    />
                  </div>
                );
              })}
            {!loading && !messages.length ? (
              <Alert>
                <AlertDescription>No messages in this thread yet.</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <MessageRichComposer
            value={draft}
            onChange={setDraft}
            disabled={sending || Boolean(thread?.archived)}
            placeholder="Write a reply…"
            aria-label="Reply"
            className="w-full"
            toolbarClassName="flex items-center gap-1 mb-2"
            editorClassName="ip-msg-rich-editor min-h-[4.5rem]"
          />
          <div className="flex gap-2 justify-end">
            <Button
              className="self-end"
              onClick={send}
              disabled={sending || !plainTextFromMessageHtml(draft)}
            >
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="self-start" onClick={() => router.push(backHref)}>
            Close conversation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
