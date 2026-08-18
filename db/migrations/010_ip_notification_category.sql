-- Notification category for inbox filters (application | referral | system).
ALTER TABLE ip_notifications ADD COLUMN IF NOT EXISTS category text DEFAULT 'system';
