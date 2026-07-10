/**
 * Fail fast when Convex generated API is missing (EAS / CI / typecheck).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { surveyAppRoot } from './workspace-paths.mjs';

const root = surveyAppRoot();
const required = [
  path.join(root, 'src', 'convex', '_generated', 'api.d.ts'),
  path.join(root, 'src', 'convex', '_generated', 'api.js'),
  path.join(root, 'src', 'convex', '_generated', 'dataModel.d.ts'),
];

const missing = required.filter((p) => !existsSync(p));
if (missing.length > 0) {
  console.error('[verify-convex-api] Missing Convex generated files:');
  for (const p of missing) {
    console.error(`  - ${path.relative(root, p)}`);
  }
  console.error('[verify-convex-api] Run: npm run sync:convex (requires monorepo packages/backend)');
  process.exit(1);
}

console.log('[verify-convex-api] OK — src/convex/_generated API present');
