-- 034_ip_company_mention_consistency.sql
--
-- One-time repair of text remnants left after 032/033 renamed employer accounts.
--
-- 0. A workflow status baked into a posting or offer name ("Design Intern (Draft)").
--    Draft is a status column, not part of a role name, and shipping it in the title
--    exposes an internal workflow state to candidates.
--
-- 1. Notification company labels naming a branch that never had an account
--    ("Astra Design Co · Pune"). The base company ("Astra Design Co") is a real employer,
--    so the branch suffix is dropped rather than the label being pointed at an invented
--    company. Title text and meta->>'company' are updated together so they stay in step.
--
-- 2. Postings and offers whose own text names a DIFFERENT existing employer. A posting
--    must advertise the company that owns it — naming another live company is the same
--    "is this the same internship twice" confusion seen from the other direction. The
--    mention is replaced with the owning employer's own name, scoped strictly to that
--    employer's own rows.
--
-- REPAIR_CUTOFF — why every statement carries a created_at bound:
--   This repo has no migration ledger, so migrations are re-run by hand and re-running is
--   normal. Without a bound, step 2 would keep rewriting company mentions forever, so a
--   future posting that legitimately names a partner or client company would be silently
--   edited, and step 0 would quietly rename a real posting an employer chose to call
--   "(Draft)". The cutoff freezes this file to the rows it was written for: anything
--   created on or after 2026-09-01 is never touched. Re-running is then a guaranteed
--   no-op on new data.
--
-- Safe to re-run: once the pre-cutoff rows are consistent, every statement matches none.
-- The runner (scripts/db_exec_sql_file.js) supplies BEGIN/COMMIT.

-- ------------------------ 0. workflow status baked into a posting/offer name
-- If stripping the suffix would collide with another posting from the same employer, the
-- posting's location is used as the qualifier instead, so titles stay distinct.
UPDATE ip_internships i
   SET title = CASE
         WHEN EXISTS (
           SELECT 1 FROM ip_internships s
            WHERE s.employer_id = i.employer_id
              AND s.id <> i.id
              AND lower(btrim(s.title)) = lower(btrim(regexp_replace(
                    i.title,
                    '\s*(\(|\[|[-–—])\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$',
                    '', 'i'))))
           AND coalesce(btrim(i.location), '') <> ''
         THEN btrim(regexp_replace(
                i.title,
                '\s*(\(|\[|[-–—])\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$',
                '', 'i')) || ' — ' || btrim(i.location)
         ELSE btrim(regexp_replace(
                i.title,
                '\s*(\(|\[|[-–—])\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$',
                '', 'i'))
       END
 WHERE i.created_at < TIMESTAMPTZ '2026-09-01'
   AND i.title ~* '(\(|\[|\s[-–—]\s)\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$';

UPDATE ip_offers
   SET role_title = btrim(regexp_replace(
         role_title,
         '\s*(\(|\[|[-–—])\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$',
         '', 'i'))
 WHERE created_at < TIMESTAMPTZ '2026-09-01'
   AND role_title ~* '(\(|\[|\s[-–—]\s)\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$';

-- --------------------------------------------- 1. orphan notification labels
UPDATE ip_notifications x
   SET title = replace(x.title, x.meta->>'company', btrim(split_part(x.meta->>'company', ' · ', 1))),
       meta = jsonb_set(x.meta, '{company}',
                        to_jsonb(btrim(split_part(x.meta->>'company', ' · ', 1))))
 WHERE x.created_at < TIMESTAMPTZ '2026-09-01'
   AND x.meta ? 'company'
   AND x.meta->>'company' LIKE '% · %'
   AND NOT EXISTS (
         SELECT 1 FROM ip_employers e
          WHERE btrim(e.company_name) = btrim(x.meta->>'company'))
   AND EXISTS (
         SELECT 1 FROM ip_employers e
          WHERE btrim(e.company_name) = btrim(split_part(x.meta->>'company', ' · ', 1)));

-- Any remaining branch-suffixed mention in notification text whose base is a real
-- employer, including rows that carry no meta at all. Derived from the employer table
-- rather than a hardcoded city list, so it keeps working if the city pool changes.
UPDATE ip_notifications x
   SET title = regexp_replace(x.title, '(' || e.company_name || ') · [A-Z][A-Za-z]*( [A-Z][A-Za-z]*)*', '\1', 'g')
  FROM ip_employers e
 WHERE x.created_at < TIMESTAMPTZ '2026-09-01'
   AND length(btrim(e.company_name)) > 3
   AND x.title LIKE '%' || e.company_name || ' · %';

UPDATE ip_notifications x
   SET body = regexp_replace(x.body, '(' || e.company_name || ') · [A-Z][A-Za-z]*( [A-Z][A-Za-z]*)*', '\1', 'g')
  FROM ip_employers e
 WHERE x.created_at < TIMESTAMPTZ '2026-09-01'
   AND x.body IS NOT NULL
   AND length(btrim(e.company_name)) > 3
   AND x.body LIKE '%' || e.company_name || ' · %';

-- ------------------------- 2. postings/offers naming another live company
UPDATE ip_internships i
   SET title = replace(i.title, mention.other_name, mention.own_name)
  FROM (
    SELECT i2.id AS internship_id,
           btrim(own.company_name) AS own_name,
           btrim(other.company_name) AS other_name
      FROM ip_internships i2
      JOIN ip_employers own ON own.id = i2.employer_id
      JOIN ip_employers other
        ON other.id <> own.id
       AND length(btrim(other.company_name)) > 3
       AND position(btrim(other.company_name) in i2.title) > 0
       -- skip harmless overlap, e.g. own "Orbit Fintech" containing other "Orbit"
       AND position(btrim(other.company_name) in btrim(own.company_name)) = 0
     WHERE i2.created_at < TIMESTAMPTZ '2026-09-01'
  ) mention
 WHERE i.id = mention.internship_id;

UPDATE ip_internships i
   SET description = replace(i.description, mention.other_name, mention.own_name)
  FROM (
    SELECT i2.id AS internship_id,
           btrim(own.company_name) AS own_name,
           btrim(other.company_name) AS other_name
      FROM ip_internships i2
      JOIN ip_employers own ON own.id = i2.employer_id
      JOIN ip_employers other
        ON other.id <> own.id
       AND length(btrim(other.company_name)) > 3
       AND i2.description IS NOT NULL
       AND position(btrim(other.company_name) in i2.description) > 0
       AND position(btrim(other.company_name) in btrim(own.company_name)) = 0
     WHERE i2.created_at < TIMESTAMPTZ '2026-09-01'
  ) mention
 WHERE i.id = mention.internship_id;

UPDATE ip_offers o
   SET role_title = replace(o.role_title, mention.other_name, mention.own_name)
  FROM (
    SELECT o2.id AS offer_id,
           btrim(own.company_name) AS own_name,
           btrim(other.company_name) AS other_name
      FROM ip_offers o2
      JOIN ip_employers own ON own.id = o2.employer_id
      JOIN ip_employers other
        ON other.id <> own.id
       AND length(btrim(other.company_name)) > 3
       AND o2.role_title IS NOT NULL
       AND position(btrim(other.company_name) in o2.role_title) > 0
       AND position(btrim(other.company_name) in btrim(own.company_name)) = 0
     WHERE o2.created_at < TIMESTAMPTZ '2026-09-01'
  ) mention
 WHERE o.id = mention.offer_id;

UPDATE ip_offers o
   SET message = replace(o.message, mention.other_name, mention.own_name)
  FROM (
    SELECT o2.id AS offer_id,
           btrim(own.company_name) AS own_name,
           btrim(other.company_name) AS other_name
      FROM ip_offers o2
      JOIN ip_employers own ON own.id = o2.employer_id
      JOIN ip_employers other
        ON other.id <> own.id
       AND length(btrim(other.company_name)) > 3
       AND o2.message IS NOT NULL
       AND position(btrim(other.company_name) in o2.message) > 0
       AND position(btrim(other.company_name) in btrim(own.company_name)) = 0
     WHERE o2.created_at < TIMESTAMPTZ '2026-09-01'
  ) mention
 WHERE o.id = mention.offer_id;
