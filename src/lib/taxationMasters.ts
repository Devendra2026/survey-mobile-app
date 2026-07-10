/**
 * Taxation-step canonical dropdown values and idempotent masters seed.
 * Property-use subcategories are keyed by parent `property_use` value.
 */
import { resolveTaxRateZoneKey } from "../../lib/qc/tax-rate-matrix";

export type MasterOption = { value: string; label: string };

export const OWNERSHIP_TYPES: MasterOption[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'joint', label: 'Joint' },
  { value: 'limited_company_firm', label: 'Limited company / firm' },
  { value: 'trust_society', label: 'Trust / Society' },
  { value: 'religious_body', label: 'Religious body' },
  { value: 'state_government_body', label: 'State government body' },
  { value: 'central_government_body', label: 'Central government body' },
  { value: 'municipal_council_town_panchayat', label: 'Municipal council / Town Panchayat' },
  { value: 'lease_property', label: 'Lease property' },
];

export const PROPERTY_USES: MasterOption[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'open_land', label: 'Open land' },
  { value: 'religious_property', label: 'Religious property' },
  { value: 'mix_property', label: 'Mix property' },
];

export const PROPERTY_USE_SUBCATEGORIES: Record<string, MasterOption[]> = {
  residential: [
    { value: 'residential_self', label: 'Residential self' },
    { value: 'residential_rented', label: 'Residential rented' },
  ],
  commercial: [
    { value: 'shop_bakery', label: 'Shop / Bakery' },
    { value: 'bank_office', label: 'Bank / office' },
    { value: 'school_college', label: 'School / College' },
    { value: 'mall_showroom', label: 'Mall / Show room' },
    { value: 'petrol_pump', label: 'Petrol Pump' },
    { value: 'hotel_marriage_restaurant', label: 'Hotel / Marriage Garden / Restaurant' },
    { value: 'hospital_nursing_pathology', label: 'Hospital / Nursing Home / Pathology / Clinic' },
    { value: 'godown', label: 'Godown' },
    { value: 'central_government', label: 'Central Government' },
    { value: 'state_government', label: 'State Government' },
    { value: 'industry', label: 'Industry' },
    { value: 'cold_store', label: 'Cold Store' },
  ],
  open_land: [
    { value: 'open', label: 'Open' },
    { value: 'agriculture', label: 'Agriculture' },
    { value: 'open_land_godown', label: 'Godown' },
  ],
  religious_property: [
    { value: 'mandir', label: 'Mandir' },
    { value: 'masjid', label: 'Masjid' },
    { value: 'trust_dharamshala', label: 'Trust / Dharamshala' },
    { value: 'shamshan_kabristan', label: 'Shamshan / kabristan' },
    { value: 'gurudwara_church', label: 'Gurudwara / Church' },
  ],
  mix_property: [{ value: 'residential_and_commercial', label: 'Residential & commercial' }],
};

export const PROPERTY_USES_REQUIRING_SUBCATEGORY = Object.keys(PROPERTY_USE_SUBCATEGORIES);

export const ROAD_TYPES: MasterOption[] = [
  { value: 'rcc', label: 'RCC' },
  { value: 'dambar', label: 'Dambar' },
  { value: 'kaccha', label: 'Kaccha' },
];

export const TAX_RATE_ZONES: MasterOption[] = [
  { value: 'below_9m', label: 'Below 9 meter' },
  { value: '9_to_12m', label: '9 to 12 meter' },
  { value: '12_to_24m', label: '12 to 24 meter' },
  { value: 'above_24m', label: '24 meter above' },
];

export const SITUATIONS: MasterOption[] = [
  { value: 'main_market', label: 'Main market' },
  { value: 'main_road', label: 'Main road' },
  { value: 'interior', label: 'Interior' },
];

const OWNERSHIP_SET = new Set(OWNERSHIP_TYPES.map((o) => o.value));
const PROPERTY_USE_SET = new Set(PROPERTY_USES.map((o) => o.value));
const ROAD_TYPE_SET = new Set(ROAD_TYPES.map((o) => o.value));
const TAX_ZONE_SET = new Set(TAX_RATE_ZONES.map((o) => o.value));
const SITUATION_SET = new Set(SITUATIONS.map((o) => o.value));

/** Retired property uses ΓÇö still accepted on read for older surveys. */
const LEGACY_PROPERTY_USES = new Set(['agricultural_land']);

/** Retired commercial subcategories ΓÇö still accepted on read for older surveys. */
const LEGACY_COMMERCIAL_SUBCATEGORIES = new Set([
  'bank',
  'shop',
  'showroom',
  'office',
  'mall',
  'hospital',
  'petrol_pumps',
  'marriage_home',
  'hotel_restaurant',
]);

/** Retired mix subcategories ΓÇö still accepted on read for older surveys. */
const LEGACY_MIX_SUBCATEGORIES = new Set(['mix_residential', 'mix_commercial']);

const SUBCATEGORY_BY_USE = new Map<string, Set<string>>();
for (const [use, opts] of Object.entries(PROPERTY_USE_SUBCATEGORIES)) {
  SUBCATEGORY_BY_USE.set(use, new Set(opts.map((o) => o.value)));
}

export function propertyUseRequiresSubcategory(propertyUse: string): boolean {
  return SUBCATEGORY_BY_USE.has(propertyUse);
}

export function isValidPropertyUseSubcategory(propertyUse: string, subcategory: string): boolean {
  if (propertyUse === 'mix_property' && LEGACY_MIX_SUBCATEGORIES.has(subcategory)) return true;
  if (propertyUse === 'commercial' && LEGACY_COMMERCIAL_SUBCATEGORIES.has(subcategory)) return true;
  const allowed = SUBCATEGORY_BY_USE.get(propertyUse);
  return allowed ? allowed.has(subcategory) : false;
}

function isValidPropertyUse(propertyUse: string): boolean {
  return PROPERTY_USE_SET.has(propertyUse) || LEGACY_PROPERTY_USES.has(propertyUse);
}

/** Map legacy / alias zone keys to canonical values used in rate matrices. */
export function normalizeTaxRateZone(value?: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return resolveTaxRateZoneKey(trimmed);
}

/** Allowed tax zone keys: defaults, DB masters, labels, and their canonical aliases. */
export function buildAllowedTaxZoneSet(masterValues?: string[], masterLabels?: string[]): Set<string> {
  const allowed = new Set(TAX_RATE_ZONES.map((o) => o.value));
  const values = masterValues?.length ? masterValues : TAX_RATE_ZONES.map((o) => o.value);
  const labels = masterLabels?.length ? masterLabels : TAX_RATE_ZONES.map((o) => o.label);
  for (const value of values) {
    allowed.add(value);
    allowed.add(normalizeTaxRateZone(value));
  }
  for (const label of labels) {
    allowed.add(label);
    allowed.add(normalizeTaxRateZone(label));
  }
  return allowed;
}

export function normalizeTaxationFields<
  T extends {
    taxRateZone?: string;
  },
>(args: T): T {
  return {
    ...args,
    taxRateZone: normalizeTaxRateZone(args.taxRateZone),
  };
}

export function validateTaxationSection(
  input: {
    ownershipType?: string;
    propertyUse?: string;
    propertyType?: string;
    situation?: string;
    roadType?: string;
    taxRateZone?: string;
  },
  mode: 'draft' | 'submit' = 'submit',
  options?: { allowedTaxZones?: Set<string> },
): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  const strict = mode === 'submit';
  const taxZoneSet = options?.allowedTaxZones ?? TAX_ZONE_SET;

  const ownership = input.ownershipType?.trim() ?? '';
  if (strict && (!ownership || !OWNERSHIP_SET.has(ownership))) {
    details.ownershipType = ['Select a valid ownership type'];
  } else if (ownership && !OWNERSHIP_SET.has(ownership)) {
    details.ownershipType = ['Select a valid ownership type'];
  }

  const propertyUse = input.propertyUse?.trim() ?? '';
  if (strict && (!propertyUse || !isValidPropertyUse(propertyUse))) {
    details.propertyUse = ['Select a valid property use'];
  } else if (propertyUse && !isValidPropertyUse(propertyUse)) {
    details.propertyUse = ['Select a valid property use'];
  }

  const sub = input.propertyType?.trim() ?? '';
  if (propertyUse && propertyUseRequiresSubcategory(propertyUse)) {
    if (strict && (!sub || !isValidPropertyUseSubcategory(propertyUse, sub))) {
      details.propertyType = ['Select a valid property use subcategory'];
    } else if (sub && !isValidPropertyUseSubcategory(propertyUse, sub)) {
      details.propertyType = ['Subcategory is not valid for this property use'];
    }
  } else if (sub && propertyUse && !isValidPropertyUseSubcategory(propertyUse, sub)) {
    details.propertyType = ['Subcategory is not valid for this property use'];
  }

  const situation = input.situation?.trim() ?? '';
  if (strict && (!situation || !SITUATION_SET.has(situation))) {
    details.situation = ['Select a valid situation'];
  } else if (situation && !SITUATION_SET.has(situation)) {
    details.situation = ['Select a valid situation'];
  }

  const roadType = input.roadType?.trim() ?? '';
  if (strict && (!roadType || !ROAD_TYPE_SET.has(roadType))) {
    details.roadType = ['Select a valid road type'];
  } else if (roadType && !ROAD_TYPE_SET.has(roadType)) {
    details.roadType = ['Select a valid road type'];
  }

  const taxRateZone = normalizeTaxRateZone(input.taxRateZone);
  if (strict && (!taxRateZone || !taxZoneSet.has(taxRateZone))) {
    details.taxRateZone = ['Select a valid road size tax zone'];
  } else if (taxRateZone && !taxZoneSet.has(taxRateZone)) {
    details.taxRateZone = ['Select a valid road size tax zone'];
  }

  return details;
}
