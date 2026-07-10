const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export function isValidIndianOwnerMobile(value: string): boolean {
  return INDIAN_MOBILE_RE.test(value.trim());
}

/** Primary contact from owner rows — first valid Indian mobile only. */
export function primaryOwnerMobileFromOwners(
  owners: { mobileNo?: string }[] | undefined,
  relationship?: string,
): string | undefined {
  void relationship;
  if (!owners?.length) return undefined;
  for (const o of owners) {
    const m = o.mobileNo?.trim();
    if (m && isValidIndianOwnerMobile(m)) return m;
  }
  return undefined;
}
