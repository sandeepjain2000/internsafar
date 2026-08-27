/**
 * DEPRECATED — do not use for baseline seed.
 * Nuclear reset + baseline seed: node scripts/IP_Reset_Core_Sample.js [--yes]
 *
 * This file remains only so old docs/commands fail loudly instead of undersizing data.
 */
console.error(
  [
    'seed-gmail-plus-cast.mjs is retired.',
    'Use:  node scripts/IP_Reset_Core_Sample.js --yes',
    'That preserves the 3 cores, clears non-cores, and reseeds ≈2-page baseline data.',
  ].join('\n'),
);
process.exit(1);
