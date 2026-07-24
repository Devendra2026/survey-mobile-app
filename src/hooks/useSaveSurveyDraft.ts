/**
 * Syncs a local AsyncStorage wizard draft to Convex (`survey.saveDraft`)
 * plus child rows (floors) when present. Photo linking is owned by
 * `useWizardPhotoCapture` / the photo upload queue to avoid duplicate writes.
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { draftToSaveDraftPayload, type WizardDraft } from '@/hooks/useWizardDraft';
import { withMutationRetry } from '@/utils/convexMutationRetry';
import { toUserMessage } from '@/utils/errors';
import { useConvex, useMutation } from 'convex/react';
import { useCallback, useState } from 'react';

export type DraftSyncSection = 'header' | 'floors' | 'photos';

export type SaveDraftResult = {
  surveyId: Id<'surveys'> | null;
  failedSections: DraftSyncSection[];
  sectionErrors: Partial<Record<DraftSyncSection, string>>;
};

export function formatSaveDraftError(result: SaveDraftResult): string {
  if (result.failedSections.length === 0) return '';
  return result.failedSections
    .map((s) => {
      const detail = result.sectionErrors[s];
      return detail ? `${s}: ${detail}` : s;
    })
    .join('; ');
}

function floorReadyForSync(f: NonNullable<WizardDraft['floors']>[number]): boolean {
  return !!(f.floorName && f.areaSqft > 0 && f.usageFactor && f.usageType && f.constructionType);
}

const EMPTY_SECTION_ERRORS: SaveDraftResult['sectionErrors'] = {};

/** Shared across all hook instances so review + steps cannot race. */
const saveInFlightByLocalId = new Map<string, Promise<SaveDraftResult>>();

export function useSaveSurveyDraft() {
  const convex = useConvex();
  const saveDraft = useMutation(api.surveys.mutations.saveDraft);
  const upsertFloor = useMutation(api.floors.mutations.upsert);
  const removeFloor = useMutation(api.floors.mutations.remove);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (draft: WizardDraft): Promise<SaveDraftResult> => {
      const existing = saveInFlightByLocalId.get(draft.localId);
      if (existing) return existing;

      const payload = draftToSaveDraftPayload(draft);
      if (!payload) return { surveyId: null, failedSections: [], sectionErrors: EMPTY_SECTION_ERRORS };

      const promise = (async (): Promise<SaveDraftResult> => {
        setSaving(true);
        const failedSections: DraftSyncSection[] = [];
        const sectionErrors: Partial<Record<DraftSyncSection, string>> = {};
        let surveyId: Id<'surveys'> | null = null;

        try {
          try {
            surveyId = await withMutationRetry(() => saveDraft(payload));
          } catch (e) {
            failedSections.push('header');
            sectionErrors.header = toUserMessage(e);
            return { surveyId: null, failedSections, sectionErrors };
          }

          const sid = surveyId;
          const floorSyncs: { f: NonNullable<WizardDraft['floors']>[number]; i: number }[] = [];
          const syncedFloorIds: string[] = [];
          (draft.floors ?? []).forEach((f, i) => {
            if (!floorReadyForSync(f)) return;
            floorSyncs.push({ f, i });
            syncedFloorIds.push(f.clientFloorId);
          });

          const upsertResults = await Promise.allSettled(
            floorSyncs.map(({ f, i }) =>
              withMutationRetry(() =>
                upsertFloor({
                  surveyId: sid,
                  clientFloorId: f.clientFloorId,
                  position: i,
                  floorName: f.floorName,
                  usageFactor: f.usageFactor,
                  usageType: f.usageType,
                  constructionType: f.constructionType,
                  isOccupied: f.isOccupied,
                  areaSqft: f.areaSqft,
                }),
              ),
            ),
          );

          const upsertFailed = upsertResults.filter((r) => r.status === 'rejected');
          if (upsertFailed.length > 0) {
            failedSections.push('floors');
            sectionErrors.floors = upsertFailed
              .map((r) => toUserMessage((r as PromiseRejectedResult).reason))
              .join('; ');
          } else {
            try {
              const keep = new Set(syncedFloorIds);
              const serverFloors = await withMutationRetry(() =>
                convex.query(api.floors.queries.list, { surveyId: sid }),
              );
              const removalPromises: ReturnType<typeof removeFloor>[] = [];
              for (const row of serverFloors) {
                if (!keep.has(row.clientFloorId)) {
                  removalPromises.push(withMutationRetry(() => removeFloor({ id: row._id })));
                }
              }
              const removalResults = await Promise.allSettled(removalPromises);
              const removalFailed = removalResults.filter((r) => r.status === 'rejected');
              if (removalFailed.length > 0) {
                failedSections.push('floors');
                sectionErrors.floors = removalFailed
                  .map((r) => toUserMessage((r as PromiseRejectedResult).reason))
                  .join('; ');
              }
            } catch (e) {
              failedSections.push('floors');
              sectionErrors.floors = toUserMessage(e);
            }
          }

          // Photos: linking is owned by useWizardPhotoCapture / photo upload queue.
          // Do not call linkPhoto here — avoids duplicate storage writes and retry storms.

          return { surveyId: sid, failedSections, sectionErrors };
        } finally {
          setSaving(false);
        }
      })();

      saveInFlightByLocalId.set(draft.localId, promise);
      try {
        return await promise;
      } finally {
        if (saveInFlightByLocalId.get(draft.localId) === promise) {
          saveInFlightByLocalId.delete(draft.localId);
        }
      }
    },
    [convex, saveDraft, upsertFloor, removeFloor],
  );

  return { save, saving };
}
