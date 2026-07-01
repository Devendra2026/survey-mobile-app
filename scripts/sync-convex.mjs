/**
 * Copy canonical convex/ from sdv-front-new-app into this repo (types + api paths).
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = join(root, "..", "sdv-front-new-app", "convex");
const target = join(root, "convex");

const cmd =
  process.platform === "win32"
    ? `robocopy "${source}" "${target}" /MIR /NFL /NDL /NJH /NJS`
    : `rsync -a --delete "${source}/" "${target}/"`;

console.log("[sync:convex] Mirroring from sdv-front-new-app/convex …");
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
