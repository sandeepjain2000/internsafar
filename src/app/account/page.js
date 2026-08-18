'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  HelpCircle,
  Key,
  KeyRound,
  Laptop,
  LogOut,
  Mail,
  Monitor,
  Save,
  ShieldCheck,
  Sliders,
  Smartphone,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import '@/components/ip/ip-account-gemini.css';

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: 'Not Entered', color: '#94a3b8' };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 2) return { score: 33, label: 'Weak Password', color: '#f43f5e' };
  if (score === 3) return { score: 66, label: 'Moderate Password', color: '#f59e0b' };
  return { score: 100, label: 'Strong Password', color: '#10b981' };
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'Active now';
  if (diff < 3600_000) return `Last active: ${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `Last active: ${Math.floor(diff / 3600_000)} hours ago`;
  return `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function AccountPage() {
  const { data: session, update: updateSession } = useSession();
  const role = session?.user?.role;
  const isCandidate = role === 'candidate';

  const [tab, setTab] = useState('security');
  const [showBanner, setShowBanner] = useState(true);
  const [toastMsg, setToastMsg] = useState(null);
  const [modal, setModal] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [signOutOthersOnPw, setSignOutOthersOnPw] = useState(true);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailVerifiedAt, setEmailVerifiedAt] = useState(null);
  const [phone, setPhone] = useState('');
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState(null);
  const [profileHref, setProfileHref] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState(null);

  const [prefs, setPrefs] = useState([]);
  const [smsNote, setSmsNote] = useState('');
  const [prefsBusy, setPrefsBusy] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStep, setEmailStep] = useState('request');
  const [emailBusy, setEmailBusy] = useState(false);

  const [newPhone, setNewPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState('request');
  const [phoneBusy, setPhoneBusy] = useState(false);

  const [resetBusy, setResetBusy] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorMode, setTwoFactorMode] = useState(null);
  const [twoFactorHint, setTwoFactorHint] = useState('');

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const reqs = useMemo(
    () => ({
      len: newPassword.length >= 8,
      upper: /[A-Z]/.test(newPassword),
      num: /[0-9]/.test(newPassword),
      special: /[^A-Za-z0-9]/.test(newPassword),
    }),
    [newPassword],
  );

  function showToast(msg) {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3600);
  }

  async function loadProfile() {
    const res = await fetch('/api/ip/account/profile');
    if (!res.ok) return;
    const data = await res.json();
    setFullName(data.name || '');
    setEmail(data.email || '');
    setEmailVerifiedAt(data.emailVerifiedAt || null);
    setPhone(data.phone || '');
    setPhoneVerifiedAt(data.phoneVerifiedAt || null);
    setProfileHref(data.profileHref || null);
  }

  async function loadSessions() {
    const res = await fetch('/api/ip/account/sessions');
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data.items || []);
  }

  async function loadPrefs() {
    if (!isCandidate) return;
    const res = await fetch('/api/ip/account/notification-preferences');
    if (!res.ok) return;
    const data = await res.json();
    setPrefs(data.items || []);
    setSmsNote(data.smsNote || '');
  }

  async function loadTwoFactor() {
    const res = await fetch('/api/ip/account/2fa');
    if (!res.ok) return;
    const data = await res.json();
    setTwoFactorEnabled(Boolean(data.enabled));
  }

  useEffect(() => {
    loadProfile();
    loadTwoFactor();
    loadSessions();
  }, []);

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
    if (tab === 'notifications') loadPrefs();
  }, [tab, isCandidate]);

  async function startTwoFactor(mode) {
    setTwoFactorBusy(true);
    setTwoFactorHint('');
    try {
      const res = await fetch('/api/ip/account/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode === 'enable' ? 'start-enable' : 'start-disable' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not start verification');
        return;
      }
      setTwoFactorMode(mode);
      setTwoFactorChallengeId(data.challengeId || '');
      setTwoFactorCode('');
      setTwoFactorHint(
        data.sentToHint ? `Code sent to ${data.sentToHint}` : 'Code sent to your account email',
      );
      showToast(data.message || 'Verification code sent');
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmTwoFactor(e) {
    e?.preventDefault?.();
    if (!twoFactorMode || !twoFactorChallengeId) return;
    setTwoFactorBusy(true);
    try {
      const res = await fetch('/api/ip/account/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: twoFactorMode === 'enable' ? 'confirm-enable' : 'confirm-disable',
          challengeId: twoFactorChallengeId,
          code: twoFactorCode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Invalid code');
        return;
      }
      setTwoFactorEnabled(Boolean(data.enabled));
      setTwoFactorMode(null);
      setTwoFactorChallengeId('');
      setTwoFactorCode('');
      setTwoFactorHint('');
      showToast(data.message || 'Updated');
    } finally {
      setTwoFactorBusy(false);
    }
  }

  function onTwoFactorToggle() {
    if (twoFactorBusy) return;
    if (twoFactorMode) {
      setTwoFactorMode(null);
      setTwoFactorChallengeId('');
      setTwoFactorCode('');
      setTwoFactorHint('');
      return;
    }
    startTwoFactor(twoFactorEnabled ? 'disable' : 'enable');
  }

  async function submitPassword(e) {
    e.preventDefault();
    setPwError('');
    if (!currentPassword) {
      setPwError('Please enter your current or temporary password.');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters long.');
      return;
    }
    if (!reqs.upper || !reqs.num || !reqs.special) {
      setPwError('New password must include uppercase, number, and special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch('/api/ip/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          signOutOthers: signOutOthersOnPw,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not change password');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowBanner(false);
      if (json.signedOutOthers) {
        showToast('Password updated. Other sessions were signed out.');
        if (tab === 'sessions') loadSessions();
      } else {
        showToast('Password updated successfully.');
      }
    } catch (err) {
      setPwError(err.message || 'Could not change password');
    } finally {
      setPwBusy(false);
    }
  }

  async function submitProfile(e) {
    e.preventDefault();
    setProfileBusy(true);
    try {
      const res = await fetch('/api/ip/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fullName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save profile');
      if (typeof updateSession === 'function') {
        await updateSession({ name: json.name || fullName });
      }
      showToast('Account name saved.');
    } catch (err) {
      showToast(err.message || 'Could not save profile');
    } finally {
      setProfileBusy(false);
    }
  }

  async function requestEmailChange(e) {
    e.preventDefault();
    setEmailBusy(true);
    try {
      const res = await fetch('/api/ip/candidate/profile/email-change/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send verification');
      setEmailStep('verify');
      showToast(data.message || 'Verification code sent to the new email.');
    } catch (err) {
      showToast(err.message);
    } finally {
      setEmailBusy(false);
    }
  }

  async function verifyEmailChange(e) {
    e.preventDefault();
    setEmailBusy(true);
    try {
      const res = await fetch('/api/ip/candidate/profile/email-change/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not verify code');
      setEmail(data.newEmail || newEmail);
      setEmailVerifiedAt(new Date().toISOString());
      setModal(null);
      setNewEmail('');
      setEmailCode('');
      setEmailStep('request');
      showToast('Login email changed. Use the new email next time you sign in.');
    } catch (err) {
      showToast(err.message);
    } finally {
      setEmailBusy(false);
    }
  }

  async function requestPhoneChange(e) {
    e.preventDefault();
    setPhoneBusy(true);
    try {
      const res = await fetch('/api/ip/account/phone-change/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send code');
      setPhoneStep('verify');
      showToast(data.message || 'Confirmation code sent to your login email.');
    } catch (err) {
      showToast(err.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyPhoneChange(e) {
    e.preventDefault();
    setPhoneBusy(true);
    try {
      const res = await fetch('/api/ip/account/phone-change/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: phoneCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not verify code');
      setPhone(data.phone || newPhone);
      setPhoneVerifiedAt(data.phoneVerifiedAt || new Date().toISOString());
      setModal(null);
      setNewPhone('');
      setPhoneCode('');
      setPhoneStep('request');
      showToast('Mobile number saved and verified.');
    } catch (err) {
      showToast(err.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function sendRecovery(e) {
    e.preventDefault();
    setResetBusy(true);
    try {
      const res = await fetch('/api/ip/account/password-reset', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send reset email');
      setModal(null);
      showToast(data.message || 'Reset instructions sent to your login email.');
    } catch (err) {
      showToast(err.message);
    } finally {
      setResetBusy(false);
    }
  }

  async function revokeSession(id) {
    setSessionsBusy(true);
    try {
      const res = await fetch(`/api/ip/account/sessions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not revoke session');
      setPendingRevoke(null);
      setModal(null);
      await loadSessions();
      showToast('Session revoked.');
    } catch (err) {
      showToast(err.message || 'Could not revoke session');
    } finally {
      setSessionsBusy(false);
    }
  }

  async function revokeOthers() {
    setSessionsBusy(true);
    try {
      const res = await fetch('/api/ip/account/sessions?others=1', { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not sign out other devices');
      setModal(null);
      await loadSessions();
      showToast('Signed out of all other device sessions.');
    } catch (err) {
      showToast(err.message || 'Could not sign out other devices');
    } finally {
      setSessionsBusy(false);
    }
  }

  async function savePrefs(e) {
    e.preventDefault();
    setPrefsBusy(true);
    try {
      const res = await fetch('/api/ip/account/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: prefs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save preferences');
      setPrefs(data.items || prefs);
      setSmsNote(data.smsNote || smsNote);
      showToast('Delivery preferences saved.');
    } catch (err) {
      showToast(err.message);
    } finally {
      setPrefsBusy(false);
    }
  }

  function setPrefChannel(id, channel, value) {
    setPrefs((prev) => prev.map((row) => (row.id === id ? { ...row, [channel]: value } : row)));
  }

  const roleLabel =
    role === 'employer' ? 'employer' : role === 'superadmin' ? 'admin' : 'candidate';
  const otherSessions = sessions.filter((s) => !s.isCurrent).length;
  const currentDevice = sessions.find((s) => s.isCurrent);

  return (
    <div className="ip-account">
      {toastMsg ? (
        <div className="ip-ac-toast" role="status">
          <span className="ip-ac-toast-ico">
            <Check aria-hidden />
          </span>
          <span>{toastMsg}</span>
        </div>
      ) : null}

      {showBanner ? (
        <div className="ip-ac-banner">
          <div className="ip-ac-banner-main">
            <span className="ip-ac-banner-ico">
              <KeyRound aria-hidden />
            </span>
            <div>
              <h4>First-Time Password Change Recommendation</h4>
              <p>
                If your account was registered using temporary credentials or an invited login, please
                update your temporary password to a secure permanent password.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ip-ac-banner-close"
            onClick={() => setShowBanner(false)}
            aria-label="Dismiss"
          >
            <X aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="ip-ac-header">
        <h1>Account & Security Settings</h1>
        <p>
          Manage your {roleLabel} login credentials, contact security
          {isCandidate ? ', notification preferences,' : ''} and active workspace sessions.
        </p>
      </div>

      <div className="ip-ac-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'security'}
          className={`ip-ac-tab${tab === 'security' ? ' is-active' : ''}`}
          onClick={() => setTab('security')}
        >
          <ShieldCheck aria-hidden />
          <span>Security & Password</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'profile'}
          className={`ip-ac-tab${tab === 'profile' ? ' is-active' : ''}`}
          onClick={() => setTab('profile')}
        >
          <UserCheck aria-hidden />
          <span>Profile Info & Contact</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sessions'}
          className={`ip-ac-tab${tab === 'sessions' ? ' is-active' : ''}`}
          onClick={() => setTab('sessions')}
        >
          <Laptop aria-hidden />
          <span>Active Sessions</span>
          {sessions.length > 0 ? <span className="ip-ac-tab-count">{sessions.length}</span> : null}
        </button>
        {isCandidate ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notifications'}
            className={`ip-ac-tab${tab === 'notifications' ? ' is-active' : ''}`}
            onClick={() => setTab('notifications')}
          >
            <Sliders aria-hidden />
            <span>Notification Preferences</span>
          </button>
        ) : null}
      </div>

      {tab === 'security' ? (
        <>
          <div className="ip-ac-card">
            <div className="ip-ac-card-head">
              <div>
                <h2>Change Permanent Password</h2>
                <p>Ensure your {roleLabel} account stays protected by updating to a strong, unique password.</p>
              </div>
              <button type="button" className="ip-ac-forgot" onClick={() => setModal('forgot')}>
                <HelpCircle aria-hidden />
                Forgot current password?
              </button>
            </div>
            <form className="ip-ac-card-body" onSubmit={submitPassword}>
              <div className="ip-ac-field">
                <div className="ip-ac-field-label">
                  <span>
                    Current Password <span className="req">*</span>
                  </span>
                </div>
                <div className="ip-ac-input-wrap">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter temporary or current password..."
                    required
                  />
                  <button
                    type="button"
                    className="ip-ac-eye"
                    onClick={() => setShowCurrent((v) => !v)}
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </button>
                </div>
              </div>

              <div className="ip-ac-field">
                <div className="ip-ac-field-label">
                  <span>
                    New Password <span className="req">*</span>
                  </span>
                </div>
                <div className="ip-ac-input-wrap">
                  <input
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password..."
                    required
                  />
                  <button
                    type="button"
                    className="ip-ac-eye"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </button>
                </div>
              </div>

              <div className="ip-ac-field">
                <div className="ip-ac-field-label">
                  <span>
                    Confirm New Password <span className="req">*</span>
                  </span>
                </div>
                <div className="ip-ac-input-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password..."
                    required
                  />
                  <button
                    type="button"
                    className="ip-ac-eye"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </button>
                </div>
                {confirmPassword ? (
                  <span className={`ip-ac-match${newPassword === confirmPassword ? ' is-ok' : ' is-bad'}`}>
                    {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </span>
                ) : null}
              </div>

              <div className="ip-ac-reqs">
                <div className="ip-ac-strength-row">
                  <p>Password strength requirements</p>
                  <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                </div>
                <div className="ip-ac-strength-bar">
                  <div
                    className="ip-ac-strength-fill"
                    style={{ width: `${strength.score}%`, background: strength.color }}
                  />
                </div>
                <div className="ip-ac-reqs-grid">
                  <span className={`ip-ac-req${reqs.len ? ' is-ok' : ''}`}>
                    {reqs.len ? <Check aria-hidden /> : <Circle aria-hidden />}
                    <span>At least 8 characters</span>
                  </span>
                  <span className={`ip-ac-req${reqs.upper ? ' is-ok' : ''}`}>
                    {reqs.upper ? <Check aria-hidden /> : <Circle aria-hidden />}
                    <span>At least 1 uppercase letter</span>
                  </span>
                  <span className={`ip-ac-req${reqs.num ? ' is-ok' : ''}`}>
                    {reqs.num ? <Check aria-hidden /> : <Circle aria-hidden />}
                    <span>At least 1 number</span>
                  </span>
                  <span className={`ip-ac-req${reqs.special ? ' is-ok' : ''}`}>
                    {reqs.special ? <Check aria-hidden /> : <Circle aria-hidden />}
                    <span>At least 1 special character (@, #, $, etc.)</span>
                  </span>
                </div>
              </div>

              <label className="ip-ac-policy">
                <input
                  type="checkbox"
                  checked={signOutOthersOnPw}
                  onChange={(e) => setSignOutOthersOnPw(e.target.checked)}
                />
                <span>
                  <strong>Security Policy:</strong> Automatically sign out all other active devices/sessions
                  upon password update.
                </span>
              </label>

              {pwError ? <p className="ip-ac-error">{pwError}</p> : null}

              <div className="ip-ac-actions">
                <button
                  type="button"
                  className="ip-ac-btn-ghost"
                  onClick={() => {
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPwError('');
                  }}
                >
                  Clear Form
                </button>
                <button type="submit" className="ip-ac-btn-primary" disabled={pwBusy}>
                  <Key aria-hidden />
                  <span>{pwBusy ? 'Updating…' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="ip-ac-2fa">
            <div className="ip-ac-2fa-copy">
              <div className="ip-ac-2fa-title">
                <h3>Two-Factor Authentication (2FA)</h3>
                <span className="ip-ac-2fa-badge">Recommended</span>
              </div>
              <p>
                Add an extra layer of security: after password sign-in, we email a one-time code to your
                account address (or the QA mail override when configured).
              </p>
              {twoFactorHint ? <p className="ip-ac-2fa-hint">{twoFactorHint}</p> : null}
              {twoFactorMode ? (
                <form className="ip-ac-2fa-confirm" onSubmit={confirmTwoFactor}>
                  <label htmlFor="ip-ac-2fa-code">Enter 6-digit email code</label>
                  <div className="ip-ac-2fa-confirm-row">
                    <input
                      id="ip-ac-2fa-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      required
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                    />
                    <button
                      type="submit"
                      className="ip-ac-btn-primary"
                      disabled={twoFactorBusy || twoFactorCode.length !== 6}
                    >
                      {twoFactorMode === 'enable' ? 'Enable 2FA' : 'Disable 2FA'}
                    </button>
                    <button
                      type="button"
                      className="ip-ac-btn-ghost"
                      onClick={onTwoFactorToggle}
                      disabled={twoFactorBusy}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
            <button
              type="button"
              className={`ip-ac-switch${twoFactorEnabled ? ' is-on' : ''}${twoFactorMode ? ' is-pending' : ''}`}
              role="switch"
              aria-checked={twoFactorEnabled}
              aria-label="Toggle two-factor authentication"
              disabled={twoFactorBusy}
              onClick={onTwoFactorToggle}
            >
              <span className="ip-ac-switch-knob" />
            </button>
          </div>
        </>
      ) : null}

      {tab === 'profile' ? (
        <>
          {isCandidate && profileHref ? (
            <div className="ip-ac-notice">
              <div className="ip-ac-notice-main">
                <span className="ip-ac-notice-ico">
                  <User aria-hidden />
                </span>
                <div>
                  <h3>Managing Professional Resume & Skills?</h3>
                  <p>
                    Looking to update your academic details, skills, resume PDF, work preferences, or
                    portfolio links?
                  </p>
                </div>
              </div>
              <Link href={profileHref} className="ip-ac-btn-primary">
                <span>Go to Candidate Profile</span>
                <ArrowRight aria-hidden />
              </Link>
            </div>
          ) : null}

          <div className="ip-ac-card">
            <div className="ip-ac-card-head">
              <div>
                <h2>Account Contact Credentials</h2>
                <p>Basic identity information used for account login, security alerts, and recruiters.</p>
              </div>
            </div>
            <form className="ip-ac-card-body" onSubmit={submitProfile}>
              <div className="ip-ac-field">
                <div className="ip-ac-field-label">
                  <span>Full Name</span>
                </div>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>

              <div className="ip-ac-field">
                <div className="ip-ac-field-label">
                  <span>Primary Account Email</span>
                  {emailVerifiedAt ? (
                    <span className="ip-ac-badge is-ok">
                      <CheckCircle2 aria-hidden />
                      Verified Email
                    </span>
                  ) : (
                    <span className="ip-ac-badge is-wait">Login email</span>
                  )}
                </div>
                <div className="ip-ac-row">
                  <input type="email" value={email} readOnly />
                  {isCandidate ? (
                    <button
                      type="button"
                      className="ip-ac-btn-outline"
                      onClick={() => {
                        setEmailStep('request');
                        setEmailCode('');
                        setNewEmail('');
                        setModal('email');
                      }}
                    >
                      Change Email
                    </button>
                  ) : null}
                </div>
                <p className="ip-ac-note">Used for signing in and receiving application status updates.</p>
              </div>

              {isCandidate ? (
                <div className="ip-ac-field">
                  <div className="ip-ac-field-label">
                    <span>Mobile Phone Number</span>
                    {phoneVerifiedAt ? (
                      <span className="ip-ac-badge is-ok">
                        <CheckCircle2 aria-hidden />
                        Verified
                      </span>
                    ) : phone ? (
                      <span className="ip-ac-badge is-wait">Not verified</span>
                    ) : null}
                  </div>
                  <div className="ip-ac-row">
                    <input type="text" value={phone || 'No number saved'} readOnly />
                    <button
                      type="button"
                      className="ip-ac-btn-outline"
                      onClick={() => {
                        setPhoneStep('request');
                        setPhoneCode('');
                        setNewPhone('');
                        setModal('phone');
                      }}
                    >
                      Change Phone
                    </button>
                  </div>
                  <p className="ip-ac-note">
                    Saved on your candidate profile. Changing it here requires a confirmation code emailed
                    to your login address (SMS is not configured).
                  </p>
                </div>
              ) : null}

              <div className="ip-ac-actions">
                <button type="submit" className="ip-ac-btn-primary" disabled={profileBusy}>
                  <Save aria-hidden />
                  <span>{profileBusy ? 'Saving…' : 'Save Account Info'}</span>
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}

      {tab === 'sessions' ? (
        <div className="ip-ac-sessions">
          <div className="ip-ac-sessions-head">
            <div>
              <h2>Active Workspace Sessions</h2>
              <p>Review devices currently signed in to your {roleLabel} account.</p>
            </div>
            <button
              type="button"
              className="ip-ac-signout-others"
              onClick={() => setModal('signout-all')}
              disabled={sessionsBusy || otherSessions === 0}
            >
              <LogOut aria-hidden />
              Sign Out All Other Devices
            </button>
          </div>

          {sessions.length ? (
            sessions.map((s) => (
              <div key={s.id} className={`ip-ac-session${s.isCurrent ? ' is-current' : ''}`}>
                <div className="ip-ac-session-left">
                  <span className="ip-ac-session-ico">
                    {s.isMobile ? <Smartphone aria-hidden /> : <Monitor aria-hidden />}
                  </span>
                  <div>
                    <div className="ip-ac-session-title">
                      <span>{s.deviceLabel}</span>
                      {s.isCurrent ? <span className="ip-ac-current-pill">Current Device</span> : null}
                    </div>
                    <p className="ip-ac-session-meta">
                      {s.ip ? `${s.ip} • ` : ''}
                      {s.isCurrent ? `Signed in ${formatWhen(s.createdAt)}` : formatWhen(s.lastSeenAt)}
                    </p>
                  </div>
                </div>
                {s.isCurrent ? (
                  <span className="ip-ac-session-status">Active Session</span>
                ) : (
                  <button
                    type="button"
                    className="ip-ac-revoke"
                    disabled={sessionsBusy}
                    onClick={() => {
                      setPendingRevoke(s);
                      setModal('revoke');
                    }}
                  >
                    Revoke Session
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="ip-ac-empty">
              No tracked sessions yet. Sign out and sign in again to register this device.
            </p>
          )}
        </div>
      ) : null}

      {tab === 'notifications' && isCandidate ? (
        <form className="ip-ac-card" onSubmit={savePrefs}>
          <div className="ip-ac-card-head">
            <div>
              <h2>Candidate Delivery Preferences</h2>
              <p>Control how Internship Portal delivers application, interview, offer, and message alerts.</p>
            </div>
          </div>
          <div className="ip-ac-card-body">
            {smsNote ? <p className="ip-ac-note">{smsNote}</p> : null}
            {prefs.map((row) => (
              <div key={row.id} className="ip-ac-pref">
                <div>
                  <h3>{row.label}</h3>
                  <p>{row.hint}</p>
                </div>
                <div className="ip-ac-pref-channels">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.in_app !== false}
                      onChange={(e) => setPrefChannel(row.id, 'in_app', e.target.checked)}
                    />
                    In-App
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={row.email !== false}
                      onChange={(e) => setPrefChannel(row.id, 'email', e.target.checked)}
                    />
                    Email
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={row.sms === true}
                      onChange={(e) => setPrefChannel(row.id, 'sms', e.target.checked)}
                    />
                    {row.smsLabel || 'SMS'}
                  </label>
                </div>
              </div>
            ))}
            <div className="ip-ac-actions">
              <button type="submit" className="ip-ac-btn-primary" disabled={prefsBusy}>
                <Check aria-hidden />
                <span>{prefsBusy ? 'Saving…' : 'Save Delivery Preferences'}</span>
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {modal === 'forgot' ? (
        <div className="ip-ac-overlay" role="dialog" aria-modal="true">
          <div className="ip-ac-modal">
            <div className="ip-ac-modal-head">
              <div>
                <h3>Account Password Recovery</h3>
                <p>Reset credentials via registered email</p>
              </div>
              <button type="button" className="ip-ac-modal-x" onClick={() => setModal(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <form onSubmit={sendRecovery}>
              <div className="ip-ac-modal-body">
                <p className="ip-ac-note">
                  We will email reset instructions to your current login address. The link expires in one
                  hour.
                </p>
                <label htmlFor="ip-ac-reset-email">Registered Account Email</label>
                <input id="ip-ac-reset-email" type="email" value={email} readOnly />
              </div>
              <div className="ip-ac-modal-foot">
                <button type="button" className="ip-ac-btn-ghost" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="ip-ac-btn-primary" disabled={resetBusy || !email}>
                  <Mail aria-hidden />
                  {resetBusy ? 'Sending…' : 'Send Recovery Instructions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modal === 'email' ? (
        <div className="ip-ac-overlay" role="dialog" aria-modal="true">
          <div className="ip-ac-modal">
            <div className="ip-ac-modal-head">
              <div>
                <h3>Change Account Login Email</h3>
                <p>Requires a 6-digit code sent to the new address</p>
              </div>
              <button type="button" className="ip-ac-modal-x" onClick={() => setModal(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <form onSubmit={emailStep === 'verify' ? verifyEmailChange : requestEmailChange}>
              <div className="ip-ac-modal-body">
                <label htmlFor="ip-ac-new-email">New Email Address *</label>
                <input
                  id="ip-ac-new-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you.new@domain.com"
                  readOnly={emailStep === 'verify'}
                />
                {emailStep === 'verify' ? (
                  <>
                    <label htmlFor="ip-ac-email-code">Verification code *</label>
                    <input
                      id="ip-ac-email-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </>
                ) : null}
                <p className="ip-ac-modal-note">
                  Your active login remains <em>{email || 'your current email'}</em> until the new address
                  is verified.
                </p>
              </div>
              <div className="ip-ac-modal-foot">
                <button type="button" className="ip-ac-btn-ghost" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="ip-ac-btn-primary" disabled={emailBusy}>
                  {emailStep === 'verify'
                    ? emailBusy
                      ? 'Verifying…'
                      : 'Confirm New Email'
                    : emailBusy
                      ? 'Sending…'
                      : 'Send Verification Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modal === 'phone' ? (
        <div className="ip-ac-overlay" role="dialog" aria-modal="true">
          <div className="ip-ac-modal">
            <div className="ip-ac-modal-head">
              <div>
                <h3>Change Mobile Phone Number</h3>
                <p>Requires a confirmation code emailed to your login address</p>
              </div>
              <button type="button" className="ip-ac-modal-x" onClick={() => setModal(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <form onSubmit={phoneStep === 'verify' ? verifyPhoneChange : requestPhoneChange}>
              <div className="ip-ac-modal-body">
                <label htmlFor="ip-ac-new-phone">New Mobile Number *</label>
                <input
                  id="ip-ac-new-phone"
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+91 99887 76655"
                  readOnly={phoneStep === 'verify'}
                />
                {phoneStep === 'verify' ? (
                  <>
                    <label htmlFor="ip-ac-phone-code">Confirmation code *</label>
                    <input
                      id="ip-ac-phone-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </>
                ) : null}
                <p className="ip-ac-modal-note is-slate">
                  We cannot send SMS. The code is emailed to your current login address. After you confirm,
                  the number is stored on your candidate profile.
                </p>
              </div>
              <div className="ip-ac-modal-foot">
                <button type="button" className="ip-ac-btn-ghost" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="ip-ac-btn-primary" disabled={phoneBusy}>
                  {phoneStep === 'verify'
                    ? phoneBusy
                      ? 'Verifying…'
                      : 'Confirm Number'
                    : phoneBusy
                      ? 'Sending…'
                      : 'Send Confirmation Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modal === 'revoke' && pendingRevoke ? (
        <div className="ip-ac-overlay" role="dialog" aria-modal="true">
          <div className="ip-ac-modal">
            <div className="ip-ac-modal-body" style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0 }}>Revoke Workspace Session?</h3>
              <p className="ip-ac-note">
                End active access for <strong>{pendingRevoke.deviceLabel}</strong>? That device will need to
                sign in again.
              </p>
            </div>
            <div className="ip-ac-modal-foot">
              <button type="button" className="ip-ac-btn-ghost" onClick={() => setModal(null)}>
                Keep Active
              </button>
              <button
                type="button"
                className="ip-ac-btn-danger"
                disabled={sessionsBusy}
                onClick={() => revokeSession(pendingRevoke.id)}
              >
                Confirm Revocation
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal === 'signout-all' ? (
        <div className="ip-ac-overlay" role="dialog" aria-modal="true">
          <div className="ip-ac-modal">
            <div className="ip-ac-modal-body" style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0 }}>Sign Out All Other Devices?</h3>
              <p className="ip-ac-note">
                This ends every other tracked session
                {currentDevice ? ` except ${currentDevice.deviceLabel}` : ' except this device'}. Other
                browsers will need to sign in again.
              </p>
            </div>
            <div className="ip-ac-modal-foot">
              <button type="button" className="ip-ac-btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-ac-btn-danger"
                disabled={sessionsBusy}
                onClick={revokeOthers}
              >
                Confirm Sign Out Everywhere
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
