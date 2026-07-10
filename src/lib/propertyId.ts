export const PROPERTY_ID_PATTERN = /^\d{6}-\d{3}-\d{5}-\d{3}-[A-Z]$/;

export const LEGACY_PROPERTY_ID_PATTERN = /^\d{6}-\d{3}-\d{5}-[A-Z]$/;

export const PROPERTY_USE_CODES: Record<string, string> = {
  residential: "R",
  commercial: "C",
  open_land: "P",
  religious_property: "H",
  mix_property: "M",
  agricultural_land: "A",
};

export function padUlbCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(6, "0").slice(-6);
}

export function padWardNo(wardNo: string): string {
  const digits = wardNo.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(3, "0").slice(-3);
}

export function padParcelNo(parcelNo: string): string {
  const digits = parcelNo.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(5, "0").slice(-5);
}

export function padUnitNo(unitNo: string): string {
  const digits = unitNo.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(3, "0").slice(-3);
}

export function propertyUseCode(propertyUse: string | undefined): string {
  if (!propertyUse) return "";
  return PROPERTY_USE_CODES[propertyUse] ?? propertyUse.charAt(0).toUpperCase();
}

export function formatPropertyId(parts: {
  ulbCode: string;
  wardNo: string;
  parcelNo: string;
  unitNo: string;
  propertyUse: string;
}): string | undefined {
  const ulb = padUlbCode(parts.ulbCode);
  const ward = padWardNo(parts.wardNo);
  const parcel = padParcelNo(parts.parcelNo);
  const unit = padUnitNo(parts.unitNo);
  const use = propertyUseCode(parts.propertyUse);
  if (!ulb || !ward || !parcel || !unit || !use) return undefined;
  return `${ulb}-${ward}-${parcel}-${unit}-${use}`;
}

export function isNewPropertyIdFormat(id: string): boolean {
  return PROPERTY_ID_PATTERN.test(id.trim().toUpperCase());
}

export function resolvePropertyId(
  input: {
    propertyId?: string;
    wardNo?: string;
    parcelNo?: string;
    unitNo?: string;
    propertyUse?: string;
  },
  ulbCode: string,
): string | undefined {
  const generated = formatPropertyId({
    ulbCode,
    wardNo: input.wardNo ?? "",
    parcelNo: input.parcelNo ?? "",
    unitNo: input.unitNo ?? "",
    propertyUse: input.propertyUse ?? "",
  });
  if (generated) return generated;

  const manual = input.propertyId?.trim();
  if (manual && isNewPropertyIdFormat(manual)) {
    return manual.toUpperCase();
  }

  return manual ? manual.toUpperCase() : undefined;
}

export function formatPropertyIdSlots(parts: {
  ulbCode: string;
  wardNo: string;
  parcelNo: string;
  unitNo: string;
}): string | undefined {
  const ulb = padUlbCode(parts.ulbCode);
  const ward = padWardNo(parts.wardNo);
  const parcel = padParcelNo(parts.parcelNo);
  const unit = padUnitNo(parts.unitNo);
  if (!ulb || !ward || !parcel || !unit) return undefined;
  return `${ulb}-${ward}-${parcel}-${unit}`;
}

/** Full property ID when complete; otherwise ULB–ward–parcel–unit slots for live preview. */
export function displayPropertyId(
  input: {
    propertyId?: string;
    wardNo?: string;
    parcelNo?: string;
    unitNo?: string;
    propertyUse?: string;
  },
  ulbCode: string,
): string | undefined {
  const resolved = resolvePropertyId(input, ulbCode);
  if (resolved) return resolved;

  return formatPropertyIdSlots({
    ulbCode,
    wardNo: input.wardNo ?? "",
    parcelNo: input.parcelNo ?? "",
    unitNo: input.unitNo ?? "",
  });
}
