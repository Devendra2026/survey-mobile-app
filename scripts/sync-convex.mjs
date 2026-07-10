/**
 * Copy canonical convex/_generated from the monorepo backend into this repo.
 * Mobile bundles only need generated API types — not backend source files.
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = join(root, "..", "sdv-monorepo-apps", "packages", "backend", "convex", "_generated");
const target = join(root, "convex", "_generated");

mkdirSync(dirname(target), { recursive: true });

const cmd =
  process.platform === "win32"
    ? `robocopy "${source}" "${target}" /MIR /NFL /NDL /NJH /NJS`
    : `rsync -a --delete "${source}/" "${target}/"`;

console.log("[sync:convex] Mirroring _generated from sdv-monorepo-apps/packages/backend/convex …");
try {
  execSync(cmd, { stdio: "inherit", cwd: root });
} catch (err) {
  const code = err && typeof err === "object" && "status" in err ? err.status : 1;
  // robocopy: 0–7 = success with copies; >=8 = failure
  if (process.platform === "win32" && typeof code === "number" && code < 8) {
    console.log("[sync:convex] Done.");
    process.exit(0);
  }
  throw err;
}
console.log("[sync:convex] Done.");
