/**
 * Convex deploy is owned by the web app (canonical backend).
 * Run from ../sdv-front-new-app: `npx convex deploy` (or add a deploy script there).
 */
console.error(
  "[deploy] Convex backend lives in ../sdv-front-new-app/convex.\n" +
  "  cd ../sdv-front-new-app && npx convex deploy\n" +
  "  Do not deploy from survey-app — it would fork the shared backend.\n",
);
process.exit(1);
