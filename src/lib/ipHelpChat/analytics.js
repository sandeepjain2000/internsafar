import { query } from '@/lib/db';
import { newId } from '@/lib/ids';

let schemaReady = false;

export async function ensureIpHelpChatAnalyticsSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ip_help_chat_events (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      user_id text,
      role text,
      topic text,
      fallback_state text,
      success boolean NOT NULL DEFAULT false,
      latency_ms integer,
      model text,
      knowledge_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      pathname text,
      feedback text,
      feedback_reason text,
      unanswered boolean NOT NULL DEFAULT false
    )
  `);
  await query(`ALTER TABLE ip_help_chat_events ADD COLUMN IF NOT EXISTS feedback text`);
  await query(`ALTER TABLE ip_help_chat_events ADD COLUMN IF NOT EXISTS feedback_reason text`);
  await query(`ALTER TABLE ip_help_chat_events ADD COLUMN IF NOT EXISTS unanswered boolean NOT NULL DEFAULT false`);
  schemaReady = true;
}

/**
 * Fire-and-forget analytics. Never throws to callers.
 * Does not store raw user question text (privacy).
 */
export async function recordHelpChatEvent(payload = {}) {
  try {
    await ensureIpHelpChatAnalyticsSchema();
    const id = payload.id || newId('ip_hce');
    await query(
      `INSERT INTO ip_help_chat_events
        (id, user_id, role, topic, fallback_state, success, latency_ms, model, knowledge_ids, pathname, feedback, feedback_reason, unanswered)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,
      [
        id,
        payload.userId || null,
        payload.role || null,
        payload.topic || null,
        payload.fallbackState || null,
        Boolean(payload.success),
        payload.latencyMs != null ? Number(payload.latencyMs) : null,
        payload.model || null,
        JSON.stringify(payload.knowledgeIds || []),
        payload.pathname || null,
        payload.feedback || null,
        payload.feedbackReason || null,
        Boolean(payload.unanswered),
      ],
    );
    return id;
  } catch (e) {
    console.warn('[help-chat analytics]', e.message);
    return null;
  }
}

export async function recordHelpChatFeedback({ eventId, feedback, reason } = {}) {
  try {
    if (!eventId || !feedback) return false;
    await ensureIpHelpChatAnalyticsSchema();
    const res = await query(
      `UPDATE ip_help_chat_events
       SET feedback = $2,
           feedback_reason = CASE
             WHEN $3::text IS NOT NULL THEN $3
             ELSE feedback_reason
           END
       WHERE id = $1
         AND (feedback IS NULL OR feedback = $2)
       RETURNING id`,
      [String(eventId), String(feedback).slice(0, 32), reason ? String(reason).slice(0, 120) : null],
    );
    return Boolean(res.rows[0]);
  } catch (e) {
    console.warn('[help-chat feedback]', e.message);
    return false;
  }
}
