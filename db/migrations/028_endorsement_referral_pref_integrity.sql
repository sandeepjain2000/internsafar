-- Endorsement uniqueness, referred_by FK, one pending referral per pair,
-- notification-preference category CHECK.
-- Also drop unconnected QA leftover offers: pending letter while application
-- is still 'applied', with no events/threads/notifications. Does NOT touch
-- core accepted offers.

DELETE FROM ip_offers o
USING ip_applications a
WHERE o.application_id = a.id
  AND o.status = 'pending'
  AND a.status = 'applied'
  AND NOT EXISTS (
    SELECT 1 FROM ip_application_events ev WHERE ev.application_id = a.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM ip_message_threads t WHERE t.application_id = a.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM ip_notifications n
    WHERE n.meta->>'offerId' = o.id OR n.meta->>'offer_id' = o.id
  );

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_endorsements_employer_candidate_internship_key') THEN
    ALTER TABLE ip_endorsements
      ADD CONSTRAINT ip_endorsements_employer_candidate_internship_key
      UNIQUE (employer_id, candidate_id, internship_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_referred_by_fkey') THEN
    ALTER TABLE ip_users
      ADD CONSTRAINT ip_users_referred_by_fkey
      FOREIGN KEY (referred_by) REFERENCES ip_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ip_referrals_pending_pair_uidx
  ON ip_referrals (referrer_user_id, referred_user_id)
  WHERE status = 'pending' AND referred_user_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_notification_preferences_category_check') THEN
    ALTER TABLE ip_notification_preferences
      ADD CONSTRAINT ip_notification_preferences_category_check
      CHECK (category IN ('application', 'interview', 'offer', 'message'));
  END IF;
END $$;
