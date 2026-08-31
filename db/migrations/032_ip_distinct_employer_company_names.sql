-- 032_ip_distinct_employer_company_names.sql
--
-- Every employer account must display a distinct company name.
--
-- Before this migration 172 employer accounts shared only 77 company names — 41 names
-- were held by up to four accounts each. Two accounts under one name make genuinely
-- different postings read as the same internship listed twice, which is indistinguishable
-- on screen from a data bug. Four accounts were also live as "Quill Content (Pending)",
-- shipping an internal seeding status as part of a customer-visible company name.
--
-- What it does:
--   1. strips a workflow/seeding status suffix from company names
--   2. gives every duplicate holder a distinct name from the catalog below
--   3. re-syncs the employer's own postings and offers, whose text embeds the old name
--
-- Safe to re-run: once every account holds a distinct name, steps 2 and 3 match no rows.
-- Never deletes an account and never touches login identity (email / password / role).
--
-- REPAIR_CUTOFF — every statement is bounded to accounts created before 2026-09-01.
--   This repo has no migration ledger, so migrations get re-run by hand. Unbounded, this
--   file would keep enforcing one-name-per-account forever, and two branches of one real
--   company that each register later would have one of them silently renamed to an
--   unrelated catalog name. The bound freezes the file to the rows it was written for.
--   A future duplicate is a product decision, not a seeding defect — the demo-consistency
--   gate will report it, and it should be resolved deliberately.
--
-- The name pool is generated from scripts/lib/ipCompanyCatalog.js, which is also what the
-- seeding scripts use, so a reset cannot reintroduce a duplicate.
-- The runner (scripts/db_exec_sql_file.js) supplies BEGIN/COMMIT.

-- ---------------------------------------------------------------- name pool
CREATE TEMP TABLE ip_company_pool (idx INT PRIMARY KEY, name TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO ip_company_pool (idx, name) VALUES
  (0, 'Nova Labs'),
  (1, 'Pulse Media'),
  (2, 'BrightPath Analytics'),
  (3, 'Cedar Softworks'),
  (4, 'Orbit Fintech'),
  (5, 'Lotus Health Tech'),
  (6, 'Indigo Retail Labs'),
  (7, 'Summit Cloud'),
  (8, 'Aether Mobility'),
  (9, 'Canvas EdTech'),
  (10, 'Forge Robotics'),
  (11, 'BluePeak Consulting'),
  (12, 'Saffron Foods Tech'),
  (13, 'Nimbus Logistics'),
  (14, 'PixelCraft Studio'),
  (15, 'Harbor Bank Digital'),
  (16, 'GreenLeaf AgriTech'),
  (17, 'Stratos Telecom'),
  (18, 'Quill Content'),
  (19, 'Vertex Pharma IT'),
  (20, 'Maple HR Solutions'),
  (21, 'Tidewave Commerce'),
  (22, 'Astra Design Co'),
  (23, 'Helix Biotech Soft'),
  (24, 'Arcadia Analytics'),
  (25, 'Bluepeak Systems'),
  (26, 'Cognita Labs'),
  (27, 'Drishti Technologies'),
  (28, 'Everest Digital'),
  (29, 'Finmark Solutions'),
  (30, 'Greenwave Energy'),
  (31, 'Harbour Fintech'),
  (32, 'Indus Robotics'),
  (33, 'Jetstream Cloud'),
  (34, 'Kinetic Health'),
  (35, 'Lumen Retail'),
  (36, 'Meridian Consulting'),
  (37, 'Northwind Logistics'),
  (38, 'Orbit Semiconductors'),
  (39, 'Prayag Infotech'),
  (40, 'Quantia Research'),
  (41, 'Riverstone Media'),
  (42, 'Sankalp Agritech'),
  (43, 'Trident Manufacturing'),
  (44, 'Udaan Mobility'),
  (45, 'Vertex Security'),
  (46, 'Windmill Studios'),
  (47, 'Xylem Water Works'),
  (48, 'Yugam Edtech'),
  (49, 'Zenith Payments'),
  (50, 'Ashwin Logistics'),
  (51, 'Brightline Foods'),
  (52, 'Chinar Textiles'),
  (53, 'Deccan Aerospace'),
  (54, 'Aarna Systems'),
  (55, 'Adhira Analytics'),
  (56, 'Aikya Consulting'),
  (57, 'Ajanta Interactive'),
  (58, 'Akshara Edtech'),
  (59, 'Ananta Cloud'),
  (60, 'Anvaya Networks'),
  (61, 'Aranya Agritech'),
  (62, 'Atharva Robotics'),
  (63, 'Avanti Logistics'),
  (64, 'Avighna Security'),
  (65, 'Bandhan Payments'),
  (66, 'Bhavya Studios'),
  (67, 'Chaitra Software'),
  (68, 'Charaka Healthtech'),
  (69, 'Chetana Research'),
  (70, 'Dakshin Telecom'),
  (71, 'Darpan Media'),
  (72, 'Dhruva Semiconductors'),
  (73, 'Ekagra Digital'),
  (74, 'Gagan Aerospace'),
  (75, 'Girija Textiles'),
  (76, 'Hansa Mobility'),
  (77, 'Harit Energy'),
  (78, 'Himal Ventures'),
  (79, 'Ishan Infotech'),
  (80, 'Jagriti Foods'),
  (81, 'Jalaj Water Works'),
  (82, 'Kanchan Retail'),
  (83, 'Kartavya Solutions'),
  (84, 'Kaveri Manufacturing'),
  (85, 'Kshitij Labs'),
  (86, 'Lavanya Design Co'),
  (87, 'Mahi Commerce'),
  (88, 'Maitri Health'),
  (89, 'Malhar Studios'),
  (90, 'Manthan Consulting'),
  (91, 'Marut Wind Systems'),
  (92, 'Mayur Interactive'),
  (93, 'Medha Analytics'),
  (94, 'Mihira Solar'),
  (95, 'Nabha Networks'),
  (96, 'Nakshatra Space Systems'),
  (97, 'Nandan Agritech'),
  (98, 'Narmada Infra'),
  (99, 'Navrang Media'),
  (100, 'Nihar Cloud'),
  (101, 'Nirvaha Fintech'),
  (102, 'Nishant Security'),
  (103, 'Ojas Robotics'),
  (104, 'Pallav Textiles'),
  (105, 'Parag Foods'),
  (106, 'Pavan Logistics'),
  (107, 'Prabal Payments'),
  (108, 'Pragati Edtech'),
  (109, 'Pranav Software'),
  (110, 'Prerna Learning Labs'),
  (111, 'Pushkar Digital'),
  (112, 'Rachana Design Studio'),
  (113, 'Rajat Metals Tech'),
  (114, 'Ranjan Consulting'),
  (115, 'Rashmi Analytics'),
  (116, 'Ratna Jewels Tech'),
  (117, 'Ruchi Foodworks'),
  (118, 'Sagar Marine Tech'),
  (119, 'Sahaj Solutions'),
  (120, 'Samarth Infotech'),
  (121, 'Sampada Finserv'),
  (122, 'Sandesh Communications'),
  (123, 'Sanchay Wealth Tech'),
  (124, 'Sarathi Mobility'),
  (125, 'Sarvam Cloud'),
  (126, 'Saurya Energy'),
  (127, 'Shaily Polymers Tech'),
  (128, 'Sharada Publishing Tech'),
  (129, 'Shreyas Networks'),
  (130, 'Siddhi Pharma IT'),
  (131, 'Sindhu Shipping Tech'),
  (132, 'Sopan Edtech'),
  (133, 'Subodh Research'),
  (134, 'Sumeru Analytics'),
  (135, 'Swara Audio Labs'),
  (136, 'Tapasya Consulting'),
  (137, 'Tarang Telecom'),
  (138, 'Tejas Semiconductors'),
  (139, 'Trikon Robotics'),
  (140, 'Udaya Solar'),
  (141, 'Ujjwal Power Systems'),
  (142, 'Umang Retail'),
  (143, 'Utkarsh Fintech'),
  (144, 'Vajra Defence Tech'),
  (145, 'Vanya Naturals Tech'),
  (146, 'Varsha Agritech'),
  (147, 'Vayu Aviation Tech'),
  (148, 'Vedant Software'),
  (149, 'Vinaya Healthtech'),
  (150, 'Vishwa Logistics'),
  (151, 'Yojana Civic Tech'),
  (152, 'Alderway Consulting'),
  (153, 'Amberline Media'),
  (154, 'Ancora Fintech'),
  (155, 'Arcline Robotics'),
  (156, 'Ashford Analytics'),
  (157, 'Atlasgrid Energy'),
  (158, 'Aurelia Biotech'),
  (159, 'Bayside Logistics'),
  (160, 'Beacon Ridge Software'),
  (161, 'Belmont Retail Tech'),
  (162, 'Birchwood Studios'),
  (163, 'Blackwood Security'),
  (164, 'Bramble Foods Tech'),
  (165, 'Bridgeport Networks'),
  (166, 'Brookfield Edtech'),
  (167, 'Calder Semiconductors'),
  (168, 'Cambria Health Systems'),
  (169, 'Carbonleaf Materials'),
  (170, 'Cascadia Cloud'),
  (171, 'Castleton Payments'),
  (172, 'Cedarline Manufacturing'),
  (173, 'Clearwater Analytics Co'),
  (174, 'Cliffside Interactive'),
  (175, 'Coastline Shipping Tech'),
  (176, 'Copperfield Consulting'),
  (177, 'Cornerstone Infotech'),
  (178, 'Crestview Mobility'),
  (179, 'Cypress Grove Labs'),
  (180, 'Dalewood Textiles'),
  (181, 'Daybreak Digital'),
  (182, 'Deerfield Agritech'),
  (183, 'Driftwood Studios'),
  (184, 'Eastgate Commerce'),
  (185, 'Edgewater Research'),
  (186, 'Elmgrove Pharma IT'),
  (187, 'Emberline Energy'),
  (188, 'Fairmont Solutions'),
  (189, 'Falcon Reach Aerospace'),
  (190, 'Fernhill Media'),
  (191, 'Fieldstone Ventures'),
  (192, 'Flatiron Design Co'),
  (193, 'Foxglove Healthtech'),
  (194, 'Gladstone Wealth Tech'),
  (195, 'Glenrock Water Works'),
  (196, 'Goldcrest Retail'),
  (197, 'Granite Bay Software'),
  (198, 'Grayling Networks'),
  (199, 'Greenfield Foods Tech'),
  (200, 'Halcyon Robotics'),
  (201, 'Hartwell Consulting'),
  (202, 'Havenhill Insurtech'),
  (203, 'Hawthorne Analytics'),
  (204, 'Hazelwood Studios'),
  (205, 'Highgate Telecom'),
  (206, 'Hollowbrook Edtech'),
  (207, 'Ironwood Manufacturing'),
  (208, 'Ivyridge Digital'),
  (209, 'Jasperline Logistics'),
  (210, 'Juniper Hollow Labs'),
  (211, 'Kestrel Security'),
  (212, 'Kingsley Payments'),
  (213, 'Lakeshore Mobility'),
  (214, 'Lancaster Infotech'),
  (215, 'Larkspur Media'),
  (216, 'Laurelton Biotech'),
  (217, 'Ledgewood Consulting'),
  (218, 'Lighthouse Point Cloud'),
  (219, 'Linden Row Software'),
  (220, 'Longview Semiconductors'),
  (221, 'Maplecrest Agritech'),
  (222, 'Marbleton Materials'),
  (223, 'Meadowlark Studios'),
  (224, 'Millbrook Fintech'),
  (225, 'Moorgate Research'),
  (226, 'Mosswood Naturals Tech'),
  (227, 'Northbridge Networks'),
  (228, 'Oakhaven Health Systems'),
  (229, 'Orchardly Commerce'),
  (230, 'Osprey Marine Tech'),
  (231, 'Overton Analytics'),
  (232, 'Parkline Transit Tech'),
  (233, 'Pebblestone Retail'),
  (234, 'Pinecrest Energy'),
  (235, 'Quarrystone Infra'),
  (236, 'Quillon Publishing Tech'),
  (237, 'Ravenswood Interactive'),
  (238, 'Redstone Robotics'),
  (239, 'Ridgeway Logistics'),
  (240, 'Riverbend Edtech'),
  (241, 'Rosewood Design Studio'),
  (242, 'Saltmarsh Water Systems'),
  (243, 'Sandpiper Digital'),
  (244, 'Sequoia Ridge Labs'),
  (245, 'Shorepoint Payments'),
  (246, 'Silverbirch Media'),
  (247, 'Slatefield Manufacturing'),
  (248, 'Southport Shipping Tech'),
  (249, 'Springhill Healthtech'),
  (250, 'Stanton Consulting'),
  (251, 'Stillwater Analytics'),
  (252, 'Stonebridge Software'),
  (253, 'Sunderland Textiles'),
  (254, 'Thistledown Foods Tech'),
  (255, 'Thornbury Ventures'),
  (256, 'Timberline Cloud'),
  (257, 'Torchwood Security'),
  (258, 'Trailhead Learning Tech'),
  (259, 'Truewind Aviation Tech'),
  (260, 'Vailwood Studios'),
  (261, 'Wakefield Infotech'),
  (262, 'Wexford Insurtech'),
  (263, 'Whitfield Networks'),
  (264, 'Wildgrove Agritech'),
  (265, 'Willowbank Wealth Tech'),
  (266, 'Windermere Research'),
  (267, 'Winslow Semiconductors'),
  (268, 'Woodhaven Retail'),
  (269, 'Wrenfield Solar'),
  (270, 'Yarrow Biotech'),
  (271, 'Yorkfield Logistics'),
  (272, 'Zephyrline Telecom');

-- ------------------------------------------------- 1. strip status suffixes
-- "Quill Content (Pending)" -> "Quill Content". Any collision this creates with an
-- existing account is resolved by step 2 below.
UPDATE ip_employers
   SET company_name = btrim(regexp_replace(
         company_name,
         '\s*(\(|\[|[-–—])\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$',
         '', 'i'))
 WHERE created_at < TIMESTAMPTZ '2026-09-01'
   AND company_name ~* '(\(|\[|\s[-–—]\s)\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$';

UPDATE ip_employer_requests
   SET company_name = btrim(regexp_replace(
         company_name,
         '\s*(\(|\[|[-–—])\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$',
         '', 'i'))
 WHERE created_at < TIMESTAMPTZ '2026-09-01'
   AND company_name ~* '(\(|\[|\s[-–—]\s)\s*(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*(\)|\])?\s*$';

-- --------------------------------------- 2. one distinct name per account
CREATE TEMP TABLE ip_company_rename (
  employer_id TEXT PRIMARY KEY,
  old_name    TEXT NOT NULL,
  new_name    TEXT NOT NULL
) ON COMMIT DROP;

-- Within a group of accounts sharing a name, the one with the most postings keeps it.
-- That protects the core showcase employer (by far the busiest account) from being
-- renamed, and rewrites the least embedded text.
WITH ranked AS (
  SELECT e.id, e.company_name, e.created_at,
         row_number() OVER (
           PARTITION BY lower(btrim(e.company_name))
           ORDER BY (SELECT count(*) FROM ip_internships i WHERE i.employer_id = e.id) DESC,
                    e.created_at NULLS LAST, e.id
         ) AS rn
    FROM ip_employers e
   WHERE e.created_at < TIMESTAMPTZ '2026-09-01'  -- see REPAIR_CUTOFF note in the header
),
needs AS (
  SELECT id, btrim(company_name) AS old_name,
         row_number() OVER (ORDER BY created_at NULLS LAST, id) AS seq
    FROM ranked
   WHERE rn > 1
),
free AS (
  SELECT p.name, row_number() OVER (ORDER BY p.idx) AS seq
    FROM ip_company_pool p
   WHERE NOT EXISTS (
           SELECT 1 FROM ip_employers e
            WHERE lower(btrim(e.company_name)) = lower(p.name))
     AND NOT EXISTS (
           SELECT 1 FROM ip_employer_requests r
            WHERE lower(btrim(r.company_name)) = lower(p.name))
)
INSERT INTO ip_company_rename (employer_id, old_name, new_name)
SELECT n.id, n.old_name, f.name
  FROM needs n
  JOIN free f ON f.seq = n.seq;

-- Fail loudly rather than leaving duplicates behind if the catalog runs dry.
DO $$
DECLARE unresolved INT;
BEGIN
  SELECT count(*) INTO unresolved
    FROM (
      SELECT e.id, row_number() OVER (
               PARTITION BY lower(btrim(e.company_name))
               ORDER BY (SELECT count(*) FROM ip_internships i WHERE i.employer_id = e.id) DESC,
                        e.created_at NULLS LAST, e.id) AS rn
        FROM ip_employers e
       WHERE e.created_at < TIMESTAMPTZ '2026-09-01') q
   WHERE q.rn > 1
     AND NOT EXISTS (SELECT 1 FROM ip_company_rename r WHERE r.employer_id = q.id);
  IF unresolved > 0 THEN
    RAISE EXCEPTION 'ip_company_pool exhausted: % duplicate employer(s) have no distinct name. Add names to scripts/lib/ipCompanyCatalog.js and regenerate.', unresolved;
  END IF;
END $$;

UPDATE ip_employers e
   SET company_name = r.new_name,
       updated_at = now()
  FROM ip_company_rename r
 WHERE r.employer_id = e.id;

-- A request must not name a company that already has an account, or the SuperAdmin sees
-- an approval request for a company that is already on the platform.
WITH needs AS (
  SELECT r.id, row_number() OVER (ORDER BY r.created_at NULLS LAST, r.id) AS seq
    FROM ip_employer_requests r
   WHERE r.created_at < TIMESTAMPTZ '2026-09-01'
     AND EXISTS (
           SELECT 1 FROM ip_employers e
            WHERE lower(btrim(e.company_name)) = lower(btrim(r.company_name)))
),
free AS (
  SELECT p.name, row_number() OVER (ORDER BY p.idx) AS seq
    FROM ip_company_pool p
   WHERE NOT EXISTS (
           SELECT 1 FROM ip_employers e
            WHERE lower(btrim(e.company_name)) = lower(p.name))
     AND NOT EXISTS (
           SELECT 1 FROM ip_employer_requests r2
            WHERE lower(btrim(r2.company_name)) = lower(p.name))
)
UPDATE ip_employer_requests r
   SET company_name = f.name
  FROM needs n
  JOIN free f ON f.seq = n.seq
 WHERE r.id = n.id;

-- ------------------------- 3. re-sync text that embedded the old company name
-- Only rows owned by the renamed employer are touched, so a name shared by several
-- accounts cannot be rewritten on another account's rows.
UPDATE ip_internships i
   SET title = replace(i.title, r.old_name, r.new_name)
  FROM ip_company_rename r
 WHERE i.employer_id = r.employer_id
   AND position(r.old_name in i.title) > 0;

UPDATE ip_internships i
   SET description = replace(i.description, r.old_name, r.new_name)
  FROM ip_company_rename r
 WHERE i.employer_id = r.employer_id
   AND i.description IS NOT NULL
   AND position(r.old_name in i.description) > 0;

UPDATE ip_offers o
   SET role_title = replace(o.role_title, r.old_name, r.new_name)
  FROM ip_company_rename r
 WHERE o.employer_id = r.employer_id
   AND o.role_title IS NOT NULL
   AND position(r.old_name in o.role_title) > 0;

UPDATE ip_offers o
   SET message = replace(o.message, r.old_name, r.new_name)
  FROM ip_company_rename r
 WHERE o.employer_id = r.employer_id
   AND o.message IS NOT NULL
   AND position(r.old_name in o.message) > 0;

UPDATE ip_endorsements en
   SET certificate_text = replace(en.certificate_text, r.old_name, r.new_name)
  FROM ip_company_rename r
 WHERE en.employer_id = r.employer_id
   AND en.certificate_text IS NOT NULL
   AND position(r.old_name in en.certificate_text) > 0;

-- ip_notifications deliberately not rewritten: it stores the company as a denormalised
-- label (title text plus meta->>'company') with no employer id, so a mention of a name
-- that four accounts shared cannot be attributed to one of them. Every such name is still
-- held by exactly one real employer after this migration, and title and meta stay
-- consistent with each other.
