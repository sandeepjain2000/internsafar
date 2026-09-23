import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { newId, randomPassword, referralCodeFrom } from '@/lib/ids';
import { sendMail, tempPasswordEmailHtml } from '@/lib/mail';
import { notifyUser } from '@/lib/ipNotify';
import { referrerRewardsForRole } from '@/lib/pointsEconomy';
import { isGmailAddress, normalizeEmail } from '@/lib/authRegisterRules';
import {
  consumeGoogleVerification,
  GOOGLE_INTENTS,
  isGoogleVerificationBypassed,
  recordGoogleIdentity,
} from '@/lib/ipGoogleAuth';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import {
  ensureIpReferralExtraSchema,
  recordInvalidReferralAttempt,
} from '@/lib/ipReferralCredit';

/**
 * Candidate registration (Google-verified Gmail only).
 * Real Google OAuth verification token + system temp password emailed, active immediately.
 * Login is email + password only (no Google sign-in on home).
 */

async function googlePathSuccessResponse({
  userId,
  email,
  googleIdentity,
  referrerName,
  referredBy,
  message,
  warning,
  extra = {},
}) {
  const base = {
    ok: true,
    mode: 'google',
    userId,
    referredByName: referrerName || null,
    startingPoints: 50,
    referralApplied: Boolean(referredBy && referredBy !== userId),
    sessionEstablished: false,
    message:
      message ||
      'Account created. Check your email for a temporary password, then sign in with email and password.',
    ...extra,
  };
  if (warning) base.warning = warning;
  void googleIdentity;
  void email;
  return NextResponse.json(base);
}

export async function POST(request) {
  try {
    await ensureIpFormRegistrationSchema();
    await ensureIpReferralExtraSchema();
    const body = await request.json();
    if (String(body.path || '').toLowerCase() === 'form') {
      return NextResponse.json(
        {
          error:
            'Form registration is no longer available. Continue with Google on the candidate register page.',
        },
        { status: 410 },
      );
    }
    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim() || email.split('@')[0];
    const referralCode = String(body.referralCode || '').trim() || null;
    const college = String(body.university || body.college || '').trim() || null;
    const graduationYear = body.graduationYear != null && body.graduationYear !== ''
      ? Number(body.graduationYear)
      : null;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (!isGmailAddress(email)) {
      return NextResponse.json(
        {
          error:
            'Only Gmail addresses (@gmail.com) are allowed for candidate registration. Yahoo and other providers are not accepted.',
        },
        { status: 400 },
      );
    }

    // Google path requires a real verification token issued by the NextAuth signIn
    // callback, so the address comes from Google rather than from this request body.
    let googleIdentity = null;
    if (!isGoogleVerificationBypassed()) {
      const verified = await consumeGoogleVerification(
        String(body.googleVerificationToken || ''),
        GOOGLE_INTENTS.candidateRegister.cookieValue,
      );
      if (!verified) {
        return NextResponse.json(
          { error: 'Google verification is required, expired, or already used. Continue with Google again.' },
          { status: 401 },
        );
      }
      if (normalizeEmail(verified.email) !== email) {
        return NextResponse.json(
          { error: `Registration email must match the Google-verified account (${verified.email}).` },
          { status: 400 },
        );
      }
      googleIdentity = verified;
    }

    const existing = await query(`SELECT id FROM ip_users WHERE lower(email) = $1`, [email]);
    if (existing.rows[0]) {
      if (referralCode) {
        const ref = await query(`SELECT id FROM ip_users WHERE referral_code = $1 LIMIT 1`, [referralCode]);
        if (ref.rows[0]) {
          const self = ref.rows[0].id === existing.rows[0].id;
          await recordInvalidReferralAttempt({
            referrerUserId: ref.rows[0].id,
            referredUserId: existing.rows[0].id,
            referralCode,
            reason: self ? 'self_referral' : 'duplicate_email',
          }).catch(() => {});
        }
      }
      return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 });
    }

    let referredBy = null;
    let referrerRole = null;
    let referrerName = null;
    let referralNotify = null;
    if (referralCode) {
      const ref = await query(`SELECT id, name, role FROM ip_users WHERE referral_code = $1 LIMIT 1`, [referralCode]);
      if (ref.rows[0]) {
        referredBy = ref.rows[0].id;
        referrerRole = ref.rows[0].role;
        referrerName = ref.rows[0].name;
      }
    }

    const password = randomPassword(12);
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = newId('ip_user');
    const candidateId = newId('ip_cand');
    const myReferral = referralCodeFrom(name);
    const active = true;
    const registrationSource = googleIdentity ? 'google' : 'gmail_domain';

    await query('BEGIN');
    try {
      await query(
        `INSERT INTO ip_users (
           id, email, password_hash, role, name, points, application_allowance, referral_code, referred_by,
           active, registration_source
         ) VALUES ($1,$2,$3,'candidate',$4,50,10,$5,$6,$7,$8)`,
        [userId, email, passwordHash, name, myReferral, referredBy, active, registrationSource],
      );
      await query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, graduation_year, profile_picture_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [candidateId, userId, name, email, college, graduationYear, googleIdentity?.pictureUrl || null],
      );
      await query(
        `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
         VALUES ($1,$2,50,'default_signup',$3::jsonb)`,
        [newId('ip_pts'), userId, JSON.stringify({ source: registrationSource })],
      );
      if (referredBy && referrerRole && referredBy !== userId) {
        const rewards = referrerRewardsForRole(referrerRole);
        await query(
          `UPDATE ip_users
           SET points = points + $2,
               free_post_credits = free_post_credits + $3,
               application_allowance = application_allowance + $4,
               updated_at = now()
           WHERE id = $1`,
          [referredBy, rewards.points, rewards.freePostCredits, rewards.applicationAllowance],
        );
        await query(
          `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
           VALUES ($1,$2,$3,'referral_bonus',$4::jsonb)`,
          [newId('ip_pts'), referredBy, rewards.points, JSON.stringify({ referredUserId: userId, referrerName })],
        );
        await query(
          `INSERT INTO ip_referrals (id, referrer_user_id, referred_user_id, referral_code, status, points_awarded)
           VALUES ($1,$2,$3,$4,'completed',$5)`,
          [newId('ip_ref'), referredBy, userId, referralCode, rewards.points],
        );
        referralNotify = {
          userId: referredBy,
          title: 'Referral bonus earned',
          body: `${name} completed registration using your link. You earned +${rewards.points} points.`,
          link: referrerRole === 'employer' ? '/employer/referral' : '/candidate/referral',
          category: 'referral',
        };
      }
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }

    if (googleIdentity?.googleSub) {
      try {
        await recordGoogleIdentity({
          userId,
          googleSub: googleIdentity.googleSub,
          email: googleIdentity.email,
          name: googleIdentity.name,
          pictureUrl: googleIdentity.pictureUrl,
        });
      } catch (linkErr) {
        // Account row is already committed. Do not invent a second auth path —
        // session establishment below requires a successful link via findLinkedUser.
        console.error('[register-candidate] google identity link', linkErr.message);
      }
    }

    if (referralNotify) {
      await notifyUser(referralNotify).catch(() => {});
    }

    const common = {
      userId,
      email,
      googleIdentity,
      referrerName,
      referredBy,
    };

    try {
      const mailResult = await sendMail({
        to: email,
        subject: 'Your Internship Portal temporary password',
        html: tempPasswordEmailHtml({ name, email, password }),
        text: `Hi ${name},\nTemporary password: ${password}\nSign in and change it.`,
      });
      if (mailResult?.usedOverride) {
        return googlePathSuccessResponse({
          ...common,
          message:
            'Account created. Check your email for a temporary password, then sign in with email and password (Forgot password if you lose it). You can change the password after sign-in.',
          extra: {
            mailOverride: true,
            mailSentTo: mailResult.sentTo,
            mailCopiedTo: mailResult.copiedTo,
          },
        });
      }
      if (mailResult?.usedFallback) {
        return googlePathSuccessResponse({
          ...common,
          message:
            'Account created. A temporary password email may have been sent to an alternate delivery address. Sign in with email and password — not Google.',
          warning: `Primary inbox may have failed for ${email}. Use Forgot password if you did not receive the email.`,
          extra: {
            mailFallback: true,
            mailSentTo: mailResult.fallbackTo,
          },
        });
      }
    } catch (mailErr) {
      console.error('[register-candidate] mail', mailErr.message);
      return googlePathSuccessResponse({
        ...common,
        message:
          'Account created, but the temporary password email could not be sent. Use Forgot password on the sign-in page with your Gmail address.',
        warning: 'Password email failed. Use Forgot password to set a password, then sign in with email and password.',
        extra: { emailError: mailErr.message },
      });
    }

    return googlePathSuccessResponse({
      ...common,
      message:
        'Account created. Check your Gmail for a temporary password, then sign in with email and password. You can change it after sign-in; use Forgot password if you lose it.',
    });
  } catch (error) {
    console.error('[register-candidate]', error);
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
  }
}
