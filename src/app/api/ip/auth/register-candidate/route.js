import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { newId, randomPassword, referralCodeFrom } from '@/lib/ids';
import { sendMail, tempPasswordEmailHtml } from '@/lib/mail';
import { notifyRole, notifyUser } from '@/lib/ipNotify';
import { referrerRewardsForRole } from '@/lib/pointsEconomy';
import { isGmailAddress, normalizeEmail } from '@/lib/authRegisterRules';
import { verifyLoginCaptcha } from '@/lib/simpleCaptcha';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import {
  ensureIpReferralExtraSchema,
  insertPendingReferral,
  recordInvalidReferralAttempt,
} from '@/lib/ipReferralCredit';

/**
 * Candidate registration.
 * - path=google (default): Gmail-only + captcha, system temp password emailed, active immediately.
 * - path=form: Gmail-only + user password + college + graduationYear + captcha;
 *   account stays inactive until SuperAdmin approves (form_approval_status=pending).
 */
export async function POST(request) {
  try {
    await ensureIpFormRegistrationSchema();
    await ensureIpReferralExtraSchema();
    const body = await request.json();
    const path = String(body.path || 'google').toLowerCase() === 'form' ? 'form' : 'google';
    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim() || email.split('@')[0];
    const referralCode = String(body.referralCode || '').trim() || null;
    const college = String(body.university || body.college || '').trim() || null;
    const graduationYear = body.graduationYear != null && body.graduationYear !== ''
      ? Number(body.graduationYear)
      : null;
    const passwordPlain = String(body.password || '');

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

    if (path === 'form') {
      if (!college) {
        return NextResponse.json({ error: 'University / Institute is required' }, { status: 400 });
      }
      if (!graduationYear || Number.isNaN(graduationYear)) {
        return NextResponse.json({ error: 'Graduation year is required' }, { status: 400 });
      }
      if (passwordPlain.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
    }

    if (!verifyLoginCaptcha(body.captchaToken, body.captchaAnswer)) {
      return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 });
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

    const password = path === 'form' ? passwordPlain : randomPassword(12);
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = newId('ip_user');
    const candidateId = newId('ip_cand');
    const myReferral = referralCodeFrom(name);
    const active = path !== 'form';
    const formApproval = path === 'form' ? 'pending' : null;
    const registrationSource = path === 'form' ? 'form' : 'google';

    await query('BEGIN');
    try {
      await query(
        `INSERT INTO ip_users (
           id, email, password_hash, role, name, points, application_allowance, referral_code, referred_by,
           active, registration_source, form_approval_status
         ) VALUES ($1,$2,$3,'candidate',$4,50,10,$5,$6,$7,$8,$9)`,
        [userId, email, passwordHash, name, myReferral, referredBy, active, registrationSource, formApproval],
      );
      await query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, graduation_year)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [candidateId, userId, name, email, college, graduationYear],
      );
      await query(
        `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
         VALUES ($1,$2,50,'default_signup',$3::jsonb)`,
        [newId('ip_pts'), userId, JSON.stringify({ source: registrationSource })],
      );
      if (referredBy && referrerRole && referredBy !== userId) {
        if (path === 'form') {
          await insertPendingReferral({
            referrerUserId: referredBy,
            referredUserId: userId,
            referralCode,
          });
          referralNotify = {
            userId: referredBy,
            title: 'New referral signup',
            body: 'A candidate registered using your invite link. Points credit after SuperAdmin approval.',
            link: referrerRole === 'employer' ? '/employer/referral' : '/candidate/referral',
            category: 'referral',
          };
        } else {
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
      }
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }

    if (referralNotify) {
      await notifyUser(referralNotify).catch(() => {});
    }

    if (path === 'form') {
      await notifyRole({
        role: 'superadmin',
        title: 'Candidate form registration',
        body: `${name} — ${email} (pending approval)`,
        link: '/superadmin/form-registrations',
        category: 'system',
      }).catch(() => {});

      return NextResponse.json({
        ok: true,
        mode: 'form_pending',
        userId,
        message:
          'Registration submitted. A SuperAdmin must approve your account before you can sign in. You will use the password you chose after approval.',
      });
    }

    try {
      const mailResult = await sendMail({
        to: email,
        subject: 'Your Internship Portal temporary password',
        html: tempPasswordEmailHtml({ name, email, password }),
        text: `Hi ${name},\nTemporary password: ${password}\nSign in and change it.`,
      });
      if (mailResult?.usedOverride) {
        return NextResponse.json({
          ok: true,
          mode: 'google',
          userId,
          referredByName: referrerName || null,
          startingPoints: 50,
          referralApplied: Boolean(referredBy && referredBy !== userId),
          mailOverride: true,
          mailSentTo: mailResult.sentTo,
          message:
            'Account created. Temporary password emailed. Sign in on the login page with that password.',
        });
      }
      if (mailResult?.usedFallback) {
        return NextResponse.json({
          ok: true,
          mode: 'google',
          userId,
          referredByName: referrerName || null,
          startingPoints: 50,
          referralApplied: Boolean(referredBy && referredBy !== userId),
          mailFallback: true,
          mailSentTo: mailResult.fallbackTo,
          message: `Account created. We could not deliver mail to ${email}; a copy was sent to an alternate delivery address. Check your inbox (and spam), then sign in.`,
          warning: `Primary inbox failed. If you did not receive a password email, contact support.`,
        });
      }
    } catch (mailErr) {
      console.error('[register-candidate] mail', mailErr.message);
      return NextResponse.json({
        ok: true,
        mode: 'google',
        userId,
        referredByName: referrerName || null,
        startingPoints: 50,
        referralApplied: Boolean(referredBy && referredBy !== userId),
        warning: 'Account created but email failed to send. Contact support for password reset.',
        emailError: mailErr.message,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: 'google',
      userId,
      referredByName: referrerName || null,
      startingPoints: 50,
      referralApplied: Boolean(referredBy && referredBy !== userId),
      message:
        'Account created. Temporary password emailed to your Gmail. Sign in on the login page with that password.',
    });
  } catch (error) {
    console.error('[register-candidate]', error);
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
  }
}
