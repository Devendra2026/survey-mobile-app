/**
 * Convex deploy is owned by the monorepo backend (canonical backend).
 * Run from ../sdv-monorepo-apps/packages/backend: `npm run deploy:production`
 */
console.error(
  "[deploy] Convex backend lives in ../sdv-monorepo-apps/packages/backend/convex.\n" +
  "  cd ../sdv-monorepo-apps/packages/backend && npm run deploy:production\n" +
  "  Do not deploy from survey-app — it would fork the shared backend.\n",
);
process.exit(1);
