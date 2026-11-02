/**
 * Unit checks for skillMatch aliases / normalization / formula.
 *   npm run test:skill-match
 */
import assert from 'node:assert/strict';
import {
  canonicalSkill,
  dedupeCanonicalSkills,
  skillMatchDetail,
  skillMatchPercent,
} from '../src/lib/skillMatch.js';
import { liveMatchScore, filterByMinMatch, paginateRows } from '../src/lib/ipLiveMatchScore.js';

// Exact + case / whitespace
assert.equal(skillMatchPercent(['Python'], { skills: ['python'] }), 100);
assert.equal(skillMatchPercent(['  PYTHON  '], { skills: ['Python'] }), 100);

// Aliases
assert.equal(canonicalSkill('React.js'), 'react');
assert.equal(canonicalSkill('ReactJS'), 'react');
assert.equal(canonicalSkill('Node.js'), 'nodejs');
assert.equal(canonicalSkill('NodeJS'), 'nodejs');
assert.equal(skillMatchPercent(['React'], { skills: ['React.js'] }), 100);
assert.equal(skillMatchPercent(['React.js', 'NodeJS'], { skills: ['React', 'Node.js'] }), 100);

// Unrelated must not match
assert.equal(skillMatchPercent(['Python'], { skills: ['PyTorch'] }), 0);
assert.equal(skillMatchPercent(['React'], { skills: ['Angular'] }), 0);
assert.equal(skillMatchPercent(['HTML'], { skills: ['CSS'] }), 0);
assert.equal(skillMatchPercent(['JavaScript'], { skills: ['TypeScript'] }), 0);
assert.equal(skillMatchPercent(['Java'], { skills: ['JavaScript'] }), 0);
assert.equal(skillMatchPercent(['C'], { skills: ['C++'] }), 0);
assert.equal(skillMatchPercent(['C'], { skills: ['C#'] }), 0);
assert.equal(skillMatchPercent(['Machine Learning'], { skills: ['Deep Learning'] }), 0);

// Meaningful punctuation kept distinct for C family
assert.notEqual(canonicalSkill('C'), canonicalSkill('C++'));
assert.notEqual(canonicalSkill('C'), canonicalSkill('C#'));

// Deduplicate aliases (candidate + required)
assert.equal(
  skillMatchPercent(['React', 'React.js'], { skills: ['React.js', 'ReactJS'] }),
  100,
);
assert.equal(dedupeCanonicalSkills(['React', 'react.js', 'ReactJS']).length, 1);
assert.equal(
  skillMatchDetail(['React'], { skills: ['React', 'React.js'] }).requiredCount,
  1,
);

// Empty eligibility → 100
assert.equal(skillMatchPercent(['Anything'], { skills: [] }), 100);
assert.equal(skillMatchPercent(['Anything'], {}), 100);

// Partial formula unchanged in meaning
assert.equal(skillMatchPercent(['React'], { skills: ['React', 'Python'] }), 50);
assert.equal(skillMatchPercent(['React', 'Python'], { skills: ['React', 'Python', 'Go'] }), 67);

// Live helper + filter/page
assert.equal(liveMatchScore(['Node.js'], { skills: ['NodeJS'] }), 100);
const rows = [
  { id: 1, match_score: 40 },
  { id: 2, match_score: 90 },
  { id: 3, match_score: 70 },
];
assert.deepEqual(
  filterByMinMatch(rows, 70).map((r) => r.id),
  [2, 3],
);
const page = paginateRows(
  [...rows].sort((a, b) => b.match_score - a.match_score),
  1,
  2,
);
assert.equal(page.total, 3);
assert.deepEqual(
  page.items.map((r) => r.id),
  [2, 3],
);

console.log('skillMatch + ipLiveMatchScore — all passed');
