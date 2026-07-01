import type { WizardDraft } from '@/hooks/useWizardDraft';
import { draftToSaveDraftPayload } from '@/hooks/useWizardDraft';

/** Stable fingerprint for cloud sync — excludes volatile timestamps. */
export function draftSyncFingerprint(d: WizardDraft): string {
  const payload = draftToSaveDraftPayload(d);
  if (!payload) return `${d.localId}:empty`;

  const floorSig = (d.floors ?? [])
    .map((f) => `${f.clientFloorId}:${f.floorName}:${f.areaSqft}:${f.usageType}`)
    .join('|');
  const photoSig = (d.photos ?? []).map((p) => `${p.slot}:${p.localUri ?? p.storageId ?? ''}`).join('|');

  return [
    d.localId,
    payload.municipalityId,
    payload.wardNo,
    payload.parcelNo,
    payload.unitNo,
    d.respondentName,
    d.relationship,
    JSON.stringify(d.owners),
    floorSig,
    photoSig,
    d.gps ? `${d.gps.latitude},${d.gps.longitude}` : '',
    d.propertyUse,
    d.taxRateZone,
  ].join(':');
}
