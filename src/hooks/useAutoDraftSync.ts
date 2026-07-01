/**
 * Debounced background draft sync to Convex when online.
 */
import { useNetworkStatus } from '@/hooks/use-network-status';
import { formatSaveDraftError, useSaveSurveyDraft, type SaveDraftResult } from '@/hooks/useSaveSurveyDraft';
import { draftToSaveDraftPayload, type WizardDraft } from '@/hooks/useWizardDraft';
import { draftSyncFingerprint } from '@/utils/draftSyncFingerprint';
import { useCallback, useEffect, useRef } from 'react';

const AUTO_SYNC_DEBOUNCE_MS = 2000;

type SaveFn = (draft: WizardDraft) => Promise<SaveDraftResult>;

export function useAutoDraftSync(
  draft: WizardDraft | null,
  update: (patch: Partial<WizardDraft>) => Promise<void>,
  saveFromParent?: SaveFn,
) {
  const { isOnline } = useNetworkStatus();
  const { save: saveFromHook } = useSaveSurveyDraft();
  const save = saveFromParent ?? saveFromHook;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const lastSyncedFingerprint = useRef<string>('');

  const syncNow = useCallback(
    async (d: WizardDraft) => {
      if (!draftToSaveDraftPayload(d) || !isOnline || syncingRef.current) return null;

      syncingRef.current = true;
      try {
        const result = await save(d);
        if (!result.surveyId) return null;

        const patch = {
          serverSurveyId: result.surveyId,
          pendingCloudSync: result.failedSections.length > 0,
          lastSyncError: result.failedSections.length > 0 ? formatSaveDraftError(result) || 'Partial sync' : undefined,
          lastSyncedAt: Date.now(),
        };
        await update(patch);
        lastSyncedFingerprint.current = draftSyncFingerprint(d);
        return result.surveyId;
      } finally {
        syncingRef.current = false;
      }
    },
    [isOnline, save, update],
  );

  useEffect(() => {
    if (!draft || !isOnline || !draftToSaveDraftPayload(draft)) return;

    const fingerprint = draftSyncFingerprint(draft);
    if (fingerprint === lastSyncedFingerprint.current && draft.serverSurveyId && !draft.pendingCloudSync) {
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void syncNow(draft);
    }, AUTO_SYNC_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, isOnline, syncNow]);

  useEffect(() => {
    if (!draft || !isOnline) return;
    if (!draft.serverSurveyId || draft.pendingCloudSync) {
      void syncNow(draft);
    }
  }, [isOnline, draft, syncNow]);

  return { syncNow };
}
