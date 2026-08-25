import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { presentLedgerEntry } from '@/lib/ipReferralCredit';

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;

  const result = await query(
    `SELECT l.id, l.user_id, l.delta, l.reason, l.meta, l.created_at,
            i.title as internship_title, e.company_name,
            app.id as application_row_id
     FROM ip_points_ledger l
     LEFT JOIN ip_internships i ON i.id = (l.meta->>'internshipId')
     LEFT JOIN ip_employers e ON e.id = i.employer_id
     LEFT JOIN ip_applications app ON app.id = (l.meta->>'applicationId')
     WHERE l.user_id = $1
     ORDER BY l.created_at ASC, l.id ASC`,
    [session.user.id],
  );

  let running = 0;
  const chronological = result.rows.map((row) => {
    running += Number(row.delta) || 0;
    return presentLedgerEntry(row, running);
  });
  const items = chronological.slice().reverse();
  const balance = await query(`SELECT points FROM ip_users WHERE id = $1`, [session.user.id]);

  return jsonOk({
    items,
    balance: Number(balance.rows[0]?.points || 0),
  });
}
