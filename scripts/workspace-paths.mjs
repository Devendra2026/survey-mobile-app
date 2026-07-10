/**
 * Resolve monorepo web/backend paths relative to the survey app — no hardcoded repo name.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function hasMonorepoLayout(root) {
  const webRoot = path.join(root, 'apps', 'web');
  const backendRoot = path.join(root, 'packages', 'backend');
  if (!existsSync(path.join(webRoot, 'package.json'))) return null;
  if (!existsSync(path.join(backendRoot, 'convex'))) return null;
  return { workspaceRoot: root, webRoot, backendRoot };
}

/**
 * @param {string} [surveyRoot] Defaults to process.cwd()
 * @returns {{ workspaceRoot: string, webRoot: string, backendRoot: string } | null}
 */
export function findWorkspacePaths(surveyRoot = process.cwd()) {
  const resolvedSurveyRoot = path.resolve(surveyRoot);
  const parent = path.dirname(resolvedSurveyRoot);

  const candidates = [parent, resolvedSurveyRoot];
  try {
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidates.push(path.join(parent, entry.name));
      }
    }
  } catch {
    // parent may be unreadable; continue with direct candidates
  }

  for (const candidate of candidates) {
    const match = hasMonorepoLayout(candidate);
    if (match) return match;
  }

  return null;
}

/** @param {string} from @param {string} to */
export function relativePath(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

/** Survey app root (directory containing package.json for this app). */
export function surveyAppRoot() {
  return path.resolve(process.cwd());
}
