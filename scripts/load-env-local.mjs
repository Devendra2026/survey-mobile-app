import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load `.env.local` into process.env (does not override existing vars).
 * Mirrors what Expo prints as `env: load .env.local` — used by start scripts
 * so `npm run dev` and `npm run dev:tunnel` load the same keys as Expo.
 */
/** Remove ` # comment` suffix (common in .env.local); preserves `#` inside quoted values. */
function stripInlineComment(value) {
  let inQuote = false;
  let quote = "";
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (!inQuote && (c === '"' || c === "'")) {
      inQuote = true;
      quote = c;
    } else if (inQuote && c === quote) {
      inQuote = false;
    } else if (!inQuote && c === "#" && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value.trim();
}

export function loadEnvLocal(cwd = process.cwd()) {
  const path = join(cwd, ".env.local");
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let val = stripInlineComment(trimmed.slice(eq + 1).trim());
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Skip `KEY=` — empty values block fallbacks (e.g. NGROK_AUTHTOKEN from ngrok.yml)
    if (!val) continue;
    process.env[key] = val.trim();
  }
  return true;
}
