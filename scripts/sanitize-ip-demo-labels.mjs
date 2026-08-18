/**
 * Rename demo “seed/seeded” labels in ip_* rows so SuperAdmin/UI copy looks like normal data.
 * Usage: node scripts/sanitize-ip-demo-labels.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  await client.connect();
  await client.query('BEGIN');

  await client.query(`
    UPDATE ip_users SET name = CASE
      WHEN name = 'Priya Seed Cast' THEN 'Priya Sharma'
      WHEN name = 'Arjun Seed Cast' THEN 'Arjun Mehta'
      WHEN name = 'Meera Seed Cast' THEN 'Meera Iyer'
      WHEN name = 'Nova Labs Seed' THEN 'Nova Labs'
      WHEN name = 'Pulse Media Seed' THEN 'Pulse Media'
      ELSE replace(replace(name, ' Seed Cast', ''), ' Seed', '')
    END
    WHERE name ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_candidates SET name = CASE
      WHEN name = 'Priya Seed Cast' THEN 'Priya Sharma'
      WHEN name = 'Arjun Seed Cast' THEN 'Arjun Mehta'
      WHEN name = 'Meera Seed Cast' THEN 'Meera Iyer'
      ELSE replace(name, ' Seed Cast', '')
    END
    WHERE name ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_employers SET
      company_name = replace(company_name, ' Seed', ''),
      brand_name = replace(COALESCE(brand_name, ''), ' Seed', ''),
      contact_name = replace(replace(COALESCE(contact_name, ''), ' Seed Cast', ''), ' Seed', ''),
      about = regexp_replace(
        replace(replace(COALESCE(about, ''), ' Seed', ''), 'seeded showcase employer for Internship Portal.', ''),
        ' — $',
        '',
        'g'
      )
    WHERE company_name ILIKE '%seed%'
       OR about ILIKE '%seed%'
       OR contact_name ILIKE '%seed%'
       OR brand_name ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_employers
    SET about = trim(both ' —' from about)
    WHERE about IS NOT NULL AND (about LIKE ' —%' OR about LIKE '%— ')
  `);

  await client.query(`
    UPDATE ip_employer_requests SET
      company_name = replace(company_name, ' Seed', ''),
      reason = CASE
        WHEN reason ILIKE '%seed%' THEN 'Manual verification request for employer onboarding.'
        ELSE reason
      END
    WHERE company_name ILIKE '%seed%' OR reason ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_internships
    SET description = replace(description, 'Seeded posting for showcase. ', '')
    WHERE description ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_feature_ideas
    SET description = replace(description, ' — seeded idea for SuperAdmin triage.', '')
    WHERE description ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_notifications SET
      title = CASE WHEN title ILIKE '%seed%' THEN 'Accounts ready' ELSE title END,
      body = CASE
        WHEN body ILIKE 'seeded applicants%' THEN 'New applicants are waiting on your postings.'
        WHEN body ILIKE '%seeded%' THEN 'Showcase accounts are ready for review.'
        ELSE replace(body, ' Seed', '')
      END
    WHERE title ILIKE '%seed%' OR body ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_employer_documents
    SET url = replace(url, '/seed-docs/', '/sample-docs/'),
        id = replace(id, 'ip_doc_seed_', 'ip_doc_')
    WHERE url ILIKE '%seed%' OR id ILIKE '%seed%'
  `);

  await client.query(`
    UPDATE ip_candidates
    SET resume_url = replace(resume_url, '/seed-cvs/', '/sample-cvs/')
    WHERE resume_url ILIKE '%seed%'
  `);

  await client.query('COMMIT');
  console.log('Updated ip_* demo labels (seed/seeded wording removed).');
}

main()
  .catch(async (e) => {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => client.end());
