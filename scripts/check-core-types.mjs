#!/usr/bin/env node
// Regenerates @nomad/core's declarations from its JSDoc and fails if the committed
// packages/core/types differs (stale, missing or extra files), so the published type
// contract can never drift from the runtime code again.
import { execFileSync } from 'node:child_process';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

run('npm', ['run', 'build:types', '--workspace', '@nomad/core']);
const drift = run('git', ['status', '--porcelain', '--', 'packages/core/types']).trim();

if (drift) {
  console.error('packages/core/types is out of date with the JSDoc in packages/core:\n' + drift);
  console.error('\nRun `npm run build:types --workspace @nomad/core` and commit the result.');
  process.exit(1);
}
console.log('packages/core/types is up to date.');
