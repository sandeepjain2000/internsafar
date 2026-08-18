import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import {
  createTwoFactorChallenge,
  ensureIpTwoFactorSchema,
  isTwoFactorEnabled,
  setTwoFactorEnabled,
  verifyTwoFactorChallenge,
} from '@/lib/ipTwoFactor';
import { getOutboundEmailOverride } from '@/lib/mail';

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpTwoFactorSchema();
  const enabled = await isTwoFactorEnabled(session.user.id);
  return jsonOk({
    enabled,
    method: 'email_otp',
    /** Hint for QA: when override is set, codes go to that inbox (often Zoho). */
    mailOverrideActive: Boolean(getOutboundEmailOverride()),
  });
}

/**
 * body.action:
 *  - start-enable | start-disable → email a code
 *  - confirm-enable | confirm-disable → { challengeId, code }
 */
export async function POST(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const action = String(body.action || '').trim();
  const enabled = await isTwoFactorEnabled(session.user.id);

  try {
    if (action === 'start-enable') {
      if (enabled) return jsonError('Two-factor authentication is already enabled');
      const { challengeId, email } = await createTwoFactorChallenge(session.user.id, 'enable');
      return jsonOk({
        ok: true,
        challengeId,
        sentToHint: getOutboundEmailOverride() || email,
        message: 'Verification code sent to your email.',
      });
    }

    if (action === 'start-disable') {
      if (!enabled) return jsonError('Two-factor authentication is not enabled');
      const { challengeId, email } = await createTwoFactorChallenge(session.user.id, 'disable');
      return jsonOk({
        ok: true,
        challengeId,
        sentToHint: getOutboundEmailOverride() || email,
        message: 'Verification code sent to your email.',
      });
    }

    if (action === 'confirm-enable' || action === 'confirm-disable') {
      const challengeId = body.challengeId;
      const code = body.code;
      const verified = await verifyTwoFactorChallenge(challengeId, code);
      if (!verified || verified.userId !== session.user.id) {
        return jsonError('Invalid or expired verification code', 400);
      }
      const wantEnable = action === 'confirm-enable';
      if (wantEnable && verified.purpose !== 'enable') return jsonError('Wrong challenge type');
      if (!wantEnable && verified.purpose !== 'disable') return jsonError('Wrong challenge type');
      await setTwoFactorEnabled(session.user.id, wantEnable);
      return jsonOk({
        ok: true,
        enabled: wantEnable,
        message: wantEnable ? 'Two-factor authentication enabled.' : 'Two-factor authentication disabled.',
      });
    }

    return jsonError('Unknown action');
  } catch (e) {
    console.error('[account 2fa]', e.message);
    if (e.code === 'MAIL_NOT_CONFIGURED') {
      return jsonError('Email is not configured — cannot send verification codes', 503);
    }
    return jsonError(e.message || 'Could not process two-factor request', 500);
  }
}
