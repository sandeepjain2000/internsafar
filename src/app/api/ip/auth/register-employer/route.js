import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { newId, randomPassword, referralCodeFrom } from '@/lib/ids';
import { sendMail, tempPasswordEmailHtml } from '@/lib/mail';
import { notifyRole, notifyUser } from '@/lib/ipNotify';
import { referrerRewardsForRole } from '@/lib/pointsEconomy';
import { domainFromWebsite, normalizeEmail } from '@/lib/authRegisterRules';
import { verifyLoginCaptcha } from '@/lib/simpleCaptcha';
import {
  consumeGoogleVerification,
  GOOGLE_INTENTS,
  isGoogleVerificationBypassed,
  recordGoogleIdentity,
} from '@/lib/ipGoogleAuth';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';
import { isValidBusinessEntityType } from '@/lib/employerBusinessEntity';

export async function POST(request) {
  try {
    await ensureIpFormRegistrationSchema();
    await ensureIpEmployerApprovalSchema();
    const body = await request.json();
    const website = String(body.website || '').trim();
    let email = normalizeEmail(body.email);
    const companyName = String(body.companyName || '').trim();
    const contactName = String(body.contactName || '').trim();
    const contactDesignation = String(body.designation || body.contactDesignation || '').trim();
    const businessEntityType = String(body.businessEntityType || body.business_entity_type || '').trim();
    const reason = String(body.reason || '').trim() || (contactDesignation ? `Designation: ${contactDesignation}` : '');
    const forceManual = Boolean(body.manualRequest);
    const referralCode = String(body.referralCode || '').trim() || null;
    const passwordPlain = String(body.password || '');

    // Email is optional; when provided it must look like an address. Domain↔email match
    // and consumer-mailbox checks are intentionally not enforced (non-blocking).
    if (email && !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Business entity type is optional at register (form UI has no field). Invalid/omitted
    // values are stored as null — non-blocking. Employer can set it later on profile.
    const entityTypeForDb = isValidBusinessEntityType(businessEntityType)
      ? businessEntityType
      : null;

    const webDomain = domainFromWebsite(website);

    if (forceManual) {
      if (!companyName) {
        return NextResponse.json({ error: 'Company name is required for manual requests' }, { status: 400 });
      }
      if (!contactName) {
        return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
      }
      if (!contactDesignation) {
        return NextResponse.json({ error: 'Designation / Role is required' }, { status: 400 });
      }
      if (passwordPlain.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      if (!reason) {
        return NextResponse.json({ error: 'Please explain why you need a manual account request' }, { status: 400 });
      }
      if (!verifyLoginCaptcha(body.captchaToken, body.captchaAnswer)) {
        return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 });
      }
      const passwordHash = await bcrypt.hash(passwordPlain, 10);
      const reqId = newId('ip_ereq');
      const contactEmail = email || `pending+${reqId}@no-email.local`;
      await query(
        `INSERT INTO ip_employer_requests (
           id, company_name, website, contact_email, contact_name, reason, contact_designation, password_hash,
           business_entity_type
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          reqId,
          companyName,
          website || null,
          contactEmail,
          contactName || null,
          reason,
          contactDesignation,
          passwordHash,
          entityTypeForDb,
        ],
      );
      await notifyRole({
        role: 'superadmin',
        title: 'Manual employer request',
        body: `${companyName} — ${contactEmail}`,
        link: '/superadmin/form-registrations',
        category: 'system',
      });

      return NextResponse.json({
        ok: true,
        mode: 'manual_request',
        requestId: reqId,
        message:
          'Request submitted. SuperAdmin will create your employer account after review — use the password you chose after approval.',
      });
    }

    // Website/domain is optional at register (nullable column). Google path may still send a derived URL.

    // Domain path requires a real Google verification token issued by the NextAuth
    // signIn callback, so the verified address comes from Google, not this request body.
    let googleIdentity = null;
    if (!isGoogleVerificationBypassed()) {
      const verified = await consumeGoogleVerification(
        String(body.googleVerificationToken || ''),
        GOOGLE_INTENTS.employerRegister.cookieValue,
      );
      if (!verified) {
        return NextResponse.json(
          { error: 'Google verification is required, expired, or already used. Verify with Google again.' },
          { status: 401 },
        );
      }
      googleIdentity = verified;
      if (!email) {
        email = normalizeEmail(verified.email);
      }
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Work email is required' }, { status: 400 });
    }

    // Duplicate email is decided after Google so domain path can fall back to verified email.
    const existing = await query(`SELECT id FROM ip_users WHERE lower(email) = $1`, [email]);
    if (existing.rows[0]) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const password = randomPassword(12);
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = newId('ip_user');
    const employerId = newId('ip_emp');
    const name = contactName || companyName || email.split('@')[0];
    const companyForDb = companyName || webDomain || email.split('@')[0] || 'Employer';
    const websiteForDb = website || null;

    let referredBy = null;
    let referrerRole = null;
    let referralNotify = null;
    if (referralCode) {
      const ref = await query(`SELECT id, role FROM ip_users WHERE referral_code = $1 LIMIT 1`, [referralCode]);
      if (ref.rows[0]) {
        referredBy = ref.rows[0].id;
        referrerRole = ref.rows[0].role;
      }
    }

    await query('BEGIN');
    try {
      await query(
        `INSERT INTO ip_users (
           id, email, password_hash, role, name, points, free_post_credits, referral_code, referred_by,
           registration_source, form_approval_status, active
         ) VALUES ($1,$2,$3,'employer',$4,50,1,$5,$6,'domain',null,true)`,
        [userId, email, passwordHash, name, referralCodeFrom(name), referredBy],
      );
      await query(
        `INSERT INTO ip_employers (
           id, user_id, company_name, website, work_email, contact_name, contact_designation,
           business_entity_type, approval_status
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
        [
          employerId,
          userId,
          companyForDb,
          websiteForDb,
          email,
          contactName || name,
          contactDesignation || null,
          entityTypeForDb,
        ],
      );
      await query(
        `INSERT INTO ip_points_ledger (id, user_id, delta, reason) VALUES ($1,$2,50,'default_signup')`,
        [newId('ip_pts'), userId],
      );
      if (referredBy && referrerRole) {
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
          `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta) VALUES ($1,$2,$3,'referral_bonus',$4::jsonb)`,
          [newId('ip_pts'), referredBy, rewards.points, JSON.stringify({ referredUserId: userId })],
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
      await recordGoogleIdentity({
        userId,
        googleSub: googleIdentity.googleSub,
        email: googleIdentity.email,
        name: googleIdentity.name,
        pictureUrl: googleIdentity.pictureUrl,
      }).catch(() => {});
    }

    if (referralNotify) {
      await notifyUser(referralNotify).catch(() => {});
    }

    await notifyRole({
      role: 'superadmin',
      title: 'New employer registered',
      body: `${companyForDb} — ${email} (pending approval)`,
      link: '/superadmin/approvals',
      category: 'system',
    });

    try {
      const mailResult = await sendMail({
        to: email,
        subject: 'Your Internship Portal employer account',
        html: tempPasswordEmailHtml({ name, email, password }),
        text: `Temporary password: ${password}`,
      });
      if (mailResult?.usedOverride) {
        return NextResponse.json({
          ok: true,
          mode: 'auto',
          userId,
          mailOverride: true,
          mailSentTo: mailResult.sentTo,
          mailCopiedTo: mailResult.copiedTo,
          message:
            'Employer account created (pending SuperAdmin approval). Password emailed.',
        });
      }
      if (mailResult?.usedFallback) {
        return NextResponse.json({
          ok: true,
          mode: 'auto',
          userId,
          mailFallback: true,
          mailSentTo: mailResult.fallbackTo,
          message: `Employer account created (pending approval). We could not deliver mail to ${email}; a copy was sent to an alternate delivery address. Check your inbox (and spam).`,
          warning: `Primary inbox failed. If you did not receive a password email, contact support.`,
        });
      }
    } catch (mailErr) {
      console.error('[register-employer] mail', mailErr.message);
      return NextResponse.json({
        ok: true,
        mode: 'auto',
        userId,
        warning: 'Account created but email failed to send.',
        emailError: mailErr.message,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: 'auto',
      userId,
      message: 'Employer account created (pending SuperAdmin approval). Password emailed to your work inbox.',
    });
  } catch (error) {
    console.error('[register-employer]', error);
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
  }
}
