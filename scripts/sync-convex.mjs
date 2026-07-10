/**
 * Copy canonical convex/_generated from the monorepo backend into src/convex/_generated.
 * Mobile bundles only need generated API types — not backend source files.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspacePaths, relativePath, surveyAppRoot } from './workspace-paths.mjs';

const root = surveyAppRoot();
const workspace = findWorkspacePaths(root);
const backendRoot = workspace?.backendRoot ?? null;

if (!backendRoot) {
  console.error('[sync:convex] Could not find packages/backend in workspace.');
  console.error('[sync:convex] Run from a checkout that includes the monorepo (apps/web + packages/backend).');
  process.exit(1);
}

const source = path.join(backendRoot, 'convex', '_generated');
const target = path.join(root, 'src', 'convex', '_generated');
const sourceLabel = relativePath(root, source);

if (!existsSync(path.join(source, 'api.js'))) {
  console.error(`[sync:convex] Missing ${sourceLabel}/api.js — run convex dev in the backend first.`);
  process.exit(1);
}

mkdirSync(path.dirname(target), { recursive: true });

const cmd =
  process.platform === 'win32'
    ? `robocopy "${source}" "${target}" /MIR /NFL /NDL /NJH /NJS`
    : `rsync -a --delete "${source}/" "${target}/"`;

console.log(`[sync:convex] Mirroring _generated from ${sourceLabel} …`);
try {
  execSync(cmd, { stdio: 'inherit', cwd: root });
} catch (err) {
  const code = err && typeof err === 'object' && 'status' in err ? err.status : 1;
  // robocopy: 0–7 = success with copies; >=8 = failure
  if (process.platform === 'win32' && typeof code === 'number' && code < 8) {
    console.log('[sync:convex] Done.');
    process.exit(0);
  }
  throw err;
}
console.log('[sync:convex] Done.');
