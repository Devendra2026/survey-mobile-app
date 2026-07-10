/**
 * Ensure vendored src/convex/_generated exists for Metro and TypeScript.
 * Syncs from the monorepo backend when present.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspacePaths, relativePath, surveyAppRoot } from './workspace-paths.mjs';

const root = surveyAppRoot();
const apiPath = path.join(root, 'src', 'convex', '_generated', 'api.d.ts');
const workspace = findWorkspacePaths(root);
const backendRoot = workspace?.backendRoot ?? null;

if (backendRoot) {
  const backendLabel = relativePath(root, backendRoot);
  console.log(`[ensure-convex-api] Syncing from ${backendLabel}/convex …`);
  execSync('node ./scripts/sync-convex.mjs', { stdio: 'inherit', cwd: root });
} else if (!existsSync(apiPath)) {
  console.error(
    '[ensure-convex-api] Missing src/convex/_generated/api.d.ts and no monorepo backend in workspace.',
  );
  console.error('[ensure-convex-api] Run from a workspace that includes packages/backend, or vendor src/convex/_generated.');
  process.exit(1);
} else {
  console.log('[ensure-convex-api] Using existing src/convex/_generated.');
}
