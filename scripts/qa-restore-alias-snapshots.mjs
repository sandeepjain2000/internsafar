#!/usr/bin/env node
/** Put back any alias snapshot left behind by a crashed QA run. Local/Vercel database only. */
import { restoreAllSnapshots } from './lib/ipQaAliasSnapshot.mjs';

const out = await restoreAllSnapshots();
console.log(out.length ? `Restored ${out.length} snapshot(s).` : 'No alias snapshots to restore.');
