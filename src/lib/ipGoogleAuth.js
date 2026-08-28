import crypto from 'crypto';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { normalizeEmail } from '@/lib/authRegisterRules';

/**
 * Real Google OAuth support tables.
 *
 * ip_google_identities  — proof that a user account has completed Google OAuth.
 *                         This table (not the registration_source string) is the
 *                         source of truth for "OAuth verified".
 * ip_google_verifications — short-lived, single-use handoff tokens for flows that
 *                         need to *verify* a Google account mid-registration
 *                         without creating a portal session.
 */

const VERIFICATION_TTL_MS = 10 * 60 * 1000;

/**
 * Registration intents that may consume a verification token.
 * Google is verification-only in this portal: every Google sign-in must carry one of
 * these intents, and none of them create a session.
 */
export const GOOGLE_INTENTS = {
  employerRegister: { cookieValue: 'employer-register', returnTo: '/register/employer' },
  candidateRegister: { cookieValue: 'candidate-register', returnTo: '/register/candidate' },
};

export const GOOGLE_INTENT_COOKIE = 'ip_google_intent';

let schemaReady = false;

export async function ensureIpGoogleAuthSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ip_google_identities (
      user_id text PRIMARY KEY REFERENCES ip_users(id) ON DELETE CASCADE,
      google_sub text NOT NULL,
      email text NOT NULL,
      name text,
      picture_url text,
      first_verified_at timestamptz NOT NULL DEFAULT now(),
      last_verified_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE ip_google_identities ADD COLUMN IF NOT EXISTS name text`);
  await query(`ALTER TABLE ip_google_identities ADD COLUMN IF NOT EXISTS picture_url text`);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ip_google_identities_sub_uidx ON ip_google_identities (google_sub)`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS ip_google_verifications (
      id text PRIMARY KEY,
      token_hash text NOT NULL UNIQUE,
      email text NOT NULL,
      google_sub text,
      name text,
      picture_url text,
      purpose text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz
    )
  `);
  await query(`ALTER TABLE ip_google_verifications ADD COLUMN IF NOT EXISTS name text`);
  await query(`ALTER TABLE ip_google_verifications ADD COLUMN IF NOT EXISTS picture_url text`);
  schemaReady = true;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Issue a single-use token proving a Google account was just verified. */
export async function createGoogleVerification({ email, googleSub, purpose, name, pictureUrl }) {
  await ensureIpGoogleAuthSchema();
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO ip_google_verifications
       (id, token_hash, email, google_sub, name, picture_url, purpose, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' milliseconds')::interval)`,
    [
      newId('ip_gver'),
      hashToken(token),
      normalizeEmail(email),
      googleSub ? String(googleSub) : null,
      name ? String(name).trim().slice(0, 200) : null,
      pictureUrl ? String(pictureUrl).slice(0, 500) : null,
      String(purpose),
      String(VERIFICATION_TTL_MS),
    ],
  );
  return token;
}

/** Read a token without spending it (used to show the verified email in the UI). */
export async function peekGoogleVerification(token, purpose) {
  if (!token) return null;
  await ensureIpGoogleAuthSchema();
  const res = await query(
    `SELECT email, google_sub, name, picture_url FROM ip_google_verifications
     WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
     LIMIT 1`,
    [hashToken(token), String(purpose)],
  );
  return res.rows[0] ? toVerification(res.rows[0]) : null;
}

function toVerification(row) {
  return {
    email: row.email,
    googleSub: row.google_sub,
    name: row.name || '',
    pictureUrl: row.picture_url || '',
  };
}

/** Spend a token. Returns the verified Google email, or null if invalid/expired/used. */
export async function consumeGoogleVerification(token, purpose) {
  if (!token) return null;
  await ensureIpGoogleAuthSchema();
  const res = await query(
    `UPDATE ip_google_verifications
     SET consumed_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
     RETURNING email, google_sub, name, picture_url`,
    [hashToken(token), String(purpose)],
  );
  return res.rows[0] ? toVerification(res.rows[0]) : null;
}

/** Record that this account really did complete Google OAuth. */
export async function recordGoogleIdentity({ userId, googleSub, email, name, pictureUrl }) {
  if (!userId || !googleSub) return;
  await ensureIpGoogleAuthSchema();
  await query(
    `INSERT INTO ip_google_identities (user_id, google_sub, email, name, picture_url)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE
       SET last_verified_at = now(),
           email = EXCLUDED.email,
           name = coalesce(EXCLUDED.name, ip_google_identities.name),
           picture_url = coalesce(EXCLUDED.picture_url, ip_google_identities.picture_url)`,
    [userId, String(googleSub), normalizeEmail(email), name || null, pictureUrl || null],
  );
}

/** Parse the registration intent the client set before starting Google sign-in. */
export function googleIntentFromCookieHeader(cookieHeader) {
  const raw = String(cookieHeader || '');
  const match = raw.match(new RegExp(`(?:^|;\\s*)${GOOGLE_INTENT_COOKIE}=([^;]+)`));
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  const entry = Object.values(GOOGLE_INTENTS).find((i) => i.cookieValue === value);
  return entry || null;
}
