/**
 * Demo-text classifier — shared by the audit gate and its own unit test.
 *
 * Lives in its own module so importing it cannot trigger a database sweep.
 *
 * What this is for: catching generated placeholder wording and random ids that
 * leaked into copy a human reads (`lhljn7g6`, `Coverage view`, `Gen Co 0`).
 *
 * What this must NOT do: condemn ordinary product vocabulary. "QA" is a job
 * function, "Gen AI" is a field, tests have coverage, hardware has fixtures,
 * statistics has samples. An earlier version matched the bare word "qa", and the
 * consequence was that a real job title was dropped from the demo pool to keep
 * the gate quiet. A false alarm is the more expensive failure, because it makes
 * people write worse product copy. Only machine-written *shapes* are flagged.
 */

/** Words that only ever appear in machine-written copy. */
const HARD_SCAFFOLD =
  /\b(core[\s-]?fill|lorem|ipsum|foobar|placeholder|asdf|qwerty|tbd|tab visibility|not empty)\b/i;

/** Scaffolding in a harness, ordinary in real copy — never flagged alone. */
const AMBIGUOUS_MARKER = /\b(qa|gen|coverage|fixture|dummy|demo|sample|seeded|scaffold)\b/i;

/**
 * Entity nouns a generator appends to a marker: "QA employer", "Coverage view".
 *
 * Excludes intern/internship/role — every real posting title contains them, and
 * that exclusion is what keeps "QA Automation Intern" clean. Also excludes
 * run/job/batch, which are common English ("run a sample survey", "batch of
 * 2026", "apply to jobs") and caused false alarms.
 */
const HARNESS_NOUN = new RegExp(
  '\\b(employers?|candidates?|compan(?:y|ies)|co|colleges?|docs?|documents?|ratings?'
  + '|comments?|notes?|messages?|threads?|subjects?|views?|presets?|templates?|lists?'
  + '|entry|entries|rows?|items?|users?|accounts?|seeds?|ideas?)\\b',
  'i',
);

/** A status word used as a title component: "QA Published Internship", "Pending Co". */
const MACHINE_TITLE =
  /\b(published|screening|draft|closed|paused|expired|pending|approved|rejected)\s+(internship|posting|role|compan(?:y|ies)|co)\b/i;

/** A marker with a trailing index: "Coverage role 3", "Gen Co 0". */
const MARKER_WITH_INDEX =
  /\b(qa|gen|coverage|fixture|dummy|demo|sample)\b[^.!?]*\s\d{1,4}\s*$/i;

/** Two of these together is generator wording ("Need fixture coverage"). */
const NARROW_MARKERS = ['qa', 'gen', 'coverage', 'fixture', 'dummy'];

/**
 * A random id leaked into prose (`lhljn7g6`, `mt140t02xc0e`).
 *
 * Requires letters mixed with digits AND either a digit-heavy body or no vowel,
 * so real technology names ("Bootstrap5", "PostgreSQL16", "COVID19") stay clean.
 */
function looksLikeRandomId(token) {
  if (token.length < 8) return false;
  if (!/[A-Za-z]/.test(token) || !/\d/.test(token)) return false;
  const digits = (token.match(/\d/g) || []).length;
  return digits >= 3 || !/[aeiou]/i.test(token);
}

/**
 * Generated labels are short — "QA employer", "Coverage view", "Gen Co 0".
 * Real prose is not, and in a full sentence the harness nouns ("note", "message",
 * "account") and markers ("sample", "demo") are just ordinary words. Applying the
 * word-combination rules to prose produced false alarms on genuine messages, so
 * those rules are limited to label-length values. Unambiguous placeholders and
 * leaked ids are still caught at any length.
 */
const LABEL_MAX_WORDS = 8;

/** 'jumble' | 'scaffolding' | null — null means it reads like real copy. */
function classifyDemoText(value) {
  const v = String(value);

  for (const token of v.split(/[^A-Za-z0-9]+/)) {
    if (!token) continue;
    if (/^\d{11,}$/.test(token)) return 'jumble';
    if (looksLikeRandomId(token)) return 'jumble';
  }

  // Applies at any length: these words never occur in real product copy.
  if (HARD_SCAFFOLD.test(v)) return 'scaffolding';

  const words = v.trim().split(/\s+/).filter(Boolean);
  if (words.length > LABEL_MAX_WORDS) return null;

  if (MACHINE_TITLE.test(v)) return 'scaffolding';
  if (AMBIGUOUS_MARKER.test(v) && HARNESS_NOUN.test(v)) return 'scaffolding';
  if (MARKER_WITH_INDEX.test(v)) return 'scaffolding';

  const hits = NARROW_MARKERS.filter((m) => new RegExp(`\\b${m}\\b`, 'i').test(v));
  if (hits.length >= 2) return 'scaffolding';

  return null;
}

/**
 * A workflow or seeding status tacked onto the end of a name: "Quill Content (Pending)",
 * "Acme Retail - Draft", "Nova Labs [Test]".
 *
 * A company or posting is never actually called this — the status belongs in a status
 * column, and baking it into the name ships an internal seeding state to customers.
 * Only checked on name/title columns via classifyEntityName, because in prose a trailing
 * "(pending)" can be a legitimate clarification.
 */
const STATUS_SUFFIX_IN_NAME =
  /(?:\(\s*|\[\s*|\s[-–—]\s)(pending|approved|rejected|suspended|draft|published|closed|paused|expired|copy|duplicate|test)\s*[)\]]?\s*$/i;

/**
 * Stricter classifier for columns that hold a name a customer reads — company names,
 * posting titles, offer role titles, list and template names.
 */
function classifyEntityName(value) {
  const base = classifyDemoText(value);
  if (base) return base;
  if (STATUS_SUFFIX_IN_NAME.test(String(value))) return 'status-in-name';
  return null;
}

module.exports = { classifyDemoText, classifyEntityName };
