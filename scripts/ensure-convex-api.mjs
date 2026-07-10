/**
 * Ensure vendored convex/_generated exists for Metro and TypeScript.
 * Syncs from ../sdv-monorepo-apps when the sibling monorepo is present.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const apiPath = path.join(root, 'convex', '_generated', 'api.d.ts');
const monorepoConvex = path.join(root, '..', 'sdv-monorepo-apps', 'packages', 'backend', 'convex');

if (existsSync(monorepoConvex)) {
  console.log('[ensure-convex-api] Syncing from sdv-monorepo-apps/packages/backend/convex …');
  execSync('node ./scripts/sync-convex.mjs', { stdio: 'inherit', cwd: root });
} else if (!existsSync(apiPath)) {
  console.error(
    '[ensure-convex-api] Missing convex/_generated/api.d.ts and no monorepo sibling at ../sdv-monorepo-apps.',
  );
  console.error('[ensure-convex-api] Run from a workspace that includes both repos, or vendor convex/_generated.');
  process.exit(1);
} else {
  console.log('[ensure-convex-api] Using existing convex/_generated.');
}
