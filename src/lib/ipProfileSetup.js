/**
 * Candidate profile "Setup & hours" fields: preferred working hours range and the ongoing
 * commitment note. Shared by the profile form (inline message) and PUT /api/ip/candidate/profile.
 *
 * Like ipProfileContact.js, only values the candidate changed must pass — a stored legacy value
 * never blocks Save of unrelated fields (the form posts every field on each save).
 */

export const MAX_COMMITMENT_NOTE_LENGTH = 200;

export const SETUP_FIELDS = ['preferred_hours_start', 'preferred_hours_end', 'ongoing_commitment_note'];

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const text = (v) => String(v ?? '').trim();

/**
 * Error for the hours pair, as { field, error }, or null. Each side is optional and only has to be
 * a time of day; "to" earlier than "from" is allowed (night shifts such as 22:00–02:00).
 */
export function hoursRangeError(start, end) {
  const from = text(start);
  const to = text(end);
  if (from && !TIME_OF_DAY.test(from)) {
    return { field: 'preferred_hours_start', error: 'Preferred hours "from" must be a time, like 09:30.' };
  }
  if (to && !TIME_OF_DAY.test(to)) {
    return { field: 'preferred_hours_end', error: 'Preferred hours "to" must be a time, like 18:00.' };
  }
  return null;
}

export function commitmentNoteError(note) {
  return text(note).length > MAX_COMMITMENT_NOTE_LENGTH
    ? `Commitment note is too long (${MAX_COMMITMENT_NOTE_LENGTH} characters max).`
    : null;
}

/**
 * First invalid changed setup value in a profile payload: { field, error }, or null.
 * The hours pair is checked together when either side was sent and changed.
 */
export function firstSetupFieldError(body, prev) {
  const sent = (f) => body?.[f] !== undefined;
  const changed = (f) => sent(f) && text(body[f]) !== text(prev?.[f]);

  if (changed('preferred_hours_start') || changed('preferred_hours_end')) {
    const start = sent('preferred_hours_start') ? body.preferred_hours_start : prev?.preferred_hours_start;
    const end = sent('preferred_hours_end') ? body.preferred_hours_end : prev?.preferred_hours_end;
    const issue = hoursRangeError(start, end);
    if (issue) return issue;
  }
  if (changed('ongoing_commitment_note')) {
    const error = commitmentNoteError(body.ongoing_commitment_note);
    if (error) return { field: 'ongoing_commitment_note', error };
  }
  return null;
}
