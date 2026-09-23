import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { newId, referralCodeFrom } from '@/lib/ids';
import { sendMail } from '@/lib/mail';
import { notifyRole, notifyUser } from '@/lib/ipNotify';
import { referrerRewardsForRole } from '@/lib/pointsEconomy';
import { domainFromWebsite, normalizeEmail } from '@/lib/authRegisterRules';
import { verifyLoginCaptcha } from '@/lib/simpleCaptcha';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';
import { isValidBusinessEntityType } from '@/lib/employerBusinessEntity';
import { classifyEmployerEmail } from '@/lib/ipEmailClassification';
import {
  ensureIpEmployerEmailVerifySchema,
  sendEmployerEmailVerification,
} from '@/lib/ipEmployerEmailVerify';
import { isEmployerRegisterQaExposureEnabled } from '@/lib/ipQaEmployerRegister';

/**
 * Employer registration — Domain-based or Free-email-based.
 * Both create a pending employer account, require captcha + email verify + SuperAdmin approval to post.
 */
export async function POST(request) {
  try {
    await ensureIpFormRegistrationSchema();
    await ensureIpEmployerApprovalSchema();
    await ensureIpEmployerEmailVerifySchema();
    const body = await request.json();
    if (body.manualRequest) {
      return NextResponse.json(
        {
          error:
            'Manual employer requests are no longer accepted. Register with Domain or Free-email on /register/employer.',
        },
        { status: 410 },
      );
    }
    const website = String(body.website || '').trim();
    let email = normalizeEmail(body.email);
    const companyName = String(body.companyName || '').trim();
    const contactName = String(body.contactName || '').trim();
    const contactDesignation = String(body.designation || body.contactDesignation || '').trim();
    const businessEntityType = String(body.businessEntityType || body.business_entity_type || '').trim();
    const referralCode = String(body.referralCode || '').trim() || null;
    const passwordPlain = String(body.password || '');
    const pathRaw = String(body.path || body.registrationPath || '').trim().toLowerCase();
    const registrationPath =
      pathRaw === 'domain' || pathRaw === 'free_email' || pathRaw === 'free-email'
        ? pathRaw.replace('-', '_')
        : 'domain';

    if (email && !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const entityTypeForDb = isValidBusinessEntityType(businessEntityType)
      ? businessEntityType
      : null;

    const webDomain = domainFromWebsite(website);

    // Unified Domain / Free-email: create pending employer + email verification.
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Work email is required' }, { status: 400 });
    }
    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
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
    if (!verifyLoginCaptcha(body.captchaToken, body.captchaAnswer)) {
      return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 });
    }
    if (registrationPath === 'domain' && !website) {
      return NextResponse.json({ error: 'Company domain / website is required for Domain-based registration' }, { status: 400 });
    }

    const existing = await query(`SELECT id FROM ip_users WHERE lower(email) = $1`, [email]);
    if (existing.rows[0]) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    let classification = {
      softFail: false,
      summary: null,
      reasons: [],
    };
    if (registrationPath === 'domain') {
      classification = await classifyEmployerEmail(email);
    }

    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    const userId = newId('ip_user');
    const employerId = newId('ip_emp');
    const name = contactName || companyName || email.split('@')[0];
    const companyForDb = companyName || webDomain || email.split('@')[0] || 'Employer';
    const websiteForDb = website || null;
    const registrationSource = registrationPath === 'domain' ? 'domain' : 'free_email';
    const softFail = Boolean(classification.softFail);
    const classSummary = classification.summary || null;
    const classReasons = Array.isArray(classification.reasons)
      ? classification.reasons.join(',')
      : null;

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
           registration_source, active, email_verify_required, email_verified_at
         ) VALUES ($1,$2,$3,'employer',$4,50,1,$5,$6,$7,true,true,null)`,
        [userId, email, passwordHash, name, referralCodeFrom(name), referredBy, registrationSource],
      );
      await query(
        `INSERT INTO ip_employers (
           id, user_id, company_name, website, work_email, contact_name, contact_designation,
           business_entity_type, approval_status,
           email_soft_fail, email_classification_summary, email_classification_reasons
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11)`,
        [
          employerId,
          userId,
          companyForDb,
          websiteForDb,
          email,
          contactName || name,
          contactDesignation || null,
          entityTypeForDb,
          softFail,
          classSummary,
          classReasons,
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

    if (referralNotify) {
      await notifyUser(referralNotify).catch(() => {});
    }

    const softLabel = softFail ? ' [email soft-flag]' : '';
    await notifyRole({
      role: 'superadmin',
      title: softFail ? 'Employer register — review email' : 'New employer registered',
      body: `${companyForDb} — ${email} (${registrationPath}, pending approval)${softLabel}`,
      link: '/superadmin/approvals',
      category: 'system',
    });

    let verifyWarning = null;
    const qaOutboundMails = [];
    let qaVerifyUrl = null;

    const verifyResult = await sendEmployerEmailVerification({
      userId,
      email,
      name,
      requestUrl: request.url,
    });
    if (!verifyResult.mailOk) {
      console.error('[register-employer] verify mail', verifyResult.mailError);
      verifyWarning =
        'Account created but verification email failed to send. Contact support if you did not receive it.';
    }
    qaOutboundMails.push({
      purpose: 'employer_email_verify',
      to: verifyResult.to,
      subject: verifyResult.subject,
      mailOk: Boolean(verifyResult.mailOk),
    });
    if (isEmployerRegisterQaExposureEnabled()) {
      qaVerifyUrl = verifyResult.verifyUrl || null;
    }

    const ackSubject = 'InternSafar employer registration received';
    let ackMailOk = false;
    try {
      await sendMail({
        to: email,
        subject: ackSubject,
        html: `<p>Hi ${name},</p>
          <p>Your employer account for <strong>${companyForDb}</strong> was created and is pending SuperAdmin approval.</p>
          <p>Please confirm ownership of this inbox using the separate verification email we sent. You can sign in after SuperAdmin approval; posting also requires a verified email.</p>
          <p>— InternSafar</p>`,
        text: `Hi ${name},\nYour employer account for ${companyForDb} is pending SuperAdmin approval. Confirm your email via the verification link we sent.\n`,
      });
      ackMailOk = true;
    } catch (mailErr) {
      console.error('[register-employer] ack mail', mailErr.message);
    }
    qaOutboundMails.push({
      purpose: 'employer_register_ack',
      to: email,
      subject: ackSubject,
      mailOk: ackMailOk,
    });

    const payload = {
      ok: true,
      mode: registrationPath,
      userId,
      softFail,
      classificationSummary: classSummary,
      warning: verifyWarning || undefined,
      message:
        'Account created. Check your inbox to verify your email, then sign in to upload documents. Postings unlock after SuperAdmin approval.',
    };
    if (isEmployerRegisterQaExposureEnabled()) {
      payload.qaVerifyUrl = qaVerifyUrl;
      payload.qaOutboundMails = qaOutboundMails;
      // Employers choose their password at register — there is no temp-password email.
      payload.qaNote =
        'Employer registration uses the password submitted on the form (no temporary password email).';
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[register-employer]', error);
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
  }
}
