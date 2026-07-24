/**
 * Debounced background draft sync to Convex when online.
 * Single debounce path + capped exponential backoff for pending/first-create.
 * Fingerprint is module-scoped so step remounts do not re-save unchanged drafts.
 */
import { useNetworkStatus } from '@/hooks/use-network-status';
import { formatSaveDraftError, useSaveSurveyDraft, type SaveDraftResult } from '@/hooks/useSaveSurveyDraft';
import { draftToSaveDraftPayload, type WizardDraft } from '@/hooks/useWizardDraft';
import { draftSyncFingerprint } from '@/utils/draftSyncFingerprint';
import { useCallback, useEffect, useRef } from 'react';

const AUTO_SYNC_DEBOUNCE_MS = 4000;
const BACKOFF_SCHEDULE_MS = [5000, 15000, 60000] as const;
const MAX_BACKOFF_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;

/** Survives WizardStepFrame remounts across wizard navigation. */
const lastSyncedFingerprintByLocalId = new Map<string, string>();
const backoffAttemptByLocalId = new Map<string, number>();

type SaveFn = (draft: WizardDraft) => Promise<SaveDraftResult>;

export function getLastSyncedFingerprint(localId: string): string {
  return lastSyncedFingerprintByLocalId.get(localId) ?? '';
}

export function clearDraftSyncState(localId: string): void {
  lastSyncedFingerprintByLocalId.delete(localId);
  backoffAttemptByLocalId.delete(localId);
}

export function useAutoDraftSync(
  draft: WizardDraft | null,
  update: (patch: Partial<WizardDraft>) => Promise<void>,
  saveFromParent?: SaveFn,
) {
  const { isOnline } = useNetworkStatus();
  const { save: saveFromHook } = useSaveSurveyDraft();
  const save = saveFromParent ?? saveFromHook;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const wasOnlineRef = useRef(isOnline);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const clearTimers = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (backoffRef.current) {
      clearTimeout(backoffRef.current);
      backoffRef.current = null;
    }
  }, []);

  const syncNow = useCallback(
    async (d: WizardDraft) => {
      if (!draftToSaveDraftPayload(d) || !isOnline || syncingRef.current) return null;

      syncingRef.current = true;
      try {
        const result = await save(d);
        if (!result.surveyId) {
          // Header failed — schedule capped backoff, do not fingerprint.
          const attempt = backoffAttemptByLocalId.get(d.localId) ?? 0;
          if (attempt < MAX_BACKOFF_ATTEMPTS) {
            backoffAttemptByLocalId.set(d.localId, attempt + 1);
          }
          return null;
        }

        const clean = result.failedSections.length === 0;
        const patch = {
          serverSurveyId: result.surveyId,
          pendingCloudSync: !clean,
          lastSyncError: clean ? undefined : formatSaveDraftError(result) || 'Partial sync',
          lastSyncedAt: Date.now(),
        };
        await update(patch);

        if (clean) {
          lastSyncedFingerprintByLocalId.set(d.localId, draftSyncFingerprint(d));
          backoffAttemptByLocalId.delete(d.localId);
        } else {
          // Partial sync — backoff retry, do not treat as fully synced.
          const attempt = backoffAttemptByLocalId.get(d.localId) ?? 0;
          if (attempt < MAX_BACKOFF_ATTEMPTS) {
            backoffAttemptByLocalId.set(d.localId, attempt + 1);
          }
        }
        return result.surveyId;
      } finally {
        syncingRef.current = false;
      }
    },
    [isOnline, save, update],
  );

  const scheduleBackoffIfNeeded = useCallback(
    (d: WizardDraft) => {
      if (!isOnline || !draftToSaveDraftPayload(d)) return;
      const needsBackoff = !d.serverSurveyId || d.pendingCloudSync;
      if (!needsBackoff) return;

      const attempt = backoffAttemptByLocalId.get(d.localId) ?? 0;
      if (attempt >= MAX_BACKOFF_ATTEMPTS) return;
      if (backoffRef.current || syncingRef.current) return;

      const delay = BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)]!;
      backoffRef.current = setTimeout(() => {
        backoffRef.current = null;
        const current = draftRef.current;
        if (current && current.localId === d.localId) {
          void syncNow(current);
        }
      }, delay);
    },
    [isOnline, syncNow],
  );

  // Single debounce path for content changes.
  useEffect(() => {
    if (!draft || !isOnline || !draftToSaveDraftPayload(draft)) return;

    const fingerprint = draftSyncFingerprint(draft);
    const lastFp = lastSyncedFingerprintByLocalId.get(draft.localId) ?? '';
    if (fingerprint === lastFp && draft.serverSurveyId && !draft.pendingCloudSync) {
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void syncNow(draft).then(() => {
        // After a content-driven sync, schedule backoff only if still pending.
        const current = draftRef.current;
        if (current) scheduleBackoffIfNeeded(current);
      });
    }, AUTO_SYNC_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [draft, isOnline, syncNow, scheduleBackoffIfNeeded]);

  // Online reconnect: one backoff-scheduled sync (not immediate keystroke flood).
  useEffect(() => {
    const cameOnline = isOnline && !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!cameOnline || !draft) return;
    if (!draftToSaveDraftPayload(draft)) return;

    // Reset attempt counter on reconnect so a fresh retry is allowed.
    backoffAttemptByLocalId.set(draft.localId, 0);
    scheduleBackoffIfNeeded(draft);
  }, [isOnline, draft, scheduleBackoffIfNeeded]);

  // Schedule backoff when pending/first-create (not on every field keystroke).
  const serverSurveyId = draft?.serverSurveyId;
  const pendingCloudSync = draft?.pendingCloudSync;
  const localId = draft?.localId;
  useEffect(() => {
    if (!localId || !isOnline) return;
    if (!serverSurveyId || pendingCloudSync) {
      const current = draftRef.current;
      if (current && current.localId === localId) {
        scheduleBackoffIfNeeded(current);
      }
    }
  }, [serverSurveyId, pendingCloudSync, localId, isOnline, scheduleBackoffIfNeeded]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return { syncNow };
}
