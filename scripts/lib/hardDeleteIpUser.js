/**
 * Hard-delete an Internship Portal (`ip_*`) user with full cascade cleanup.
 *
 * Use for domain-register email testing so employers/candidates can be removed
 * without orphaned internships, offers, messages, etc.
 *
 * Prefer this over bare `DELETE FROM ip_users` — some FKs are SET NULL and would
 * leave dangling rows; this utility deletes them explicitly inside one transaction.
 *
 * @module scripts/lib/hardDeleteIpUser
 */

/** Tables we check/delete (for dry-run counts). Optional tables skipped if missing. */
const COUNT_QUERIES = {
  messages_as_sender: `SELECT count(*)::int AS n FROM ip_messages WHERE sender_user_id = $1`,
  threads_as_party: `SELECT count(*)::int AS n FROM ip_message_threads WHERE candidate_user_id = $1 OR employer_user_id = $1`,
  ratings: `SELECT count(*)::int AS n FROM ip_ratings WHERE from_user_id = $1 OR to_user_id = $1`,
  notifications: `SELECT count(*)::int AS n FROM ip_notifications WHERE user_id = $1`,
  points_ledger: `SELECT count(*)::int AS n FROM ip_points_ledger WHERE user_id = $1`,
  password_resets: `SELECT count(*)::int AS n FROM ip_password_resets WHERE user_id = $1`,
  login_events: `SELECT count(*)::int AS n FROM ip_login_events WHERE user_id = $1`,
  auth_sessions: `SELECT count(*)::int AS n FROM ip_auth_sessions WHERE user_id = $1`,
  viral_shares: `SELECT count(*)::int AS n FROM ip_viral_shares WHERE user_id = $1`,
  feature_idea_votes: `SELECT count(*)::int AS n FROM ip_feature_idea_votes WHERE user_id = $1`,
  feature_idea_comments: `SELECT count(*)::int AS n FROM ip_feature_idea_comments WHERE author_user_id = $1`,
  referrals_as_referrer: `SELECT count(*)::int AS n FROM ip_referrals WHERE referrer_user_id = $1`,
  referrals_as_referred: `SELECT count(*)::int AS n FROM ip_referrals WHERE referred_user_id = $1`,
};

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name],
  );
  return Boolean(r.rows[0]);
}

async function safeCount(client, sql, params) {
  try {
    const r = await client.query(sql, params);
    return Number(r.rows[0]?.n || 0);
  } catch {
    return 0;
  }
}

/**
 * Resolve ip_users row by email or id.
 * @param {import('pg').Client|import('pg').PoolClient} client
 * @param {{ email?: string, userId?: string }} lookup
 */
async function findIpUser(client, lookup) {
  if (lookup.userId) {
    const r = await client.query(
      `SELECT id, email, role, name, active FROM ip_users WHERE id = $1`,
      [lookup.userId],
    );
    return r.rows[0] || null;
  }
  const email = String(lookup.email || '')
    .trim()
    .toLowerCase();
  if (!email) return null;
  const r = await client.query(
    `SELECT id, email, role, name, active FROM ip_users WHERE lower(email) = $1`,
    [email],
  );
  return r.rows[0] || null;
}

/**
 * Preview what would be deleted (no writes).
 */
async function previewHardDeleteIpUser(client, lookup) {
  const user = await findIpUser(client, lookup);
  if (!user) {
    return { found: false, user: null, counts: {} };
  }

  const cand = await client.query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [user.id]);
  const emp = await client.query(`SELECT id FROM ip_employers WHERE user_id = $1`, [user.id]);
  const candidateId = cand.rows[0]?.id || null;
  const employerId = emp.rows[0]?.id || null;

  const counts = {};
  for (const [key, sql] of Object.entries(COUNT_QUERIES)) {
    if (key === 'viral_shares' && !(await tableExists(client, 'ip_viral_shares'))) {
      counts[key] = 0;
      continue;
    }
    counts[key] = await safeCount(client, sql, [user.id]);
  }

  if (employerId) {
    counts.employer_documents = await safeCount(
      client,
      `SELECT count(*)::int AS n FROM ip_employer_documents WHERE employer_id = $1`,
      [employerId],
    );
    counts.internships = await safeCount(
      client,
      `SELECT count(*)::int AS n FROM ip_internships WHERE employer_id = $1`,
      [employerId],
    );
    counts.offers_as_employer = await safeCount(
      client,
      `SELECT count(*)::int AS n FROM ip_offers WHERE employer_id = $1`,
      [employerId],
    );
    if (await tableExists(client, 'ip_linkedin_promotions')) {
      counts.linkedin_promotions = await safeCount(
        client,
        `SELECT count(*)::int AS n FROM ip_linkedin_promotions WHERE employer_id = $1`,
        [employerId],
      );
    }
  }

  if (candidateId) {
    counts.applications = await safeCount(
      client,
      `SELECT count(*)::int AS n FROM ip_applications WHERE candidate_id = $1`,
      [candidateId],
    );
    counts.offers_as_candidate = await safeCount(
      client,
      `SELECT count(*)::int AS n FROM ip_offers WHERE candidate_id = $1`,
      [candidateId],
    );
    if (await tableExists(client, 'ip_saved_internships')) {
      counts.saved_internships = await safeCount(
        client,
        `SELECT count(*)::int AS n FROM ip_saved_internships WHERE candidate_id = $1`,
        [candidateId],
      );
    }
  }

  counts.endorsements = await safeCount(
    client,
    `SELECT count(*)::int AS n FROM ip_endorsements
     WHERE ($1::text IS NOT NULL AND candidate_id = $1)
        OR ($2::text IS NOT NULL AND employer_id = $2)`,
    [candidateId, employerId],
  );

  counts.employer_requests_by_email = await safeCount(
    client,
    `SELECT count(*)::int AS n FROM ip_employer_requests
     WHERE lower(contact_email) = lower($1) OR created_user_id = $2`,
    [user.email, user.id],
  );

  return {
    found: true,
    user,
    candidateId,
    employerId,
    counts,
  };
}

/**
 * Hard-delete user + related ip_* rows in one transaction.
 *
 * @param {import('pg').Client|import('pg').PoolClient} client
 * @param {{ email?: string, userId?: string, dryRun?: boolean, allowSuperadmin?: boolean }} opts
 * @returns {Promise<{ ok: boolean, dryRun?: boolean, preview?: object, deleted?: object }>}
 */
async function hardDeleteIpUser(client, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const preview = await previewHardDeleteIpUser(client, opts);
  if (!preview.found) {
    return { ok: false, error: 'User not found', preview };
  }

  if (preview.user.role === 'superadmin' && !opts.allowSuperadmin) {
    return {
      ok: false,
      error: 'Refusing to delete superadmin without allowSuperadmin: true',
      preview,
    };
  }

  if (dryRun) {
    return { ok: true, dryRun: true, preview };
  }

  const userId = preview.user.id;
  const email = preview.user.email;
  const candidateId = preview.candidateId;
  const employerId = preview.employerId;
  const deleted = {};

  const run = async (label, sql, params = []) => {
    try {
      const r = await client.query(sql, params);
      deleted[label] = r.rowCount ?? 0;
    } catch (e) {
      // Missing optional table — ignore
      if (e.code === '42P01') {
        deleted[label] = 0;
        return;
      }
      throw e;
    }
  };

  await client.query('BEGIN');
  try {
    // Messages / threads first (avoid sender FK issues while pruning)
    await run(
      'messages_in_user_threads',
      `DELETE FROM ip_messages WHERE thread_id IN (
         SELECT id FROM ip_message_threads
         WHERE candidate_user_id = $1 OR employer_user_id = $1
       )`,
      [userId],
    );
    await run(`messages_as_sender`, `DELETE FROM ip_messages WHERE sender_user_id = $1`, [userId]);
    await run(
      'message_threads',
      `DELETE FROM ip_message_threads WHERE candidate_user_id = $1 OR employer_user_id = $1`,
      [userId],
    );

    await run(
      'ratings',
      `DELETE FROM ip_ratings WHERE from_user_id = $1 OR to_user_id = $1`,
      [userId],
    );

    await run(
      'endorsements',
      `DELETE FROM ip_endorsements
       WHERE ($1::text IS NOT NULL AND candidate_id = $1)
          OR ($2::text IS NOT NULL AND employer_id = $2)`,
      [candidateId, employerId],
    );

    if (employerId) {
      await run(
        'linkedin_promotions',
        `DELETE FROM ip_linkedin_promotions WHERE employer_id = $1`,
        [employerId],
      );
      await run(
        'employer_documents',
        `DELETE FROM ip_employer_documents WHERE employer_id = $1`,
        [employerId],
      );
      // Offers / applications / saved cascade from internships, but delete offers tied to employer explicitly
      await run(`offers_as_employer`, `DELETE FROM ip_offers WHERE employer_id = $1`, [employerId]);
      await run(`internships`, `DELETE FROM ip_internships WHERE employer_id = $1`, [employerId]);
      await run(`employer_profile`, `DELETE FROM ip_employers WHERE id = $1`, [employerId]);
    }

    if (candidateId) {
      await run(
        'saved_internships',
        `DELETE FROM ip_saved_internships WHERE candidate_id = $1`,
        [candidateId],
      );
      await run(`offers_as_candidate`, `DELETE FROM ip_offers WHERE candidate_id = $1`, [candidateId]);
      await run(
        'applications',
        `DELETE FROM ip_applications WHERE candidate_id = $1`,
        [candidateId],
      );
      await run(`candidate_profile`, `DELETE FROM ip_candidates WHERE id = $1`, [candidateId]);
    }

    await run(`viral_shares`, `DELETE FROM ip_viral_shares WHERE user_id = $1`, [userId]);
    await run(`notifications`, `DELETE FROM ip_notifications WHERE user_id = $1`, [userId]);
    await run(`points_ledger`, `DELETE FROM ip_points_ledger WHERE user_id = $1`, [userId]);
    await run(`password_resets`, `DELETE FROM ip_password_resets WHERE user_id = $1`, [userId]);
    await run(`login_events`, `DELETE FROM ip_login_events WHERE user_id = $1`, [userId]);
    await run(`auth_sessions`, `DELETE FROM ip_auth_sessions WHERE user_id = $1`, [userId]);
    await run(`feature_idea_votes`, `DELETE FROM ip_feature_idea_votes WHERE user_id = $1`, [userId]);
    await run(
      'feature_idea_comments',
      `DELETE FROM ip_feature_idea_comments WHERE author_user_id = $1`,
      [userId],
    );
    await run(
      'feature_ideas_null_author',
      `UPDATE ip_feature_ideas SET author_user_id = NULL WHERE author_user_id = $1`,
      [userId],
    );

    await run(`referrals_as_referrer`, `DELETE FROM ip_referrals WHERE referrer_user_id = $1`, [userId]);
    await run(
      'referrals_clear_referred',
      `UPDATE ip_referrals SET referred_user_id = NULL WHERE referred_user_id = $1`,
      [userId],
    );

    await run(
      'employer_requests',
      `DELETE FROM ip_employer_requests
       WHERE lower(contact_email) = lower($1) OR created_user_id = $2`,
      [email, userId],
    );

    await run(`user`, `DELETE FROM ip_users WHERE id = $1`, [userId]);

    await client.query('COMMIT');
    return {
      ok: true,
      dryRun: false,
      preview,
      deleted,
      email,
      userId,
      role: preview.user.role,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

module.exports = {
  findIpUser,
  previewHardDeleteIpUser,
  hardDeleteIpUser,
};
