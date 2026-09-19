#!/usr/bin/env node
/**
 * Unit-style checks for auto-reject helpers (no live DB required for format/label checks).
 */
import assert from 'node:assert/strict';
import {
  applicationClosedLabel,
  decorateCandidateApplication,
} from '../src/lib/ipApplicationPresentation.js';

const rejected = decorateCandidateApplication({
  status: 'rejected',
  updated_at: '2026-09-18T10:00:00.000Z',
});
assert.equal(rejected.closed_label, 'Not selected on');
assert.ok(rejected.closed_at);

assert.equal(applicationClosedLabel({ status: 'withdrawn' }), 'Withdrawn on');
assert.equal(applicationClosedLabel({ status: 'applied' }), 'Closed on');

console.log('ok: closure labels match Excel-style wording');
