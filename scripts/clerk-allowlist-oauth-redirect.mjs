/**
 * Allowlist mobile OAuth redirect URLs in Clerk (required for Google/Apple SSO in Expo).
 *
 * Requires CLERK_SECRET_KEY from ../sdv-front-new-app/.env.local or env.
 *
 * Usage:
 *   node ./scripts/clerk-allowlist-oauth-redirect.mjs
 *   node ./scripts/clerk-allowlist-oauth-redirect.mjs --url surveyapp://sso-callback
 *   node ./scripts/clerk-allowlist-oauth-redirect.mjs --prod   # sk_live_… only
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CLERK_API = 'https://api.clerk.com/v1';
const WEB_ROOT = path.join(process.cwd(), '..', 'sdv-front-new-app');
const MOBILE_ENV = path.join(process.cwd(), '.env.local');
const PROD_ENV = path.join(process.cwd(), '.env.prod');

/** Default redirect URLs used by this app (scheme from app.json + callback path). */
const DEFAULT_URLS = ['surveyapp://sso-callback', 'com.surveyapp.app://callback'];

let failed = false;

function fail(msg) {
  console.error(`[clerk-allowlist-oauth-redirect] FAIL — ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[clerk-allowlist-oauth-redirect] OK — ${msg}`);
}

function readEnvFile(filePath, key) {
  if (!existsSync(filePath)) return null;
  const text = readFileSync(filePath, 'utf8');
  const re = new RegExp(`^${key}=(.+)$`, 'm');
  return text.match(re)?.[1]?.trim() ?? null;
}

function resolveSecretKey(allowProd) {
  const fromEnv = process.env.CLERK_SECRET_KEY?.trim();
  if (fromEnv) return validateKey(fromEnv, allowProd);

  const envFiles = allowProd
    ? [PROD_ENV, MOBILE_ENV, path.join(WEB_ROOT, '.env.local')]
    : [MOBILE_ENV, path.join(WEB_ROOT, '.env.local'), PROD_ENV];

  for (const filePath of envFiles) {
    const key = readEnvFile(filePath, 'CLERK_SECRET_KEY');
    if (key) return validateKey(key, allowProd);
  }
  return null;
}

function validateKey(key, allowProd) {
  if (!allowProd && key.startsWith('sk_live_')) {
    fail('Refusing sk_live_ without --prod. Use development key or pass --prod explicitly.');
    return null;
  }
  return key;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let allowProd = false;
  const urls = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--prod') {
      allowProd = true;
    } else if (arg === '--url' && args[i + 1]) {
      urls.push(args[i + 1].trim());
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node ./scripts/clerk-allowlist-oauth-redirect.mjs [--url <redirect-url>] [--prod]

  Registers redirect URL(s) in Clerk for mobile SSO (Google/Apple OAuth).
  Default URLs: ${DEFAULT_URLS.join(', ')}`);
      process.exit(0);
    }
  }

  return { allowProd, urls: urls.length > 0 ? urls : DEFAULT_URLS };
}

async function clerkFetch(secretKey, pathname, options = {}) {
  const response = await fetch(`${CLERK_API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && Array.isArray(body.errors)
        ? body.errors.map((e) => e.long_message ?? e.message).join('; ')
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);
    throw new Error(`${response.status} ${pathname}: ${detail}`);
  }

  return body;
}

async function listRedirectUrls(secretKey) {
  const result = await clerkFetch(secretKey, '/redirect_urls?limit=100');
  return Array.isArray(result) ? result : (result?.data ?? []);
}

async function createRedirectUrl(secretKey, url) {
  return clerkFetch(secretKey, '/redirect_urls', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

async function main() {
  const { allowProd, urls } = parseArgs();
  const secretKey = resolveSecretKey(allowProd);
  if (!secretKey) {
    if (!failed) {
      fail(
        'CLERK_SECRET_KEY missing. Set it in .env.local, ../sdv-front-new-app/.env.local, or the environment.',
      );
    }
    process.exit(1);
  }

  if (failed) process.exit(1);

  const instance = secretKey.startsWith('sk_live_') ? 'production' : 'development';
  ok(`Using Clerk ${instance} instance`);

  let existing = [];
  try {
    existing = await listRedirectUrls(secretKey);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const existingUrls = new Set(existing.map((r) => r.url));

  for (const url of urls) {
    if (existingUrls.has(url)) {
      ok(`already allowlisted: ${url}`);
      continue;
    }
    try {
      await createRedirectUrl(secretKey, url);
      ok(`allowlisted: ${url}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists') || message.includes('duplicate')) {
        ok(`already allowlisted: ${url}`);
      } else {
        fail(message);
      }
    }
  }

  if (failed) process.exit(1);
  console.log('[clerk-allowlist-oauth-redirect] Done. Retry Google sign-in on the APK.\n');
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
