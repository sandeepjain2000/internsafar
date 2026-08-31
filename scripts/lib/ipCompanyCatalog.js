/**
 * Single source of truth for demo employer company names.
 *
 * Every employer account must show a distinct company name. Two accounts sharing one
 * name makes genuinely different postings read as the same internship listed twice,
 * which is the confusion this catalog exists to prevent.
 *
 * Rules for anything added here:
 *   - a real, pronounceable business name — never a random character/digit string
 *   - no seeding or workflow status in the name ("(Pending)", "Seed", "QA", "Copy")
 *   - no two entries that differ only by a corporate suffix, or they read as one company
 *
 * The first 54 entries are the names already in use by the original demo pools, kept in
 * front so re-running the allocator renames as few live accounts as possible.
 */

const LEGACY_POOL = [
  'Nova Labs', 'Pulse Media', 'BrightPath Analytics', 'Cedar Softworks',
  'Orbit Fintech', 'Lotus Health Tech', 'Indigo Retail Labs', 'Summit Cloud',
  'Aether Mobility', 'Canvas EdTech', 'Forge Robotics', 'BluePeak Consulting',
  'Saffron Foods Tech', 'Nimbus Logistics', 'PixelCraft Studio', 'Harbor Bank Digital',
  'GreenLeaf AgriTech', 'Stratos Telecom', 'Quill Content', 'Vertex Pharma IT',
  'Maple HR Solutions', 'Tidewave Commerce', 'Astra Design Co', 'Helix Biotech Soft',
  'Arcadia Analytics', 'Bluepeak Systems', 'Cognita Labs', 'Drishti Technologies',
  'Everest Digital', 'Finmark Solutions', 'Greenwave Energy', 'Harbour Fintech',
  'Indus Robotics', 'Jetstream Cloud', 'Kinetic Health', 'Lumen Retail',
  'Meridian Consulting', 'Northwind Logistics', 'Orbit Semiconductors',
  'Prayag Infotech', 'Quantia Research', 'Riverstone Media', 'Sankalp Agritech',
  'Trident Manufacturing', 'Udaan Mobility', 'Vertex Security', 'Windmill Studios',
  'Xylem Water Works', 'Yugam Edtech', 'Zenith Payments', 'Ashwin Logistics',
  'Brightline Foods', 'Chinar Textiles', 'Deccan Aerospace',
];

const EXTENDED_POOL = [
  'Aarna Systems', 'Adhira Analytics', 'Aikya Consulting', 'Ajanta Interactive',
  'Akshara Edtech', 'Ananta Cloud', 'Anvaya Networks', 'Aranya Agritech',
  'Atharva Robotics', 'Avanti Logistics', 'Avighna Security', 'Bandhan Payments',
  'Bhavya Studios', 'Chaitra Software', 'Charaka Healthtech', 'Chetana Research',
  'Dakshin Telecom', 'Darpan Media', 'Dhruva Semiconductors', 'Ekagra Digital',
  'Gagan Aerospace', 'Girija Textiles', 'Hansa Mobility', 'Harit Energy',
  'Himal Ventures', 'Ishan Infotech', 'Jagriti Foods', 'Jalaj Water Works',
  'Kanchan Retail', 'Kartavya Solutions', 'Kaveri Manufacturing', 'Kshitij Labs',
  'Lavanya Design Co', 'Mahi Commerce', 'Maitri Health', 'Malhar Studios',
  'Manthan Consulting', 'Marut Wind Systems', 'Mayur Interactive', 'Medha Analytics',
  'Mihira Solar', 'Nabha Networks', 'Nakshatra Space Systems', 'Nandan Agritech',
  'Narmada Infra', 'Navrang Media', 'Nihar Cloud', 'Nirvaha Fintech',
  'Nishant Security', 'Ojas Robotics', 'Pallav Textiles', 'Parag Foods',
  'Pavan Logistics', 'Prabal Payments', 'Pragati Edtech', 'Pranav Software',
  'Prerna Learning Labs', 'Pushkar Digital', 'Rachana Design Studio', 'Rajat Metals Tech',
  'Ranjan Consulting', 'Rashmi Analytics', 'Ratna Jewels Tech', 'Ruchi Foodworks',
  'Sagar Marine Tech', 'Sahaj Solutions', 'Samarth Infotech', 'Sampada Finserv',
  'Sandesh Communications', 'Sanchay Wealth Tech', 'Sarathi Mobility', 'Sarvam Cloud',
  'Saurya Energy', 'Shaily Polymers Tech', 'Sharada Publishing Tech', 'Shreyas Networks',
  'Siddhi Pharma IT', 'Sindhu Shipping Tech', 'Sopan Edtech', 'Subodh Research',
  'Sumeru Analytics', 'Swara Audio Labs', 'Tapasya Consulting', 'Tarang Telecom',
  'Tejas Semiconductors', 'Trikon Robotics', 'Udaya Solar', 'Ujjwal Power Systems',
  'Umang Retail', 'Utkarsh Fintech', 'Vajra Defence Tech', 'Vanya Naturals Tech',
  'Varsha Agritech', 'Vayu Aviation Tech', 'Vedant Software', 'Vinaya Healthtech',
  'Vishwa Logistics', 'Yojana Civic Tech',

  'Alderway Consulting', 'Amberline Media', 'Ancora Fintech', 'Arcline Robotics',
  'Ashford Analytics', 'Atlasgrid Energy', 'Aurelia Biotech', 'Bayside Logistics',
  'Beacon Ridge Software', 'Belmont Retail Tech', 'Birchwood Studios', 'Blackwood Security',
  'Bramble Foods Tech', 'Bridgeport Networks', 'Brookfield Edtech', 'Calder Semiconductors',
  'Cambria Health Systems', 'Carbonleaf Materials', 'Cascadia Cloud', 'Castleton Payments',
  'Cedarline Manufacturing', 'Clearwater Analytics Co', 'Cliffside Interactive', 'Coastline Shipping Tech',
  'Copperfield Consulting', 'Cornerstone Infotech', 'Crestview Mobility', 'Cypress Grove Labs',
  'Dalewood Textiles', 'Daybreak Digital', 'Deerfield Agritech', 'Driftwood Studios',
  'Eastgate Commerce', 'Edgewater Research', 'Elmgrove Pharma IT', 'Emberline Energy',
  'Fairmont Solutions', 'Falcon Reach Aerospace', 'Fernhill Media', 'Fieldstone Ventures',
  'Flatiron Design Co', 'Foxglove Healthtech', 'Gladstone Wealth Tech', 'Glenrock Water Works',
  'Goldcrest Retail', 'Granite Bay Software', 'Grayling Networks', 'Greenfield Foods Tech',
  'Halcyon Robotics', 'Hartwell Consulting', 'Havenhill Insurtech', 'Hawthorne Analytics',
  'Hazelwood Studios', 'Highgate Telecom', 'Hollowbrook Edtech', 'Ironwood Manufacturing',
  'Ivyridge Digital', 'Jasperline Logistics', 'Juniper Hollow Labs', 'Kestrel Security',
  'Kingsley Payments', 'Lakeshore Mobility', 'Lancaster Infotech', 'Larkspur Media',
  'Laurelton Biotech', 'Ledgewood Consulting', 'Lighthouse Point Cloud', 'Linden Row Software',
  'Longview Semiconductors', 'Maplecrest Agritech', 'Marbleton Materials', 'Meadowlark Studios',
  'Millbrook Fintech', 'Moorgate Research', 'Mosswood Naturals Tech', 'Northbridge Networks',
  'Oakhaven Health Systems', 'Orchardly Commerce', 'Osprey Marine Tech', 'Overton Analytics',
  'Parkline Transit Tech', 'Pebblestone Retail', 'Pinecrest Energy', 'Quarrystone Infra',
  'Quillon Publishing Tech', 'Ravenswood Interactive', 'Redstone Robotics', 'Ridgeway Logistics',
  'Riverbend Edtech', 'Rosewood Design Studio', 'Saltmarsh Water Systems', 'Sandpiper Digital',
  'Sequoia Ridge Labs', 'Shorepoint Payments', 'Silverbirch Media', 'Slatefield Manufacturing',
  'Southport Shipping Tech', 'Springhill Healthtech', 'Stanton Consulting', 'Stillwater Analytics',
  'Stonebridge Software', 'Sunderland Textiles', 'Thistledown Foods Tech', 'Thornbury Ventures',
  'Timberline Cloud', 'Torchwood Security', 'Trailhead Learning Tech', 'Truewind Aviation Tech',
  'Vailwood Studios', 'Wakefield Infotech', 'Wexford Insurtech', 'Whitfield Networks',
  'Wildgrove Agritech', 'Willowbank Wealth Tech', 'Windermere Research', 'Winslow Semiconductors',
  'Woodhaven Retail', 'Wrenfield Solar', 'Yarrow Biotech', 'Yorkfield Logistics',
  'Zephyrline Telecom',
];

/**
 * Names for transient QA fixture employers. Deliberately disjoint from COMPANY_CATALOG:
 * QA fixtures are created through the registration API and cannot claim a name against
 * the database, so drawing from the demo pool would hand a fixture a name a demo employer
 * already holds — which then fails the "employer accounts sharing a company name" gate and
 * looks like a data bug rather than a QA leftover.
 */
const QA_COMPANY_CATALOG = [
  'Ashgrove Testing Services', 'Bellhaven Quality Labs', 'Coldbrook Assurance',
  'Dunmore Verification', 'Eastvale Diagnostics', 'Fernbank Assurance Group',
  'Glenmoor Testing Co', 'Holbeck Quality Systems', 'Inglewood Verification',
  'Kirkstall Assurance', 'Lambourne Testing Labs', 'Marsden Quality Co',
  'Netherby Assurance', 'Oakmere Verification', 'Pendlebury Testing',
  'Quarrington Quality Labs', 'Rosthwaite Assurance', 'Sedgemoor Testing Co',
  'Thurlow Verification', 'Ulverston Quality Systems', 'Vanbrough Assurance',
  'Wetherby Testing Labs', 'Yealand Verification', 'Zelbridge Quality Co',
];

const COMPANY_CATALOG = [...LEGACY_POOL, ...EXTENDED_POOL];

/** Reports every repeat at once, and says what to do about it. */
function findDuplicates(names) {
  const seen = new Set();
  const repeated = new Set();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) repeated.add(name);
    seen.add(key);
  }
  return [...repeated];
}

const catalogDuplicates = findDuplicates([...COMPANY_CATALOG, ...QA_COMPANY_CATALOG]);
if (catalogDuplicates.length) {
  throw new Error(
    'ipCompanyCatalog: these company names appear more than once, so two employer '
    + 'accounts would display the same company. Remove or rename them in '
    + `scripts/lib/ipCompanyCatalog.js: ${catalogDuplicates.join(', ')}`,
  );
}

/**
 * Deterministic distinct name by index.
 *
 * There is deliberately no fallback past the end of the catalog. The obvious one — a
 * city-qualified branch name like "Nova Labs — Pune" — is the naming style migration 033
 * removed and the demo-consistency gate rejects, so generating it would mean the seeders
 * emit exactly what the gate fails. Running out means the catalog needs more names.
 */
function companyNameAt(index) {
  const i = Number(index) || 0;
  if (i < COMPANY_CATALOG.length) return COMPANY_CATALOG[i];
  throw new Error(
    `ipCompanyCatalog: no company name for index ${i} — the catalog holds `
    + `${COMPANY_CATALOG.length}. Add more real company names to COMPANY_CATALOG in `
    + 'scripts/lib/ipCompanyCatalog.js; do not fall back to a suffixed branch name, '
    + 'because "X — City" reads as the same company as "X".',
  );
}

/**
 * Next catalog name not already present in `taken`. Use when seeding into a database
 * that may already hold employers, so a second seeding run cannot re-issue a name.
 * `taken` is mutated so repeated calls stay distinct within one run.
 */
function claimCompanyName(taken) {
  const used = taken instanceof Set ? taken : new Set(taken || []);
  for (const name of COMPANY_CATALOG) {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  throw new Error(
    `ipCompanyCatalog: all ${COMPANY_CATALOG.length} company names are in use. `
    + 'Add more real company names to COMPANY_CATALOG in scripts/lib/ipCompanyCatalog.js.',
  );
}

/**
 * A QA-pool name derived from a run label, for transient QA fixture employers.
 *
 * Drawn from QA_COMPANY_CATALOG, never from the demo pool, so a fixture can never collide
 * with a demo employer's company name. Hashing the run label spreads consecutive runs
 * across different names; `seed` separates several fixtures within one run. Two QA runs
 * left in the same database can still land on one name — clean runs up with
 * `npm run delete:ip-generated-run` rather than widening the pool.
 */
function companyNameForLabel(label, seed = 0) {
  const text = `${label || ''}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  }
  return QA_COMPANY_CATALOG[(hash + seed * 7) % QA_COMPANY_CATALOG.length];
}

module.exports = {
  COMPANY_CATALOG,
  QA_COMPANY_CATALOG,
  companyNameAt,
  claimCompanyName,
  companyNameForLabel,
  findDuplicates,
};
