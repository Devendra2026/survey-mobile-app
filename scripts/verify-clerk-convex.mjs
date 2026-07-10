/**
 * Ensure mobile EAS env, Convex JWT issuer, and Clerk keys are aligned.
 *
 * Usage:
 *   node ./scripts/verify-clerk-convex.mjs
 *     Dev: .env.local + optional web .env.local cross-check
 *   node ./scripts/verify-clerk-convex.mjs --prod --target android
 *     EAS preview / fleet APK: .env.prod + EAS preview + Convex issuer (no web .env.production required)
 *   node ./scripts/verify-clerk-convex.mjs --prod --target full
 *     Production cross-app: android checks + optional web .env.production consistency
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildConvexCliEnv, parseEnvFile } from './read-env-file.mjs';
import { findWorkspacePaths, relativePath, surveyAppRoot } from './workspace-paths.mjs';

const argv = process.argv.slice(2);
const isProd = argv.includes('--prod');
const targetFlag = argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
  ?? (argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : null);
const target = isProd ? (targetFlag === 'full' ? 'full' : 'android') : 'full';

let failed = false;
let lastConvexIssuer = null;

function fail(msg) {
  console.error(`[verify-clerk-convex] ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[verify-clerk-convex] OK — ${msg}`);
}

function warn(msg) {
  console.warn(`[verify-clerk-convex] WARN — ${msg}`);
}

function clerkIssuerFromPublishableKey(pk) {
  const match = pk.trim().match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    const host = Buffer.from(match[1], 'base64').toString('utf8').replace(/\$$/, '');
    return `https://${host}`;
  } catch {
    return null;
  }
}

function readConvexIssuer(backendRoot, useProductionEnv) {
  const envFileName = useProductionEnv ? '.env.production' : '.env.local';
  const envFilePath = path.join(backendRoot, envFileName);
  if (!existsSync(envFilePath)) {
    throw new Error(`Missing ${envFilePath}`);
  }
  return execSync(`npx convex env get CLERK_JWT_ISSUER_DOMAIN --env-file ${envFileName}`, {
    encoding: 'utf8',
    cwd: backendRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: buildConvexCliEnv(envFilePath),
  }).trim();
}

const surveyRoot = surveyAppRoot();
const workspace = findWorkspacePaths(surveyRoot);
const webRoot = workspace?.webRoot ?? null;
const backendRoot = workspace?.backendRoot ?? null;
const webRel = webRoot ? relativePath(surveyRoot, webRoot) : 'apps/web';
const backendRel = backendRoot ? relativePath(surveyRoot, backendRoot) : 'packages/backend';

const fleetEnvPath = isProd ? path.join(surveyRoot, '.env.prod') : path.join(surveyRoot, '.env.local');
const fleetEnvName = isProd ? '.env.prod' : '.env.local';

const fleetEnv = existsSync(fleetEnvPath) ? parseEnvFile(fleetEnvPath) : {};
const mobilePk = fleetEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null;
const mobileIssuer = fleetEnv.CLERK_JWT_ISSUER_DOMAIN ?? null;

function runAndroidProdChecks() {
  if (!mobilePk?.startsWith('pk_live_')) {
    fail('.env.prod must use Clerk production key (pk_live_…)');
  } else {
    ok('.env.prod uses Clerk production key (pk_live_…)');
  }

  const mobileIssuerFromPk = mobilePk ? clerkIssuerFromPublishableKey(mobilePk) : null;
  if (mobileIssuerFromPk) {
    ok(`Clerk issuer from publishable key (${mobileIssuerFromPk})`);
  } else if (mobilePk) {
    fail('.env.prod EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key');
  }

  if (!backendRoot) {
    fail(`Could not find packages/backend in workspace — required to verify Convex CLERK_JWT_ISSUER_DOMAIN`);
    return;
  }

  let convexIssuer = null;
  try {
    convexIssuer = readConvexIssuer(backendRoot, true);
    lastConvexIssuer = convexIssuer;
  } catch (err) {
    fail(
      `Could not read Convex CLERK_JWT_ISSUER_DOMAIN: ${err instanceof Error ? err.message : err}\n` +
        `  cd ${backendRel} && npx convex env set CLERK_JWT_ISSUER_DOMAIN …`,
    );
    return;
  }

  const targetIssuer = mobileIssuerFromPk ?? (mobileIssuer ? mobileIssuer.replace(/\/$/, '') : null);
  const normalizedConvex = convexIssuer.replace(/\/$/, '');

  if (targetIssuer && normalizedConvex && targetIssuer !== normalizedConvex) {
    fail(
      `Convex issuer (${normalizedConvex}) does not match fleet Clerk (${targetIssuer}).\n` +
        `  cd ${backendRel} && npx convex env set CLERK_JWT_ISSUER_DOMAIN …`,
    );
  } else if (targetIssuer && normalizedConvex) {
    ok(`Convex issuer matches production Clerk (${normalizedConvex})`);
  }

  const easEnvironment = 'preview';
  let easPk = null;
  try {
    const easOut = execSync(`npx eas-cli env:list --environment ${easEnvironment}`, {
      encoding: 'utf8',
      cwd: surveyRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const easLine = easOut.split('\n').find((line) => line.startsWith('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='));
    easPk = easLine?.slice('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='.length).trim() ?? null;
  } catch (err) {
    fail(`Could not read EAS ${easEnvironment} env: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (mobilePk && easPk && mobilePk !== easPk) {
    fail(`${fleetEnvName} Clerk key does not match EAS ${easEnvironment}`);
  } else if (mobilePk && easPk) {
    ok(`${fleetEnvName} matches EAS ${easEnvironment} Clerk key`);
  }
}

function runOptionalWebProdCrossCheck() {
  if (!webRoot) {
    warn('Web app root not found; skipping optional web production cross-check');
    return;
  }

  const webProdEnvPath = path.join(webRoot, '.env.production');
  const webProdLabel = `${webRel}/.env.production`;

  if (!existsSync(webProdEnvPath)) {
    warn(`${webProdLabel} not found; skipping optional web cross-check`);
    return;
  }

  const webEnv = parseEnvFile(webProdEnvPath);
  const webPk = webEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null;
  const webIssuer = webEnv.CLERK_JWT_ISSUER_DOMAIN ?? null;

  if (webPk && mobilePk && webPk !== mobilePk) {
    fail(`Web .env.production and .env.prod use different Clerk publishable keys`);
  } else if (webPk && mobilePk) {
    ok('Web .env.production and .env.prod use the same Clerk publishable key');
  }

  if (webIssuer && mobileIssuer && webIssuer !== mobileIssuer) {
    fail(`Web issuer (${webIssuer}) does not match .env.prod CLERK_JWT_ISSUER_DOMAIN (${mobileIssuer})`);
  } else if (webIssuer && mobileIssuer) {
    ok(`Fleet and web production issuer (${webIssuer})`);
  }

  if (webIssuer && lastConvexIssuer && webIssuer.replace(/\/$/, '') !== lastConvexIssuer.replace(/\/$/, '')) {
    fail(`Web .env.production CLERK_JWT_ISSUER_DOMAIN (${webIssuer}) does not match Convex (${lastConvexIssuer})`);
  }
}

function runDevChecks() {
  if (!webRoot) {
    warn('Web app root not found; skipping web dev cross-check');
    return;
  }

  const webEnvPath = path.join(webRoot, '.env.local');
  const webEnv = parseEnvFile(webEnvPath);
  const webPk = webEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null;
  const webEnvLabel = `${webRel}/.env.local`;

  const easEnvironment = 'preview';
  let easPk = null;
  try {
    const easOut = execSync(`npx eas-cli env:list --environment ${easEnvironment}`, {
      encoding: 'utf8',
      cwd: surveyRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const easLine = easOut.split('\n').find((line) => line.startsWith('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='));
    easPk = easLine?.slice('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='.length).trim() ?? null;
  } catch (err) {
    console.warn(
      `[verify-clerk-convex] Could not read EAS ${easEnvironment} env (skipped in dev): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let convexIssuer = null;
  if (backendRoot) {
    try {
      convexIssuer = readConvexIssuer(backendRoot, false);
    } catch {
      warn('Skipping Convex issuer check (no dev Convex env configured)');
    }
  }

  const targetPk = easPk;
  const targetIssuer = targetPk ? clerkIssuerFromPublishableKey(targetPk) : null;

  if (targetIssuer && convexIssuer && targetIssuer !== convexIssuer) {
    fail(
      `Convex issuer (${convexIssuer}) does not match EAS Clerk (${targetIssuer}).\n` +
        `  cd ${backendRel} && npx convex env set CLERK_JWT_ISSUER_DOMAIN …`,
    );
  } else if (targetIssuer && convexIssuer) {
    ok(`Convex issuer matches EAS Clerk (${convexIssuer})`);
  }

  if (webPk && mobilePk) {
    const webIssuerFromPk = clerkIssuerFromPublishableKey(webPk);
    const mobileIssuerFromPk = clerkIssuerFromPublishableKey(mobilePk);
    if (webIssuerFromPk !== mobileIssuerFromPk) {
      fail(`Web and mobile dev use different Clerk instances.\n  Web: ${webIssuerFromPk}\n  Mobile: ${mobileIssuerFromPk}`);
    } else {
      ok('Web .env.local and survey-app .env.local use the same Clerk app');
    }
  } else if (webPk && easPk) {
    const webIssuerFromPk = clerkIssuerFromPublishableKey(webPk);
    const easIssuer = clerkIssuerFromPublishableKey(easPk);
    if (webIssuerFromPk !== easIssuer) {
      fail(
        `Web app uses a different Clerk instance than mobile/EAS.\n` +
          `  Web: ${webIssuerFromPk ?? 'invalid'}\n` +
          `  Mobile/EAS: ${easIssuer ?? 'invalid'}\n` +
          `  Update ${webEnvLabel} to match survey-app dev keys.`,
      );
    } else {
      ok('Web .env.local uses the same Clerk app as mobile/EAS');
    }
  } else if (webPk && easPk === null) {
    ok('Web .env.local present (EAS not checked)');
  } else if (!webPk) {
    fail(`${webEnvLabel} missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`);
  }
}

if (!existsSync(fleetEnvPath)) {
  fail(`${fleetEnvName} missing — copy from README for ${isProd ? 'fleet' : 'dev'} alignment checks`);
} else if (isProd && target === 'android') {
  runAndroidProdChecks();
  runOptionalWebProdCrossCheck();
} else if (isProd && target === 'full') {
  runAndroidProdChecks();
  runOptionalWebProdCrossCheck();
} else if (!isProd) {
  runDevChecks();
}

if (failed) {
  const label = isProd ? 'Android/EAS' : 'Clerk/Convex';
  console.error(`\n[verify-clerk-convex] ${label} verification failed — fix the errors above.\n`);
  process.exit(1);
}

if (isProd && target === 'android') {
  console.log('\n[verify-clerk-convex] OK — Android Clerk/Convex configuration is aligned.\n');
} else if (isProd) {
  console.log('\n[verify-clerk-convex] OK — Production Clerk/Convex configuration is aligned.\n');
} else {
  console.log('\n[verify-clerk-convex] OK — Development Clerk/Convex configuration is aligned.\n');
}
