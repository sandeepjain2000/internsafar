/**
 * Idempotent pipeline schema (migrations 023 + 024).
 * Safe to run from generate / delete / reset without Next.js.
 */
async function ensureIpPipelineSchema(client) {
  const q = (sql, params) => client.query(sql, params);

  await q(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`);
  await q(`
    UPDATE ip_offers o
    SET application_id = a.id
    FROM ip_applications a
    WHERE o.application_id IS NULL
      AND a.internship_id = o.internship_id
      AND a.candidate_id = o.candidate_id
  `);
  await q(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_application_id_fkey') THEN
        ALTER TABLE ip_offers
          ADD CONSTRAINT ip_offers_application_id_fkey
          FOREIGN KEY (application_id) REFERENCES ip_applications(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  const nullOffers = await q(`SELECT count(*)::int AS n FROM ip_offers WHERE application_id IS NULL`);
  if (Number(nullOffers.rows[0].n) === 0) {
    await q(`ALTER TABLE ip_offers ALTER COLUMN application_id SET NOT NULL`);
  }

  await q(`ALTER TABLE ip_message_threads ADD COLUMN IF NOT EXISTS application_id TEXT`);
  await q(`
    UPDATE ip_message_threads t
    SET application_id = a.id
    FROM ip_candidates c
    JOIN ip_applications a ON a.candidate_id = c.id
    WHERE t.application_id IS NULL
      AND t.internship_id IS NOT NULL
      AND c.user_id = t.candidate_user_id
      AND a.internship_id = t.internship_id
  `);
  await q(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_message_threads_application_id_fkey') THEN
        ALTER TABLE ip_message_threads
          ADD CONSTRAINT ip_message_threads_application_id_fkey
          FOREIGN KEY (application_id) REFERENCES ip_applications(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS ip_generated_runs (
      run_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await q(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS generated_run_id TEXT`);
  await q(`
    UPDATE ip_users
    SET generated_run_id = NULL
    WHERE generated_run_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ip_generated_runs g WHERE g.run_id = ip_users.generated_run_id)
  `);
  await q(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_generated_run_id_fkey') THEN
        ALTER TABLE ip_users
          ADD CONSTRAINT ip_users_generated_run_id_fkey
          FOREIGN KEY (generated_run_id) REFERENCES ip_generated_runs(run_id) ON DELETE SET NULL;
      END IF;
    END $$
  `);

  const tryQ = async (sql) => {
    try {
      await q(sql);
    } catch (e) {
      if (e.code === '42P01' || e.code === '42703') return;
      throw e;
    }
  };

  await tryQ(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_applications_rejection_template_id_fkey') THEN
        ALTER TABLE ip_applications
          ADD CONSTRAINT ip_applications_rejection_template_id_fkey
          FOREIGN KEY (rejection_template_id) REFERENCES ip_rejection_templates(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);

  const fkUser = async (table, col, name) => {
    await tryQ(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
          ALTER TABLE ${table}
            ADD CONSTRAINT ${name}
            FOREIGN KEY (${col}) REFERENCES ip_users(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
  };
  await fkUser('ip_linkedin_promotions', 'reviewed_by', 'ip_linkedin_promotions_reviewed_by_fkey');
  await fkUser('ip_viral_shares', 'reviewed_by', 'ip_viral_shares_reviewed_by_fkey');
  await fkUser('ip_employer_requests', 'created_user_id', 'ip_employer_requests_created_user_id_fkey');
  await fkUser('ip_employer_requests', 'reviewer_id', 'ip_employer_requests_reviewer_id_fkey');

  await tryQ(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_recipients_message_id_fkey') THEN
        ALTER TABLE ip_bulk_message_recipients
          ADD CONSTRAINT ip_bulk_message_recipients_message_id_fkey
          FOREIGN KEY (message_id) REFERENCES ip_messages(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);

  await tryQ(
    `ALTER TABLE ip_export_jobs ADD COLUMN IF NOT EXISTS skipped_application_ids JSONB NOT NULL DEFAULT '[]'::jsonb`,
  );

  const nullEnd = await q(`SELECT count(*)::int AS n FROM ip_endorsements WHERE candidate_id IS NULL`);
  if (Number(nullEnd.rows[0].n) === 0) {
    await q(`ALTER TABLE ip_endorsements ALTER COLUMN candidate_id SET NOT NULL`);
  }
  const nullEndEmp = await q(`SELECT count(*)::int AS n FROM ip_endorsements WHERE employer_id IS NULL OR internship_id IS NULL`);
  if (Number(nullEndEmp.rows[0].n) === 0) {
    await q(`ALTER TABLE ip_endorsements ALTER COLUMN employer_id SET NOT NULL`);
    await q(`ALTER TABLE ip_endorsements ALTER COLUMN internship_id SET NOT NULL`);
  }
  await q(`ALTER TABLE ip_endorsements DROP CONSTRAINT IF EXISTS ip_endorsements_candidate_id_fkey`);
  await q(`
    ALTER TABLE ip_endorsements
      ADD CONSTRAINT ip_endorsements_candidate_id_fkey
      FOREIGN KEY (candidate_id) REFERENCES ip_candidates(id) ON DELETE CASCADE
  `);
  await q(`DELETE FROM ip_ratings WHERE internship_id IS NULL`);
  const nullRate = await q(`SELECT count(*)::int AS n FROM ip_ratings WHERE internship_id IS NULL`);
  if (Number(nullRate.rows[0].n) === 0) {
    await q(`ALTER TABLE ip_ratings ALTER COLUMN internship_id SET NOT NULL`);
  }
  await ensureIpIntegrityConstraints(client);
}

/**
 * Delete workbench / pipeline rows that can block internship or user deletes.
 */
async function deleteIpWorkbenchForActor(client, run, { userId, employerId, candidateId }) {
  if (employerId) {
    await run('export_jobs', `DELETE FROM ip_export_jobs WHERE employer_id = $1`, [employerId]);
    await run(
      'bulk_recipients',
      `DELETE FROM ip_bulk_message_recipients
       WHERE job_id IN (SELECT id FROM ip_bulk_message_jobs WHERE employer_id = $1)`,
      [employerId],
    );
    await run('bulk_jobs', `DELETE FROM ip_bulk_message_jobs WHERE employer_id = $1`, [employerId]);
    await run(
      'list_members',
      `DELETE FROM ip_employer_list_members
       WHERE list_id IN (SELECT id FROM ip_employer_lists WHERE employer_id = $1)`,
      [employerId],
    );
    await run('lists', `DELETE FROM ip_employer_lists WHERE employer_id = $1`, [employerId]);
    await run('reminders', `DELETE FROM ip_follow_up_reminders WHERE employer_id = $1`, [employerId]);
    await run('notes', `DELETE FROM ip_application_notes WHERE employer_id = $1`, [employerId]);
    await run(
      'templates',
      `DELETE FROM ip_rejection_templates WHERE employer_id = $1`,
      [employerId],
    );
    await run(
      'saved_views',
      `DELETE FROM ip_saved_applicant_views WHERE employer_id = $1`,
      [employerId],
    );
  }
  if (candidateId) {
    await run(
      'app_events',
      `DELETE FROM ip_application_events
       WHERE application_id IN (SELECT id FROM ip_applications WHERE candidate_id = $1)`,
      [candidateId],
    );
  }
  if (userId) {
    await run('filter_prefs', `DELETE FROM ip_table_filter_prefs WHERE user_id = $1`, [userId]);
    await run('export_jobs_by_user', `DELETE FROM ip_export_jobs WHERE created_by_user_id = $1`, [userId]);
    await run(
      'promo_reviewed_by',
      `UPDATE ip_linkedin_promotions SET reviewed_by = NULL WHERE reviewed_by = $1`,
      [userId],
    );
    await run(
      'viral_reviewed_by',
      `UPDATE ip_viral_shares SET reviewed_by = NULL WHERE reviewed_by = $1`,
      [userId],
    );
    await run(
      'req_reviewer',
      `UPDATE ip_employer_requests SET reviewer_id = NULL WHERE reviewer_id = $1`,
      [userId],
    );
  }
}

const INTEGRITY_BLOCKS = [
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_application_id_key') THEN
    ALTER TABLE ip_offers ADD CONSTRAINT ip_offers_application_id_key UNIQUE (application_id);
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_applications_status_check') THEN
    ALTER TABLE ip_applications ADD CONSTRAINT ip_applications_status_check
      CHECK (status IN (
        'applied','shortlisted','interviewing','rejected','hired','offered','completed','declined_offer','withdrawn'
      ));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_ratings_from_to_internship_key') THEN
    ALTER TABLE ip_ratings ADD CONSTRAINT ip_ratings_from_to_internship_key
      UNIQUE (from_user_id, to_user_id, internship_id);
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_notifications_category_check') THEN
    ALTER TABLE ip_notifications ADD CONSTRAINT ip_notifications_category_check
      CHECK (category IN ('application','referral','system','offer','interview','message'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_referrals_status_check') THEN
    ALTER TABLE ip_referrals ADD CONSTRAINT ip_referrals_status_check
      CHECK (status IN ('pending','completed','invalid'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_feature_ideas_status_check') THEN
    ALTER TABLE ip_feature_ideas ADD CONSTRAINT ip_feature_ideas_status_check
      CHECK (status IN ('Pending approval','Under review','In progress','Planned','Shipped','Declined'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_documents_review_status_check') THEN
    ALTER TABLE ip_employer_documents ADD CONSTRAINT ip_employer_documents_review_status_check
      CHECK (review_status IN ('pending','approved','flagged'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ip_users_registration_source_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%gmail_domain%'
  ) THEN
    ALTER TABLE ip_users DROP CONSTRAINT ip_users_registration_source_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_registration_source_check') THEN
    ALTER TABLE ip_users ADD CONSTRAINT ip_users_registration_source_check
      CHECK (registration_source IN ('legacy','form','google','domain','gmail_domain'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_form_approval_status_check') THEN
    ALTER TABLE ip_users ADD CONSTRAINT ip_users_form_approval_status_check
      CHECK (form_approval_status IS NULL OR form_approval_status IN ('pending','approved','rejected'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_jobs_status_check') THEN
    ALTER TABLE ip_bulk_message_jobs ADD CONSTRAINT ip_bulk_message_jobs_status_check
      CHECK (status IN ('pending','running','done'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_recipients_status_check') THEN
    ALTER TABLE ip_bulk_message_recipients ADD CONSTRAINT ip_bulk_message_recipients_status_check
      CHECK (status IN ('pending','sent','failed'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_export_jobs_status_check') THEN
    ALTER TABLE ip_export_jobs ADD CONSTRAINT ip_export_jobs_status_check
      CHECK (status IN ('pending','processing','done','failed'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_2fa_challenges_purpose_check') THEN
    ALTER TABLE ip_2fa_challenges ADD CONSTRAINT ip_2fa_challenges_purpose_check
      CHECK (purpose IN ('login','enable','disable'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_endorsements_employer_candidate_internship_key') THEN
    ALTER TABLE ip_endorsements
      ADD CONSTRAINT ip_endorsements_employer_candidate_internship_key
      UNIQUE (employer_id, candidate_id, internship_id);
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_referred_by_fkey') THEN
    ALTER TABLE ip_users
      ADD CONSTRAINT ip_users_referred_by_fkey
      FOREIGN KEY (referred_by) REFERENCES ip_users(id) ON DELETE SET NULL;
  END IF;
END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ip_referrals_pending_pair_uidx
  ON ip_referrals (referrer_user_id, referred_user_id)
  WHERE status = 'pending' AND referred_user_id IS NOT NULL`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_notification_preferences_category_check') THEN
    ALTER TABLE ip_notification_preferences
      ADD CONSTRAINT ip_notification_preferences_category_check
      CHECK (category IN ('application','interview','offer','message'));
  END IF;
END $$`,
];

async function ensureIpIntegrityConstraints(client) {
  for (const sql of INTEGRITY_BLOCKS) {
    try {
      await client.query(sql);
    } catch (e) {
      if (e.code === '42P01' || e.code === '42703') continue;
      throw e;
    }
  }
}

module.exports = {
  ensureIpPipelineSchema,
  deleteIpWorkbenchForActor,
};
