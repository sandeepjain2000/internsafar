const UNAVAILABLE = 'This internship is no longer available';

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function collectRefs(n) {
  const meta = parseMeta(n.meta);
  const internshipIds = [];
  const applicationIds = [];
  const offerIds = [];
  if (meta.internshipId) internshipIds.push(String(meta.internshipId));
  if (meta.applicationId) applicationIds.push(String(meta.applicationId));
  if (meta.offerId) offerIds.push(String(meta.offerId));
  const link = String(n.link || '');
  const internMatch = link.match(/\/internships\/([^/?#]+)/);
  if (internMatch) internshipIds.push(internMatch[1]);
  const appMatch = link.match(/\/applications\/([^/?#]+)/);
  if (appMatch) applicationIds.push(appMatch[1]);
  return { internshipIds, applicationIds, offerIds };
}

/**
 * Mark notifications whose stored internship/application/offer no longer exists.
 * List routes (e.g. /candidate/offers) stay clickable unless a specific entity id is missing.
 */
export async function annotateNotificationsTargetAvailability(query, items) {
  const intern = new Set();
  const apps = new Set();
  const offers = new Set();
  for (const n of items) {
    const refs = collectRefs(n);
    refs.internshipIds.forEach((id) => intern.add(id));
    refs.applicationIds.forEach((id) => apps.add(id));
    refs.offerIds.forEach((id) => offers.add(id));
  }

  const existingIntern = new Set();
  const existingApps = new Set();
  const existingOffers = new Set();
  if (intern.size) {
    const r = await query(`SELECT id FROM ip_internships WHERE id = ANY($1::text[])`, [[...intern]]);
    r.rows.forEach((row) => existingIntern.add(row.id));
  }
  if (apps.size) {
    const r = await query(`SELECT id FROM ip_applications WHERE id = ANY($1::text[])`, [[...apps]]);
    r.rows.forEach((row) => existingApps.add(row.id));
  }
  if (offers.size) {
    const r = await query(`SELECT id FROM ip_offers WHERE id = ANY($1::text[])`, [[...offers]]);
    r.rows.forEach((row) => existingOffers.add(row.id));
  }

  return items.map((n) => {
    const refs = collectRefs(n);
    const internGone = refs.internshipIds.some((id) => !existingIntern.has(id));
    const appGone = refs.applicationIds.some((id) => !existingApps.has(id));
    const offerGone = refs.offerIds.some((id) => !existingOffers.has(id));
    if (!internGone && !appGone && !offerGone) return n;

    let message = UNAVAILABLE;
    if (offerGone && !internGone) message = 'This offer is no longer available';
    else if (appGone && !internGone) message = 'This application is no longer available';

    return {
      ...n,
      resourceUnavailable: true,
      resourceUnavailableMessage: message,
      link: null,
      actionHref: null,
    };
  });
}
