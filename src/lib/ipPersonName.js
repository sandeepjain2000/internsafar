/**
 * Person-name rule for candidate First / Middle / Last Name.
 * Letters in any script (with accents), plus spaces, hyphens, apostrophes and
 * full stops for initials. Must start with a letter. No digits or other symbols.
 * Shared by the profile form (inline message) and PUT /api/ip/candidate/profile.
 */

const PERSON_NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

export const PERSON_NAME_FIELDS = [
  ['first_name', 'First Name'],
  ['middle_name', 'Middle Name'],
  ['last_name', 'Last Name'],
];

/** Error text for one name part, or null when it is blank or valid. */
export function personNameError(label, value) {
  const name = String(value ?? '').trim();
  if (!name) return null;
  if (PERSON_NAME_RE.test(name)) return null;
  return `${label} can only contain letters, spaces, hyphens (-), apostrophes (') and full stops (.).`;
}

/**
 * First invalid name in a profile payload: { field, error }, or null. Skips parts not sent.
 * A bare `name` is only stored when no parts are sent, so it is checked only then.
 */
export function firstPersonNameError(body) {
  const sendsParts = PERSON_NAME_FIELDS.some(([field]) => body?.[field] !== undefined);
  const fields = sendsParts ? PERSON_NAME_FIELDS : [['name', 'Name']];
  for (const [field, label] of fields) {
    if (body?.[field] === undefined) continue;
    const error = personNameError(label, body[field]);
    if (error) return { field, error };
  }
  return null;
}
