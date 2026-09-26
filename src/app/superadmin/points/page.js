'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Coins, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import '@/components/ip/ip-list-pager.css';
import IpListPager from '@/components/ip/IpListPager';
import { IpListEmpty, IpListLoading } from '@/components/ip/IpListStatus';
import { useClientPagination } from '@/hooks/useClientPagination';
import { SA_PAGE_SIZE } from '@/lib/ipSuperadminList';
import { toTitleCaseLabel } from '@/lib/ipTitleCase';

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

export default function SuperAdminAdjustPointsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (qDebounced) params.set('q', qDebounced);
      if (roleFilter) params.set('role', roleFilter);
      const res = await fetch(`/api/ip/superadmin/points?${params}`, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed To Load (${res.status})`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e.message || 'Failed To Load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (session?.user?.role === 'superadmin') {
      load();
      return;
    }
    setLoading(false);
    if (sessionStatus === 'authenticated') {
      setError('Forbidden — Adjust Points requires SuperAdmin.');
      setItems([]);
    }
  }, [session, sessionStatus, qDebounced, roleFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(
    items,
    SA_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [qDebounced, roleFilter, setPage]);

  function openAdjust(row) {
    setTarget(row);
    setMode('add');
    setAmount('');
    setNote('');
    setConfirmOpen(false);
    setError('');
  }

  function closeAdjust() {
    setTarget(null);
    setConfirmOpen(false);
    setAmount('');
    setNote('');
  }

  const parsedAmount = useMemo(() => {
    const n = Number(String(amount).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
  }, [amount]);

  const previewDelta = useMemo(() => {
    if (parsedAmount == null) return null;
    return mode === 'add' ? parsedAmount : -parsedAmount;
  }, [parsedAmount, mode]);

  const previewAfter = useMemo(() => {
    if (!target || previewDelta == null) return null;
    return Number(target.points || 0) + previewDelta;
  }, [target, previewDelta]);

  function requestConfirm() {
    if (!target) return;
    if (parsedAmount == null) {
      setError('Enter a positive whole number of points.');
      return;
    }
    if (!String(note || '').trim()) {
      setError('Note / reason is required.');
      return;
    }
    if (mode === 'deduct' && previewAfter != null && previewAfter < 0) {
      setError(`Cannot deduct ${parsedAmount} — balance is ${target.points}.`);
      return;
    }
    setError('');
    setConfirmOpen(true);
  }

  async function submitAdjust() {
    if (!target || previewDelta == null) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/superadmin/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: target.id,
          delta: previewDelta,
          note: String(note).trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Update failed');
        setConfirmOpen(false);
        return;
      }
      setToast(
        mode === 'add'
          ? `Added ${parsedAmount} point(s) to ${target.email}`
          : `Removed ${parsedAmount} point(s) from ${target.email}`,
      );
      closeAdjust();
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ip-sa-q ip-mobile-bleed">
      {toast ? (
        <div className="ip-saq-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-saq-head">
        <div>
          <div className="ip-saq-head__title">
            <h1>Adjust Points</h1>
            <span className="ip-saq-pill ip-saq-pill--brand">Support Only</span>
          </div>
          <p>
            Manually add or remove reward points for a candidate or employer. This is an internal
            support tool — users only see a short notification when you change their balance.
          </p>
        </div>
      </div>

      {error && !target ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs" role="tablist">
            {[
              { id: '', label: 'All' },
              { id: 'candidate', label: 'Candidates' },
              { id: 'employer', label: 'Employers' },
            ].map((t) => (
              <button
                key={t.id || 'all'}
                type="button"
                role="tab"
                aria-selected={roleFilter === t.id}
                className={`ip-saq-tab${roleFilter === t.id ? ' ip-saq-tab--on' : ''}`}
                onClick={() => setRoleFilter(t.id)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="ip-saq-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search email, name, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
            />
          </div>
        </div>

        {loading ? (
          <IpListLoading label="Loading accounts…" />
        ) : !pageItems.length ? (
          <IpListEmpty title="No Matching Accounts" hint="Try another search or role filter." />
        ) : (
          <>
            <div className="ip-saq-table-wrap">
              <table className="ip-saq-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Role</th>
                    <th>Points</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="ip-saq-co">
                          <div className="ip-saq-avatar">{initial(u.name || u.email)}</div>
                          <div>
                            <strong>{u.name || '—'}</strong>
                            <span>{u.email}</span>
                            {u.companyName ? <span>{u.companyName}</span> : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="ip-saq-pill ip-saq-pill--brand">
                          {toTitleCaseLabel(u.role) || u.role}
                        </span>
                      </td>
                      <td>
                        <strong>{u.points}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ip-saq-btn ip-saq-btn--sm"
                          onClick={() => openAdjust(u)}
                        >
                          <Coins size={14} aria-hidden />
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ip-saq-pager">
              <IpListPager
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      {target ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-pts-title">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <Coins size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-saq-pts-title">Adjust Points</h3>
                  <span>
                    {target.name || 'User'} · {target.email} · Balance {target.points}
                  </span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={closeAdjust}>
                ×
              </button>
            </div>

            <div className="ip-saq-modal-body" style={{ display: 'grid', gap: '0.75rem' }}>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="ip-saq-tabs" role="tablist" aria-label="Add or deduct">
                <button
                  type="button"
                  className={`ip-saq-tab${mode === 'add' ? ' ip-saq-tab--on' : ''}`}
                  onClick={() => setMode('add')}
                >
                  Add
                </button>
                <button
                  type="button"
                  className={`ip-saq-tab${mode === 'deduct' ? ' ip-saq-tab--on' : ''}`}
                  onClick={() => setMode('deduct')}
                >
                  Deduct
                </button>
              </div>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Points</span>
                <input
                  className="ip-saq-field"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 50"
                  aria-label="Points amount"
                />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                  Note / Reason (required)
                </span>
                <textarea
                  className="ip-saq-textarea"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Internal reason for this adjustment"
                  aria-label="Note or reason"
                />
              </label>

              {previewAfter != null ? (
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#334155' }}>
                  New balance preview: <strong>{previewAfter}</strong>
                  {mode === 'deduct' && previewAfter < 0 ? ' (not allowed)' : ''}
                </p>
              ) : null}
            </div>

            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={closeAdjust} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={`ip-saq-btn ${mode === 'deduct' ? 'ip-saq-btn--rose' : 'ip-saq-btn--emerald'}`}
                disabled={busy}
                onClick={requestConfirm}
              >
                {mode === 'add' ? 'Continue…' : 'Continue Deduct…'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen && target && previewDelta != null ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-pts-confirm">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div>
                  <h3 id="ip-saq-pts-confirm">Confirm Adjustment</h3>
                  <span>
                    {mode === 'add' ? 'Add' : 'Remove'} {parsedAmount} point
                    {parsedAmount === 1 ? '' : 's'} for {target.email}
                  </span>
                </div>
              </div>
            </div>
            <div className="ip-saq-modal-body">
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#334155' }}>
                Balance {target.points} → <strong>{previewAfter}</strong>. The user will get an in-app
                notification only (no public “request points” feature).
              </p>
            </div>
            <div className="ip-saq-modal-foot">
              <button
                type="button"
                className="ip-saq-btn"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
              >
                Back
              </button>
              <button
                type="button"
                className={`ip-saq-btn ${mode === 'deduct' ? 'ip-saq-btn--rose' : 'ip-saq-btn--emerald'}`}
                disabled={busy}
                onClick={submitAdjust}
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
