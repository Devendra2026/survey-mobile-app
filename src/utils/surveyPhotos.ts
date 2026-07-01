import type { WizardDraft } from '@/hooks/useWizardDraft';

export type SurveyPhotoSlot = 'front' | 'side';

export function isSurveyPhotoSlot(value: string | null | undefined): value is SurveyPhotoSlot {
  return value === 'front' || value === 'side';
}

export const REQUIRED_SURVEY_PHOTO_SLOTS: SurveyPhotoSlot[] = ['front', 'side'];

export const SURVEY_PHOTO_SLOT_LABEL: Record<SurveyPhotoSlot, string> = {
  front: 'Front view',
  side: 'Side view',
};

export type WizardPhotoEntry = NonNullable<WizardDraft['photos']>[number];

export function filterSurveyPhotos(photos: WizardDraft['photos']): (WizardPhotoEntry & { slot: SurveyPhotoSlot })[] {
  return (photos ?? []).filter(
    (p): p is WizardPhotoEntry & { slot: SurveyPhotoSlot } => p.slot === 'front' || p.slot === 'side',
  );
}

export function photoSlotCaptured(photo: WizardPhotoEntry): boolean {
  return Boolean(photo.localUri || photo.storageId);
}

export function surveyPhotosComplete(photos: WizardDraft['photos']): boolean {
  const bySlot = new Map(filterSurveyPhotos(photos).map((p) => [p.slot, p]));
  return REQUIRED_SURVEY_PHOTO_SLOTS.every((s) => {
    const p = bySlot.get(s);
    return p != null && photoSlotCaptured(p);
  });
}

export function hasPhotosPendingCloudSync(photos: WizardDraft['photos']): boolean {
  return filterSurveyPhotos(photos).some((p) => photoSlotCaptured(p) && !p.storageId);
}

export function photoPreviewUri(photo: WizardPhotoEntry | undefined): string | undefined {
  if (!photo) return undefined;
  return photo.localUri ?? photo.url;
}
