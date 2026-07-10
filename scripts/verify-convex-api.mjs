/**
 * Fail fast when Convex generated API is missing (EAS / CI / typecheck).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const required = [
  path.join(root, 'convex', '_generated', 'api.d.ts'),
  path.join(root, 'convex', '_generated', 'api.js'),
  path.join(root, 'convex', '_generated', 'dataModel.d.ts'),
];

const missing = required.filter((p) => !existsSync(p));
if (missing.length > 0) {
  console.error('[verify-convex-api] Missing Convex generated files:');
  for (const p of missing) {
    console.error(`  - ${path.relative(root, p)}`);
  }
  console.error('[verify-convex-api] Run: npm run sync:convex (requires sdv-monorepo-apps sibling)');
  process.exit(1);
}

console.log('[verify-convex-api] OK — convex/_generated API present');
