/**
 * Apply ISM migrations + seed demo users (ism_/is_ tables).
 * Also seeds ip_employer_documents demo rows for approved Internship Portal
 * employers (ip_employers) so the SuperAdmin Documents tab has data —
 * uses files under public/seed-docs/ (run `node scripts/create-seed-docs.mjs` first if missing).
 * Usage: node scripts/migrate-and-seed.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local') });

const { Pool } = pg;

function buildConfig() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL missing');
  const url = new URL(rawUrl);
  const insecure =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' ||
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false';
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: !insecure },
    max: 1,
  };
}

async function main() {
  const pool = new Pool(buildConfig());
  const client = await pool.connect();
  try {
    for (const mig of [
      '001_ism_schema.sql',
      '002_ism_portal_features.sql',
      '003_notifications_mailbox.sql',
      '004_audit_indexes.sql',
      '005_message_unread_student.sql',
    ]) {
      const migPath = path.join(root, 'db', 'migrations', mig);
      const sql = fs.readFileSync(migPath, 'utf8');
      await client.query(sql);
      console.log(`Migration ${mig} applied (IF NOT EXISTS).`);
    }

    const hash = await bcrypt.hash('Admin@123', 10);

    const demos = [
      {
        userId: 'ism_user_stu_1',
        email: 'ism.student1@yopmail.com',
        role: 'student',
        name: 'Aisha Khan',
        profileId: 'ism_stu_1',
      },
      {
        userId: 'ism_user_stu_2',
        email: 'ism.student2@yopmail.com',
        role: 'student',
        name: 'Rohan Mehta',
        profileId: 'ism_stu_2',
      },
      {
        userId: 'ism_user_emp_1',
        email: 'ism.employer@yopmail.com',
        role: 'employer',
        name: 'Neha Sharma',
        profileId: 'ism_emp_1',
      },
      {
        userId: 'ism_user_emp_pending',
        email: 'ism.employer.pending@yopmail.com',
        role: 'employer',
        name: 'Ravi Menon',
        profileId: 'ism_emp_5',
      },
      {
        userId: 'ism_user_admin_1',
        email: 'ism.admin@yopmail.com',
        role: 'admin',
        name: 'Admin Rao',
        profileId: 'ism_admin_1',
      },
    ];

    // Legacy emails were *.ism.demo — upsert-by-id below overwrites those rows.

    for (const d of demos) {
      await client.query(
        `INSERT INTO ism_users (id, email, password_hash, role, name, profile_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           name = EXCLUDED.name,
           profile_id = EXCLUDED.profile_id,
           updated_at = now()`,
        [d.userId, d.email, hash, d.role, d.name, d.profileId],
      );
    }

    await client.query(
      `INSERT INTO ism_students (
         id, user_id, name, email, phone, college, degree, branch, year, batch_year,
         graduation_year, cgpa, pct10, pct12, backlogs, resume_url, resume_file_name, skills, preferred_locations,
         willing_to_relocate, registration_status
       ) VALUES (
         'ism_stu_1', 'ism_user_stu_1', 'Aisha Khan', 'ism.student1@yopmail.com', '+91 98765 43210',
         'IIT Madras', 'B.Tech', 'Computer Science', 3, 2027, 2027, 8.4, 92, 88, 0,
         '/seed-cvs/cv-aisha.docx', 'cv-aisha.docx', ARRAY['React','Python','SQL'], ARRAY['Bengaluru','Chennai','Remote'],
         true, 'approved'
       )
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         resume_url = EXCLUDED.resume_url,
         resume_file_name = EXCLUDED.resume_file_name`,
    );

    await client.query(
      `INSERT INTO ism_students (
         id, user_id, name, email, phone, college, degree, branch, year, batch_year,
         graduation_year, cgpa, pct10, pct12, backlogs, resume_url, resume_file_name, skills, preferred_locations,
         willing_to_relocate, registration_status
       ) VALUES (
         'ism_stu_2', 'ism_user_stu_2', 'Rohan Mehta', 'ism.student2@yopmail.com', '+91 98111 22334',
         'NIT Trichy', 'B.Tech', 'Information Technology', 4, 2026, 2026, 7.9, 88, 85, 0,
         '/seed-cvs/cv-aisha.docx', 'cv-rohan.docx', ARRAY['Java','SQL','React'], ARRAY['Bengaluru','Hyderabad'],
         true, 'approved'
       )
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         resume_url = EXCLUDED.resume_url,
         resume_file_name = EXCLUDED.resume_file_name`,
    );

    await client.query(
      `INSERT INTO ism_employers (
         id, user_id, name, legal_name, website, industry, size_band, hq, about,
         verification_status, registration_status, verification_id
       ) VALUES (
         'ism_emp_1', 'ism_user_emp_1', 'NovaTech Labs', 'NovaTech Labs Pvt Ltd',
         'https://novatech.example', 'Software / SaaS', '51–200', 'Bengaluru',
         'Product engineering company building B2B analytics tools.',
         'verified', 'approved', 'ism_ver_1'
       )
       ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, verification_status = EXCLUDED.verification_status`,
    );

    await client.query(
      `INSERT INTO ism_employers (
         id, user_id, name, legal_name, website, industry, size_band, hq, about,
         verification_status, registration_status, verification_id
       ) VALUES (
         'ism_emp_5', 'ism_user_emp_pending', 'Pulse Media', 'Pulse Media Creatives Pvt Ltd',
         'https://pulsemedia.example', 'Media', '11–50', 'Chennai',
         'Digital content studio for brands and startups.',
         'pending_verification', 'pending', 'ism_ver_pending'
       )
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         verification_status = 'pending_verification',
         registration_status = 'pending',
         verification_id = 'ism_ver_pending'`,
    );

    // Verified employer MUST have docs on file (Shop Act docx + company registration pdf)
    await client.query(
      `INSERT INTO ism_employer_documents (id, employer_id, name, doc_type, url, review_status, uploaded_at)
       VALUES
         ('ism_doc_1', 'ism_emp_1', 'novatech-shop-act.docx', 'shop_act',
          '/seed-docs/novatech-shop-act.docx', 'approved', '2026-01-10'),
         ('ism_doc_2', 'ism_emp_1', 'novatech-company-registration.pdf', 'incorporation',
          '/seed-docs/novatech-company-registration.pdf', 'approved', '2026-01-10'),
         ('ism_doc_p1', 'ism_emp_5', 'pulse-shop-act.docx', 'shop_act',
          '/seed-docs/pulse-shop-act.docx', 'pending', '2026-04-01'),
         ('ism_doc_p2', 'ism_emp_5', 'pulse-company-registration.pdf', 'incorporation',
          '/seed-docs/pulse-company-registration.pdf', 'pending', '2026-04-01')
       ON CONFLICT (id) DO UPDATE SET
         url = EXCLUDED.url,
         review_status = EXCLUDED.review_status,
         name = EXCLUDED.name,
         doc_type = EXCLUDED.doc_type`,
    );

    await client.query(
      `INSERT INTO ism_employer_verifications (
         id, employer_id, status, submitted_at, reviewed_at, reviewer, notes,
         attestation_ids, document_ids, employer_message
       ) VALUES (
         'ism_ver_1', 'ism_emp_1', 'approved', '2026-01-12', '2026-01-14', 'Admin Rao',
         'Documents verified — Shop Act and registration on file.',
         ARRAY['docs_authentic','authorized_rep','no_fees','accurate_company'],
         ARRAY['ism_doc_1','ism_doc_2'],
         'Please verify NovaTech for campus internship posting.'
       )
       ON CONFLICT (id) DO UPDATE SET
         status = 'approved',
         document_ids = ARRAY['ism_doc_1','ism_doc_2'],
         notes = EXCLUDED.notes,
         attestation_ids = EXCLUDED.attestation_ids`,
    );

    // Pending queue item for admin verification UI (Pulse Media)
    await client.query(
      `INSERT INTO ism_employer_verifications (
         id, employer_id, status, submitted_at, reviewed_at, reviewer, notes,
         attestation_ids, document_ids, employer_message
       ) VALUES (
         'ism_ver_pending', 'ism_emp_5', 'pending', '2026-04-02', NULL, NULL, NULL,
         ARRAY['docs_authentic','authorized_rep','no_fees','accurate_company'],
         ARRAY['ism_doc_p1','ism_doc_p2'],
         'Please verify Pulse Media so we can post creative internships.'
       )
       ON CONFLICT (id) DO UPDATE SET
         status = 'pending',
         submitted_at = '2026-04-02',
         reviewed_at = NULL,
         reviewer = NULL,
         notes = NULL,
         document_ids = ARRAY['ism_doc_p1','ism_doc_p2'],
         attestation_ids = ARRAY['docs_authentic','authorized_rep','no_fees','accurate_company'],
         employer_message = EXCLUDED.employer_message`,
    );

    await client.query(
      `INSERT INTO ism_internships (
         id, employer_id, opportunity_type, title, location, mode, commitment, stipend,
         fixed_pay_min, fixed_pay_max, openings, apply_deadline, description, responsibilities, skills,
         status, views, posted_at, is_paid, experience_years, duration_weeks
       ) VALUES (
         'ism_int_1', 'ism_emp_1', 'internship', 'Frontend Engineering Intern',
         'Bengaluru / Hybrid', 'Hybrid', 'full_time', 25000, 25000, 25000, 4, '2026-05-15',
         'Build UI for analytics dashboards with React and design system components.',
         ARRAY['Ship UI features with React','Collaborate with design','Write basic unit tests'],
         ARRAY['React','TypeScript','CSS'], 'live', 9870, '2026-03-10', true, '0', 12
       )
       ON CONFLICT (id) DO UPDATE SET status = 'live', title = EXCLUDED.title, is_paid = true`,
    );

    const guidelineIds = [
      'no_charge',
      'no_data_resale',
      'genuine_role',
      'accurate_listing',
      'no_illegal_bond',
      'privacy',
      'fair_selection',
      'no_mlm',
      'timely_response',
    ];
    for (const g of guidelineIds) {
      await client.query(
        `INSERT INTO ism_internship_compliance (id, internship_id, guideline_id, accepted, accepted_at)
         VALUES ($1, 'ism_int_1', $2, true, now())
         ON CONFLICT (internship_id, guideline_id) DO UPDATE SET accepted = true`,
        [`ism_comp_int1_${g}`, g],
      );
    }

    await client.query(
      `INSERT INTO ism_plans (id, name, description, price_inr, listing_credits, duration_days, features, popular)
       VALUES
         ('ism_plan_5', 'Pack of 5 listings', 'Five premium listing credits valid 1 year', 13499, 5, 365,
           ARRAY['5 listing credits','Boosted visibility','Applicant contact access'], true),
         ('ism_plan_30', '1 Month unlimited', 'Unlimited premium internships and jobs for 30 days', 17999, NULL, 30,
           ARRAY['Unlimited listings','Boosted visibility','Dedicated support'], false),
         ('ism_plan_365', '1 Year unlimited', 'Unlimited premium listings for 1 year', 179999, NULL, 365,
           ARRAY['Unlimited listings','Best value','Priority support'], false)
       ON CONFLICT (id) DO NOTHING`,
    );

    // --- Demo applications / pipeline ---
    await client.query(
      `INSERT INTO ism_applications (id, student_id, internship_id, status, applied_at, history)
       VALUES (
         'ism_app_1', 'ism_stu_1', 'ism_int_1', 'Shortlisted', '2026-03-18',
         $1::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, history = EXCLUDED.history`,
      [
        JSON.stringify([
          { at: '2026-03-18', status: 'Applied', by: 'System' },
          { at: '2026-03-22', status: 'Shortlisted', by: 'Neha Sharma' },
        ]),
      ],
    );

    // Second applicant (Rohan) — no message thread yet; use pipeline Message to start one
    await client.query(
      `INSERT INTO ism_applications (id, student_id, internship_id, status, applied_at, history)
       VALUES (
         'ism_app_2', 'ism_stu_2', 'ism_int_1', 'Applied', '2026-04-06',
         $1::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, history = EXCLUDED.history`,
      [
        JSON.stringify([{ at: '2026-04-06', status: 'Applied', by: 'System' }]),
      ],
    );

    // --- Participation ---
    await client.query(
      `INSERT INTO ism_participations (id, student_id, internship_id, status, history)
       VALUES (
         'ism_part_1', 'ism_stu_1', 'ism_int_1', 'in_progress',
         $1::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, history = EXCLUDED.history`,
      [
        JSON.stringify([
          { at: '2026-04-01', event: 'Started', by: 'Neha Sharma' },
        ]),
      ],
    );

    // --- Messages ---
    await client.query(
      `INSERT INTO ism_message_threads (
         id, employer_id, student_id, internship_id, application_id, decision_status, unread
       ) VALUES (
         'ism_th_1', 'ism_emp_1', 'ism_stu_1', 'ism_int_1', 'ism_app_1', 'Shortlisted', 1
       )
       ON CONFLICT (id) DO UPDATE SET unread = 1, application_id = 'ism_app_1'`,
    );

    await client.query(`DELETE FROM ism_messages WHERE thread_id = 'ism_th_1'`);
    await client.query(
      `INSERT INTO ism_messages (id, thread_id, from_role, body, sent_at) VALUES
         ('ism_m_1', 'ism_th_1', 'employer',
          'Hi Aisha — thanks for applying to Frontend Engineering Intern. Are you available for a short screening call this week?',
          '2026-03-22 10:00:00+00'),
         ('ism_m_2', 'ism_th_1', 'student',
          'Yes, I am free Thursday afternoon or Friday morning. Looking forward to it!',
          '2026-03-22 12:30:00+00'),
         ('ism_m_3', 'ism_th_1', 'employer',
          'Great — we shortlisted your application. Please keep your resume updated in ISM.',
          '2026-03-23 09:15:00+00')`,
    );

    // --- Seeded grievance (admin cases list) ---
    await client.query(
      `INSERT INTO ism_cases (
         id, type, subject, description, raised_by, raised_by_role, against,
         internship_id, application_id, status, opened_at, history
       ) VALUES (
         'ism_case_1', 'Stipend', 'Delayed first stipend payment',
         'I started on 1 Apr and was told stipend is paid by the 5th. As of mid-April I have not received the first payment for Frontend Engineering Intern at NovaTech.',
         'Aisha Khan', 'student', 'NovaTech Labs',
         'ism_int_1', 'ism_app_1', 'Open', '2026-04-16',
         $1::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         status = 'Open',
         subject = EXCLUDED.subject,
         description = EXCLUDED.description,
         history = EXCLUDED.history`,
      [
        JSON.stringify([
          {
            at: '2026-04-16',
            event: 'Case opened',
            by: 'Aisha Khan',
            note: 'Seeded demo grievance for admin review.',
          },
        ]),
      ],
    );

    // --- Notifications (role demos + mailbox fields) ---
    await client.query(`DELETE FROM ism_notifications WHERE id LIKE 'ism_n_seed_%'`);
    await client.query(
      `INSERT INTO ism_notifications (id, role, user_id, type, title, body, href, read, is_starred, deleted_at) VALUES
         ('ism_n_seed_s1', 'student', 'ism_user_stu_1', 'Application',
          'Application shortlisted', 'NovaTech — Frontend Engineering Intern',
          '/student/applications', false, true, NULL),
         ('ism_n_seed_s2', 'student', 'ism_user_stu_1', 'System',
          'New message from NovaTech', 'Employer sent a screening note',
          '/student/messages', false, false, NULL),
         ('ism_n_seed_s3', 'student', 'ism_user_stu_1', 'Case',
          'Grievance submitted', 'Delayed first stipend payment',
          '/student/cases/ism_case_1', true, false, NULL),
         ('ism_n_seed_e1', 'employer', 'ism_user_emp_1', 'Application',
          'Applicant shortlisted', 'Aisha Khan · Frontend Engineering Intern',
          '/employer/internships/ism_int_1/pipeline', true, false, NULL),
         ('ism_n_seed_e2', 'employer', 'ism_user_emp_1', 'Verification',
          'Company verified', 'You can publish internships that go live automatically',
          '/employer/company', true, false, NULL),
         ('ism_n_seed_e3', 'employer', 'ism_user_emp_pending', 'Verification',
          'Verification submitted', 'Waiting for admin review — Pulse Media',
          '/employer/company', false, false, NULL),
         ('ism_n_seed_a1', 'admin', 'ism_user_admin_1', 'Verification',
          'Employer verification to review', 'Pulse Media · Ravi Menon',
          '/admin/verification', false, true, NULL),
         ('ism_n_seed_a2', 'admin', 'ism_user_admin_1', 'Case',
          'New grievance opened', 'Delayed first stipend payment',
          '/admin/cases/ism_case_1', false, false, NULL),
         ('ism_n_seed_a3', 'admin', NULL, 'System',
          'Live internship on platform', 'Frontend Engineering Intern is visible to students',
          '/admin/moderation', true, false, NULL)`,
    );

    await client.query(
      `INSERT INTO ism_audit_logs (id, actor, action, domain, object_type, object_id, outcome, context)
       VALUES
         ('ism_aud_seed_1', 'Admin Rao', 'verification.approved', 'employer', 'verification', 'ism_ver_1', 'approved',
          '{"seed":true}'::jsonb),
         ('ism_aud_seed_2', 'Neha Sharma', 'internship.published', 'internship', 'internship', 'ism_int_1', 'ok',
          '{"seed":true,"autoLive":true}'::jsonb),
         ('ism_aud_seed_3', 'Aisha Khan', 'application.submitted', 'application', 'application', 'ism_app_1', 'ok',
          '{"seed":true}'::jsonb),
         ('ism_aud_seed_4', 'Ravi Menon', 'verification.submitted', 'employer', 'verification', 'ism_ver_pending', 'pending',
          '{"seed":true}'::jsonb),
         ('ism_aud_seed_5', 'Aisha Khan', 'case.opened', 'case', 'case', 'ism_case_1', 'ok',
          '{"seed":true}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
    );

    console.log(
      'Seed demos OK: ism.student1@ / ism.student2@ / ism.employer@ / ism.employer.pending@ / ism.admin@ yopmail.com (Admin@123)',
    );
    console.log(
      'Also seeded: pending Pulse verification, Open grievance, verified docs, apps (Aisha + Rohan on Frontend Intern), messages (Aisha only — Rohan has no thread yet), mailbox notifications',
    );
    console.log('ism_saved_jobs / ism_job_alerts: empty (students create via UI)');

    // --- Internship Portal (ip_*): give every approved employer verification docs
    // so SuperAdmin > Documents has real rows to review, pointing at public/seed-docs/.
    const ipEmployersTableExists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_employers'`,
    );
    if (ipEmployersTableExists.rows[0]) {
      const approvedEmployers = await client.query(
        `SELECT id, company_name FROM ip_employers WHERE approval_status = 'approved'`,
      );
      const seedDocsDir = path.join(root, 'public', 'seed-docs');
      const shopActFile = fs.existsSync(path.join(seedDocsDir, 'novatech-shop-act.docx'))
        ? 'novatech-shop-act.docx'
        : null;
      const registrationFile = fs.existsSync(path.join(seedDocsDir, 'novatech-company-registration.pdf'))
        ? 'novatech-company-registration.pdf'
        : null;

      for (const emp of approvedEmployers.rows) {
        const existing = await client.query(
          `SELECT 1 FROM ip_employer_documents WHERE employer_id = $1 LIMIT 1`,
          [emp.id],
        );
        if (existing.rows[0]) continue; // don't clobber real uploads

        if (shopActFile) {
          await client.query(
            `INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url, review_status)
             VALUES ($1,$2,'Shop Act',$3,$4,'pending')
             ON CONFLICT (id) DO NOTHING`,
            [`ip_doc_seed_${emp.id}_shopact`, emp.id, shopActFile, `/seed-docs/${shopActFile}`],
          );
        }
        if (registrationFile) {
          await client.query(
            `INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url, review_status)
             VALUES ($1,$2,'Business PAN',$3,$4,'pending')
             ON CONFLICT (id) DO NOTHING`,
            [`ip_doc_seed_${emp.id}_reg`, emp.id, registrationFile, `/seed-docs/${registrationFile}`],
          );
        }
      }
      console.log(
        `ip_employer_documents seeded for ${approvedEmployers.rows.length} approved employer(s): ${approvedEmployers.rows.map((e) => e.company_name).join(', ') || 'none'}`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
