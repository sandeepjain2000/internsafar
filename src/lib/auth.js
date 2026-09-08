import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { isCaptchaBypassed, verifyLoginCaptcha, verifyCaptchaGate } from '@/lib/simpleCaptcha';
import { newId } from '@/lib/ids';
import { ROLE_HOME } from '@/lib/roleHome';
import { createAuthSession, touchAuthSession, revokeAuthSession } from '@/lib/ipAuthSessions';
import {
  createTwoFactorChallenge,
  ensureIpTwoFactorSchema,
  isTwoFactorEnabled,
  verifyTwoFactorChallenge,
} from '@/lib/ipTwoFactor';
import { consumeLoginDbFailureSimulation } from '@/lib/ipQaSimulate';
import { warnIfProductionAuthMisconfigured } from '@/lib/ipAppOrigin';
import { normalizeEmail } from '@/lib/authRegisterRules';
import {
  createGoogleVerification,
  ensureIpGoogleAuthSchema,
  findLinkedUserForGoogleLogin,
  GOOGLE_INTENT_COOKIE,
  googleIntentFromCookieHeader,
  recordGoogleIdentity,
} from '@/lib/ipGoogleAuth';

/** Default session when "Remember this device" is unchecked. */
const SESSION_SHORT_SEC = 60 * 60 * 12; // 12 hours
/** Max session when "Remember this device for 30 days" is checked. */
const SESSION_LONG_SEC = 60 * 60 * 24 * 30; // 30 days

warnIfProductionAuthMisconfigured();

/**
 * Internship Portal auth — Credentials login + Google for register verify / linked login.
 *
 * With a registration intent cookie: Google issues a single-use verification token and
 * returns to the register form (no portal session).
 *
 * Without an intent: Google may open a portal session only when ip_google_identities
 * already links that Google account to an active user (Sign up with Google completed).
 * Password-only accounts without a Google link cannot be opened via Google.
 */

async function queryWithRetry(text, params, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await query(text, params);
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 150 * (i + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

async function recordLoginEvent({ userId, email, role, success, failureReason, authMethod }) {
  try {
    const { ensureIpLoginReportSchema } = await import('@/lib/ensureIpLoginReportSchema');
    await ensureIpLoginReportSchema();
    const { ua, ip } = await requestMeta();
    await query(
      `INSERT INTO ip_login_events
         (id, user_id, email, role, success, ip_address, user_agent, auth_method, failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        newId('ip_login'),
        userId || null,
        email,
        role || null,
        success,
        ip || null,
        ua ? String(ua).slice(0, 500) : null,
        authMethod || 'Password Form',
        failureReason || null,
      ],
    );
  } catch (e) {
    console.error('[ip auth] login event write failed', e.message);
  }
}

async function requestMeta() {
  try {
    const h = await headers();
    const ua = h.get('user-agent') || '';
    const fwd = h.get('x-forwarded-for') || '';
    const ip = (fwd.split(',')[0] || h.get('x-real-ip') || '').trim();
    return { ua, ip };
  } catch {
    return { ua: '', ip: '' };
  }
}

export const authOptions = {
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        captchaToken: { label: 'Captcha token', type: 'text' },
        captchaAnswer: { label: 'Captcha answer', type: 'text' },
        rememberMe: { label: 'Remember me', type: 'text' },
        otpChallengeId: { label: '2FA challenge', type: 'text' },
        otpCode: { label: '2FA code', type: 'text' },
      },
      async authorize(credentials) {
        const rememberMe =
          credentials?.rememberMe === true ||
          String(credentials?.rememberMe || '').toLowerCase() === 'true' ||
          String(credentials?.rememberMe || '') === '1';

        // Step 2 — email OTP after password already validated
        if (credentials?.otpChallengeId && credentials?.otpCode) {
          const verified = await verifyTwoFactorChallenge(credentials.otpChallengeId, credentials.otpCode);
          if (!verified || verified.purpose !== 'login') {
            throw new Error('Invalid or expired verification code');
          }
          const result = await queryWithRetry(
            `SELECT id, email, role, name, active, profile_complete
             FROM ip_users WHERE id = $1 LIMIT 1`,
            [verified.userId],
          );
          const user = result.rows[0];
          if (!user || user.active === false) {
            throw new Error('Invalid or expired verification code');
          }
          await recordLoginEvent({ userId: user.id, email: user.email, role: user.role, success: true });
          await query(`UPDATE ip_users SET last_login_at = now() WHERE id = $1`, [user.id]);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            profileComplete: user.profile_complete,
            rememberMe,
          };
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }
        const captchaOk =
          isCaptchaBypassed() ||
          verifyCaptchaGate(credentials.captchaToken) ||
          verifyLoginCaptcha(credentials.captchaToken, credentials.captchaAnswer);
        if (!captchaOk) {
          const answerEmpty = !String(credentials.captchaAnswer ?? '').trim();
          throw new Error(
            answerEmpty
              ? 'Verification answer is required'
              : !credentials.captchaToken
                ? 'Verification question is required'
                : 'Captcha verification failed — refresh the question and try again',
          );
        }
        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        let result;
        try {
          if (consumeLoginDbFailureSimulation()) {
            throw new Error('Simulated DB connection failure');
          }
          result = await queryWithRetry(
            `SELECT id, email, password_hash, role, name, active, profile_complete, form_approval_status
             FROM ip_users
             WHERE lower(email) = $1
             LIMIT 1`,
            [email],
          );
        } catch (error) {
          console.error('[IP Auth] DB error', error.message);
          throw new Error('Unable to sign in right now. Please try again.');
        }

        const user = result.rows[0];
        if (!user) {
          await recordLoginEvent({ email, success: false, failureReason: 'Unknown account' });
          throw new Error('Invalid email or password');
        }
        if (user.active === false) {
          await recordLoginEvent({
            email,
            userId: user.id,
            role: user.role,
            success: false,
            failureReason: 'Inactive account',
          });
          if (user.form_approval_status === 'pending') {
            throw new Error('Your registration is pending SuperAdmin approval. You cannot sign in yet.');
          }
          if (user.form_approval_status === 'rejected') {
            throw new Error('Your registration was rejected. Contact support if you believe this is a mistake.');
          }
          throw new Error('Invalid email or password');
        }

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
          await recordLoginEvent({
            userId: user.id,
            email,
            role: user.role,
            success: false,
            failureReason: 'Bad Pass',
          });
          throw new Error('Invalid email or password');
        }

        await ensureIpTwoFactorSchema();
        if (await isTwoFactorEnabled(user.id)) {
          try {
            const { challengeId } = await createTwoFactorChallenge(user.id, 'login');
            // Client parses this and shows the OTP step (session not created yet).
            throw new Error(`TWO_FACTOR_REQUIRED:${challengeId}`);
          } catch (e) {
            if (String(e.message || '').startsWith('TWO_FACTOR_REQUIRED:')) throw e;
            console.error('[IP Auth] 2FA send failed', e.message);
            throw new Error('Could not send verification code. Try again in a moment.');
          }
        }

        await recordLoginEvent({ userId: user.id, email, role: user.role, success: true });
        await query(`UPDATE ip_users SET last_login_at = now() WHERE id = $1`, [user.id]);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          profileComplete: user.profile_complete,
          rememberMe,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: { prompt: 'select_account', access_type: 'online', scope: 'openid email profile' },
      },
    }),
  ],
  // Cookie ceiling = 30 days; jwt callback enforces 12h when rememberMe is false.
  session: { strategy: 'jwt', maxAge: SESSION_LONG_SEC },
  jwt: { maxAge: SESSION_LONG_SEC },
  pages: {
    signIn: '/',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') return true;

      const email = normalizeEmail(profile?.email || user?.email);
      const googleSub = profile?.sub || account?.providerAccountId || null;
      if (!email) return '/?error=GoogleNoEmail';
      // Google returns email_verified=false for some Workspace/alias cases.
      if (profile?.email_verified === false) return '/?error=GoogleEmailUnverified';

      await ensureIpGoogleAuthSchema();

      let intent = null;
      try {
        const h = await headers();
        intent = googleIntentFromCookieHeader(h.get('cookie'));
      } catch {
        intent = null;
      }

      // Verification-only: hand a single-use token back to the registration form.
      if (intent) {
        const token = await createGoogleVerification({
          email,
          googleSub,
          purpose: intent.cookieValue,
          // Google already returns these under the 'profile' scope — carry them so the
          // registration form can prefill instead of asking again.
          name: profile?.name || user?.name || '',
          pictureUrl: profile?.picture || user?.image || '',
        });
        try {
          const cookieStore = await cookies();
          cookieStore.delete(GOOGLE_INTENT_COOKIE);
        } catch {
          /* non-fatal */
        }
        return `${intent.returnTo}?gv=${encodeURIComponent(token)}`;
      }

      // No intent: allow login only for accounts already linked via Google registration.
      const linked = await findLinkedUserForGoogleLogin({ googleSub, email });
      if (!linked) {
        await recordLoginEvent({
          email,
          success: false,
          failureReason: 'Google account not linked — register with Google first',
          authMethod: 'Google OAuth',
        });
        return '/?error=GoogleAccountNotLinked';
      }
      if (linked.active === false) {
        await recordLoginEvent({
          email,
          userId: linked.id,
          role: linked.role,
          success: false,
          failureReason: 'Account inactive',
          authMethod: 'Google OAuth',
        });
        return '/?error=GoogleAccountInactive';
      }
      return true;
    },
    async jwt({ token, user, account, profile, trigger, session }) {
      if (trigger === 'update' && session?.name) {
        token.name = session.name;
      }
      if (account?.provider === 'google') {
        const email = normalizeEmail(profile?.email || user?.email);
        const googleSub = profile?.sub || account?.providerAccountId || null;
        const linked = await findLinkedUserForGoogleLogin({ googleSub, email });
        if (!linked || linked.active === false) {
          return { ...token, error: 'inactive' };
        }
        try {
          await recordGoogleIdentity({
            userId: linked.id,
            googleSub,
            email: linked.email || email,
            name: profile?.name || user?.name || linked.name || '',
            pictureUrl: profile?.picture || user?.image || '',
          });
        } catch (e) {
          console.error('[ip auth] google identity refresh failed', e.message);
        }
        token.role = linked.role;
        token.uid = linked.id;
        token.profileComplete = linked.profile_complete;
        token.rememberMe = true;
        token.authTime = Math.floor(Date.now() / 1000);
        if (linked.name) token.name = linked.name;
        else if (profile?.name || user?.name) token.name = profile?.name || user?.name;
        try {
          const { ua, ip } = await requestMeta();
          token.sid = await createAuthSession({ userId: linked.id, userAgent: ua, ip });
        } catch (e) {
          console.error('[ip auth] google session create failed', e.message);
        }
        await recordLoginEvent({
          email: linked.email || email,
          userId: linked.id,
          role: linked.role,
          success: true,
          authMethod: 'Google OAuth',
        });
        return token;
      }

      if (user?.role) {
        token.role = user.role;
        token.uid = user.id;
        token.profileComplete = user.profileComplete;
        token.rememberMe = Boolean(user.rememberMe);
        token.authTime = Math.floor(Date.now() / 1000);
        if (user.name) token.name = user.name;
        try {
          const { ua, ip } = await requestMeta();
          token.sid = await createAuthSession({ userId: user.id, userAgent: ua, ip });
        } catch (e) {
          console.error('[ip auth] session create failed', e.message);
        }
        return token;
      }

      // Enforce 12h vs 30d from login time (legacy tokens without authTime use iat).
      {
        const authTime = Number(token.authTime || token.iat || 0);
        if (authTime) {
          const limit = token.rememberMe ? SESSION_LONG_SEC : SESSION_SHORT_SEC;
          if (Math.floor(Date.now() / 1000) - authTime > limit) {
            return { ...token, error: 'expired', sid: null };
          }
        }
      }

      if (token?.uid) {
        try {
          const row = await queryWithRetry(
            `SELECT role, profile_complete, active, name FROM ip_users WHERE id = $1 LIMIT 1`,
            [token.uid],
          );
          if (!row.rows[0] || row.rows[0].active === false) {
            return { ...token, error: 'inactive' };
          }
          token.profileComplete = row.rows[0].profile_complete;
          token.role = row.rows[0].role;
          if (row.rows[0].name) token.name = row.rows[0].name;
        } catch {
          /* keep existing token on transient error */
        }

        try {
          if (!token.sid) {
            const { ua, ip } = await requestMeta();
            token.sid = await createAuthSession({ userId: token.uid, userAgent: ua, ip });
          } else {
            const ok = await touchAuthSession(token.sid, token.uid);
            if (!ok) {
              return { ...token, error: 'revoked', sid: null };
            }
          }
        } catch (e) {
          console.error('[ip auth] session touch failed', e.message);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Soft-fail tokens must not look "authenticated" with user:null — that blanked
      // PortalShell. Return an empty session, not null: the next-auth client runs
      // Object.keys() on this response, so null raises CLIENT_FETCH_ERROR. An empty
      // object is treated as "no session" and reports status 'unauthenticated'.
      if (token?.error === 'revoked' || token?.error === 'inactive' || token?.error === 'expired') {
        return {};
      }
      if (session.user) {
        session.user.id = token.uid;
        session.user.role = token.role;
        session.user.profileComplete = Boolean(token.profileComplete);
        session.user.sessionId = token.sid || null;
        if (token.name) session.user.name = token.name;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.sid && token?.uid) {
        try {
          await revokeAuthSession({ sessionId: token.sid, userId: token.uid });
        } catch (e) {
          console.error('[ip auth] signOut session revoke failed', e.message);
        }
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export { ROLE_HOME };
