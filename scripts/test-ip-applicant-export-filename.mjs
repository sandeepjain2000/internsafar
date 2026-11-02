/**
 * Unit checks for applicant export filename helpers.
 *   npm run test:applicant-export-filename
 */
import assert from 'node:assert/strict';
import {
  buildApplicantExportFilename,
  sanitizeExportNamePart,
} from '../src/lib/ipApplicantExportFilename.js';
import { formatIstExportStamp } from '../src/lib/ipIstTime.js';

assert.equal(sanitizeExportNamePart('Acme Technologies'), 'AcmeTechno');
assert.equal(sanitizeExportNamePart('Business Analyst Intern'), 'BusinessAn');
assert.equal(sanitizeExportNamePart('Acme! Tech @ 99'), 'AcmeTech99');
assert.equal(sanitizeExportNamePart('  A-B_C  '), 'ABC');
assert.equal(sanitizeExportNamePart(''), 'Unknown');
assert.equal(sanitizeExportNamePart(null), 'Unknown');
assert.equal(sanitizeExportNamePart('!!!'), 'Unknown');
assert.equal(sanitizeExportNamePart('प्रिया Corp'), 'Corp');
assert.equal(sanitizeExportNamePart('1234567890123'), '1234567890');

// Fixed UTC instant → known IST wall clock (IST = UTC+5:30).
const fixed = new Date('2026-11-02T09:19:45.000Z'); // 14:49:45 IST
assert.equal(formatIstExportStamp(fixed), '20261102_1449', 'no seconds; Asia/Kolkata');

const xlsx = buildApplicantExportFilename({
  employerName: 'Acme Technologies',
  postingTitle: 'Business Analyst Intern',
  generatedAt: fixed,
  extension: 'xlsx',
});
assert.equal(xlsx, 'AcmeTechno_BusinessAn_20261102_1449.xlsx');

const zip = buildApplicantExportFilename({
  employerName: 'Acme Technologies',
  postingTitle: 'Business Analyst Intern',
  generatedAt: fixed,
  extension: 'zip',
});
assert.equal(zip, 'AcmeTechno_BusinessAn_20261102_1449.zip');
assert.equal(zip.replace(/\.zip$/, '.xlsx'), xlsx, 'same stamp for zip + inner xlsx');

assert.equal(
  buildApplicantExportFilename({
    employerName: '',
    postingTitle: 'Role',
    generatedAt: fixed,
    extension: 'xlsx',
  }),
  'Unknown_Role_20261102_1449.xlsx',
);

assert.equal(
  buildApplicantExportFilename({
    employerName: 'Co',
    postingTitle: null,
    generatedAt: fixed,
    extension: 'xlsx',
  }),
  'Co_Unknown_20261102_1449.xlsx',
);

assert.match(formatIstExportStamp(new Date()), /^\d{8}_\d{4}$/);

console.log('ipApplicantExportFilename + formatIstExportStamp — all passed');
