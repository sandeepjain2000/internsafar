'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Search } from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import '@/components/ip/ip-messages-gemini.css';

const PAGE_SIZE = 10;

function subjectLine(t) {
  const raw = (t.last_message || t.subject || t.internship_title || 'No messages yet').trim();
  return raw.length > 90 ? `${raw.slice(0, 87)}…` : raw;
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Inbox matching candidate_messages_workspace.html (shared candidate/employer).
 */
export default function MessagesInbox({ role }) {
  const router = useRouter();
  const base = role === 'candidate' ? '/candidate/messages' : '/employer/messages';
  const internshipBase = role === 'candidate' ? '/candidate/internships' : '/employer/internships';
  const [threads, setThreads] = useState([]);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [folder, setFolder] = useState('all'); // all | archived
  const [loading, setLoading] = useState(true);

  async function load(nextFolder = folder) {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextFolder === 'archived') params.set('archived', '1');
    try {
      const res = await fetch(`/api/ip/messages/threads?${params.toString()}`);
      const data = await res.json();
      setThreads(data.items || []);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load('all');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (unreadOnly && !(Number(t.unread_count) > 0)) return false;
      if (!q) return true;
      const counterpart =
        role === 'candidate'
          ? `${t.company_name || ''} ${t.employer_name || ''}`
          : `${t.candidate_name || ''}`;
      const hay = `${counterpart} ${t.internship_title || ''} ${t.subject || ''} ${t.last_message || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [threads, search, unreadOnly, role]);

  const { page, setPage, totalPages, total, pageItems, serialOffset } = useClientPagination(
    filtered,
    PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [search, unreadOnly, folder, setPage]);

  async function onFolderChange(value) {
    setFolder(value);
    await load(value);
  }

  const counterpartLabel = role === 'candidate' ? 'Employer' : 'Candidate';
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="ip-msg">
      <div className="ip-msg-header">
        <h1>Messages</h1>
        <p>
          {role === 'candidate'
            ? 'Manage communications with employers about your applications.'
            : 'Manage communications with candidates about your postings.'}
        </p>
      </div>

      <div className="ip-msg-card">
        <div className="ip-msg-toolbar">
          <div className="ip-msg-toolbar__left">
            <div className="ip-msg-search">
              <span className="ip-msg-search__icon" aria-hidden>
                <Search className="size-4" />
              </span>
              <input
                type="search"
                placeholder={
                  role === 'candidate'
                    ? 'Search subject or employer...'
                    : 'Search subject or candidate...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search conversations"
              />
            </div>

            <div className="ip-msg-select-wrap">
              <select
                className="ip-msg-select"
                value={folder}
                onChange={(e) => onFolderChange(e.target.value)}
                aria-label="Message folder"
              >
                <option value="all">All messages</option>
                <option value="archived">Archived</option>
              </select>
              <span className="ip-msg-select-wrap__chevron" aria-hidden>
                <ChevronDown className="size-4" />
              </span>
            </div>

            <div className="ip-msg-toggle">
              <label className="ip-msg-switch">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                  id="ip-msg-unread-toggle"
                />
                <span />
              </label>
              <label htmlFor="ip-msg-unread-toggle">Unread only</label>
            </div>
          </div>

          <div className="ip-msg-count">
            Showing {filtered.length} conversation{filtered.length === 1 ? '' : 's'}
            {loading ? '…' : ''}
          </div>
        </div>

        <div className="ip-msg-table-wrap">
          <table className="ip-msg-table">
            <thead>
              <tr>
                <th style={{ width: '3rem' }}>#</th>
                <th style={{ width: '25%' }}>Internship</th>
                <th style={{ width: '16%' }}>{counterpartLabel}</th>
                <th>Subject (last message)</th>
                <th style={{ width: '8rem', textAlign: 'right' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t, idx) => {
                const fromName =
                  role === 'candidate'
                    ? t.company_name || t.employer_name || 'Employer'
                    : t.candidate_name || 'Candidate';
                const unread = Number(t.unread_count) > 0;
                return (
                  <tr
                    key={t.id}
                    className={unread ? 'is-unread' : ''}
                    onClick={() => router.push(`${base}/${t.id}`)}
                  >
                    <td className="ip-msg-num">{serialOffset + idx + 1}</td>
                    <td>
                      <div className="ip-msg-internship">
                        <span className={`ip-msg-dot${unread ? '' : ' ip-msg-dot--empty'}`} aria-hidden />
                        {t.internship_id ? (
                          <Link
                            href={`${internshipBase}/${t.internship_id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t.internship_title || 'Internship'}
                          </Link>
                        ) : (
                          <span>{t.internship_title || 'General'}</span>
                        )}
                      </div>
                    </td>
                    <td className="ip-msg-employer">{fromName}</td>
                    <td>
                      <div className="ip-msg-subject" title={subjectLine(t)}>
                        {subjectLine(t)}
                      </div>
                    </td>
                    <td className="ip-msg-date">{formatWhen(t.last_message_at || t.updated_at)}</td>
                  </tr>
                );
              })}
              {!filtered.length && !loading ? (
                <tr>
                  <td colSpan={5} className="ip-msg-empty">
                    {folder === 'archived'
                      ? 'No archived conversations.'
                      : 'No conversations match these filters.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {total > 0 ? (
          <div className="ip-msg-pager">
            <span>
              Showing {from} to {to} of {total} results
            </span>
            <div className="ip-msg-pager__btns">
              <button
                type="button"
                className="ip-msg-btn"
                disabled={page <= 1}
                onClick={() => setPage(Math.max(1, page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="ip-msg-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
