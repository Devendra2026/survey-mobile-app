/**
 * Ensures production-like tax zone labels/values normalize to canonical keys
 * accepted by validation and rate matrices.
 * Run: npm run verify:tax-zone-validation
 */
import { TAX_RATE_ZONES, buildAllowedTaxZoneSet, validateTaxationSection } from '@/lib/taxationMasters';
import { resolveTaxRateZoneKey } from '../lib/qc/tax-rate-matrix';

const CANONICAL = new Set(TAX_RATE_ZONES.map((o) => o.value));

/** Typical production masters: canonical value for band 1, labels as values for 2–4. */
const PRODUCTION_MASTERS = [
  { value: 'below_9m', label: '9 Meter' },
  { value: '9\u201312 Meter', label: '9\u201312 Meter' },
  { value: '12\u201324 Meter', label: '12\u201324 Meter' },
  { value: '24 meter above', label: 'Above 24 Meter' },
];

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-tax-zone-validation] FAIL — ${msg}`);
    failed = true;
  }
}

const allowed = buildAllowedTaxZoneSet(
  PRODUCTION_MASTERS.map((m) => m.value),
  PRODUCTION_MASTERS.map((m) => m.label),
);

console.log('Production-like master normalization:');
for (const m of PRODUCTION_MASTERS) {
  const key = resolveTaxRateZoneKey(m.value);
  const canonical = CANONICAL.has(key);
  const errors = validateTaxationSection(
    {
      ownershipType: 'individual',
      propertyUse: 'open_land',
      situation: 'main_road',
      roadType: 'rcc',
      taxRateZone: m.value,
    },
    'submit',
    { allowedTaxZones: allowed },
  );
  const ok = !errors.taxRateZone;
  console.log(
    `  ${JSON.stringify(m.label)} value=${JSON.stringify(m.value)} -> ${JSON.stringify(key)} canonical=${canonical} valid=${ok}`,
  );
  assert(canonical, `${m.label} should normalize to a canonical rate-matrix key`);
  assert(ok, `${m.label} should pass validateTaxationSection`);
}

const userFacingLabels = ['9 Meter', '9\u201312 Meter', '12\u201324 Meter', 'Above 24 Meter'];
for (const label of userFacingLabels) {
  const key = resolveTaxRateZoneKey(label);
  assert(CANONICAL.has(key), `label ${JSON.stringify(label)} -> canonical key`);
}

if (failed) {
  process.exit(1);
}

console.log('\n[verify-tax-zone-validation] OK — all four road size bands normalize and validate.');
