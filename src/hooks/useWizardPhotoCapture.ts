/**
 * Shared capture / remove / replace for wizard photos (step 8 + review).
 * Local-first: JPEG saved on device immediately; Convex upload/link in background.
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useNetworkStatus } from '@/hooks/use-network-status';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import {
  clearPendingSurveyPhotoSlot,
  pickSurveyPhotoFromCamera,
  readPendingSurveyPhotoSlot,
  recoverPendingSurveyPhotoPick,
  setPendingSurveyPhotoSlot,
  uploadSurveyPhotoBytes,
} from '@/utils/captureSurveyPhoto';
import { toPhotoErrorMessage } from '@/utils/convex-storage';
import { withMutationRetry } from '@/utils/convexMutationRetry';
import { deleteLocalSurveyPhoto, readLocalSurveyPhotoBytes, saveLocalSurveyPhoto } from '@/utils/localPhotoStore';
import {
  dequeuePhotoUpload,
  enqueuePhotoUpload,
  hasPendingPhotoUploads,
  previewUrisFromQueue,
  readPhotoUploadQueue,
  reconcilePhotoQueueFromDraft,
  updatePhotoUploadQueueEntry,
  type QueuedPhotoUpload,
} from '@/utils/photoUploadQueue';
import {
  filterSurveyPhotos,
  photoPreviewUri,
  photoSlotCaptured,
  REQUIRED_SURVEY_PHOTO_SLOTS,
  SURVEY_PHOTO_SLOT_LABEL,
  type SurveyPhotoSlot,
  type WizardPhotoEntry,
} from '@/utils/surveyPhotos';
import { useMutation } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

type PickedPhoto = Extract<Awaited<ReturnType<typeof pickSurveyPhotoFromCamera>>, { canceled: false }>;

const LINK_RETRY_ATTEMPTS = 3;
const LINK_RETRY_BASE_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FlushPhotoQueueResult = {
  stillPending: boolean;
  error?: string;
};

function photoDraftEntryFromQueue(
  item: QueuedPhotoUpload,
  storageId: Id<'_storage'>,
  existing: (WizardPhotoEntry & { slot: SurveyPhotoSlot }) | undefined,
  uploadStatus: 'uploaded' | 'linked',
): WizardPhotoEntry & { slot: SurveyPhotoSlot } {
  if (existing) {
    return { ...existing, slot: item.slot, storageId, uploadStatus };
  }
  return {
    slot: item.slot,
    localUri: item.localFilePath,
    storageId,
    sizeKb: item.sizeKb,
    width: item.width,
    height: item.height,
    capturedAt: item.capturedAt,
    uploadStatus,
  };
}

export function useWizardPhotoCapture({
  draft,
  update,
  serverSurveyId,
  localId,
  onRecoveryError,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  serverSurveyId?: Id<'surveys'>;
  localId: string;
  onRecoveryError?: (message: string) => void;
}) {
  const { isOnline } = useNetworkStatus();
  const generateUploadUrl = useMutation(api.photos.mutations.generateUploadUrl);
  const releaseStorage = useMutation(api.photos.mutations.releaseStorage);
  const linkPhoto = useMutation(api.photos.mutations.linkPhoto);
  const removeBySurveySlot = useMutation(api.photos.mutations.removeBySurveySlot);

  const [uploadingSlot, setUploadingSlot] = useState<SurveyPhotoSlot | null>(null);
  const [previewBySlot, setPreviewBySlot] = useState<Partial<Record<SurveyPhotoSlot, string>>>({});
  const [pendingLinkCount, setPendingLinkCount] = useState(0);
  const captureInFlight = useRef(false);
  const pendingRecoveryDone = useRef(false);
  const flushInFlight = useRef(false);
  const mountedRef = useRef(true);
  const serverSurveyIdRef = useRef(serverSurveyId);
  serverSurveyIdRef.current = serverSurveyId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const surveyPhotos = filterSurveyPhotos(draft.photos);
  const surveyPhotosRef = useRef(surveyPhotos);
  surveyPhotosRef.current = surveyPhotos;
  const draftPhotosRef = useRef(draft.photos);
  draftPhotosRef.current = draft.photos;

  const photoBySlot = useMemo(() => new Map(surveyPhotos.map((p) => [p.slot, p])), [surveyPhotos]);

  const displayPreviews = useMemo(() => {
    const fromDraft: Partial<Record<SurveyPhotoSlot, string>> = {};
    for (const p of surveyPhotos) {
      const uri = photoPreviewUri(p);
      if (uri) fromDraft[p.slot] = uri;
    }
    return { ...fromDraft, ...previewBySlot };
  }, [previewBySlot, surveyPhotos]);

  const refreshPendingLinkCount = useCallback(async () => {
    const queue = await readPhotoUploadQueue();
    setPendingLinkCount(queue.filter((e) => e.localId === localId).length);
  }, [localId]);

  const patchPhotoInDraft = useCallback(
    async (slot: SurveyPhotoSlot, entry: WizardPhotoEntry & { slot: SurveyPhotoSlot }) => {
      const current = filterSurveyPhotos(surveyPhotosRef.current);
      const next = current.filter((p) => p.slot !== slot);
      next.push(entry);
      surveyPhotosRef.current = next;
      await update({ photos: next });
    },
    [update],
  );

  const photoEntryForSlot = useCallback((slot: SurveyPhotoSlot) => {
    return filterSurveyPhotos(surveyPhotosRef.current).find((p) => p.slot === slot);
  }, []);

  const linkPhotoWithRetry = useCallback(
    async (item: {
      surveyId: Id<'surveys'>;
      slot: SurveyPhotoSlot;
      storageId: Id<'_storage'>;
      sizeKb: number;
      width: number;
      height: number;
      capturedAt: number;
    }) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= LINK_RETRY_ATTEMPTS; attempt += 1) {
        try {
          // react-doctor-disable-next-line react-doctor/async-await-in-loop -- intentional retry backoff
          await withMutationRetry(() => linkPhoto(item));
          return;
        } catch (e) {
          lastError = e;
          if (attempt < LINK_RETRY_ATTEMPTS) {
            await delay(LINK_RETRY_BASE_MS * 2 ** (attempt - 1));
          }
        }
      }
      throw lastError;
    },
    [linkPhoto],
  );

  const uploadLocalPhoto = useCallback(
    async (surveyId: Id<'surveys'>, item: QueuedPhotoUpload): Promise<Id<'_storage'>> => {
      const [bytes, uploadUrl] = await Promise.all([
        readLocalSurveyPhotoBytes(item.localFilePath),
        withMutationRetry(() => generateUploadUrl({ surveyId })),
      ]);
      const { storageId } = await withMutationRetry(() => uploadSurveyPhotoBytes(uploadUrl, bytes));
      return storageId;
    },
    [generateUploadUrl],
  );

  const processQueueItem = useCallback(
    async (item: QueuedPhotoUpload, surveyId: Id<'surveys'>) => {
      let storageId = item.storageId as Id<'_storage'> | undefined;

      if (item.stage === 'needs_survey' || item.stage === 'needs_upload') {
        storageId = await uploadLocalPhoto(surveyId, item);
        await updatePhotoUploadQueueEntry(item.localId, item.slot, {
          stage: 'needs_link',
          storageId,
        });
        await patchPhotoInDraft(
          item.slot,
          photoDraftEntryFromQueue(item, storageId, photoEntryForSlot(item.slot), 'uploaded'),
        );
      }

      if (!storageId) {
        throw new Error(`Photo upload incomplete for ${item.slot} (stage: ${item.stage})`);
      }

      await linkPhotoWithRetry({
        surveyId,
        slot: item.slot,
        storageId,
        sizeKb: item.sizeKb,
        width: item.width,
        height: item.height,
        capturedAt: item.capturedAt,
      });

      await dequeuePhotoUpload(item.localId, item.slot);
      await patchPhotoInDraft(
        item.slot,
        photoDraftEntryFromQueue(item, storageId, photoEntryForSlot(item.slot), 'linked'),
      );
    },
    [linkPhotoWithRetry, patchPhotoInDraft, photoEntryForSlot, uploadLocalPhoto],
  );

  const flushWaiters = useRef<(() => void)[]>([]);

  const photosStillPendingCloudSync = useCallback(() => {
    return filterSurveyPhotos(surveyPhotosRef.current).some((p) => photoSlotCaptured(p) && !p.storageId);
  }, []);

  const flushPhotoQueue = useCallback(
    async (surveyId?: Id<'surveys'>, options?: { waitForInFlight?: boolean }): Promise<FlushPhotoQueueResult> => {
      const sid = surveyId ?? serverSurveyIdRef.current;
      if (!sid || !isOnline) {
        return {
          stillPending: photosStillPendingCloudSync() || (await hasPendingPhotoUploads(localId)),
          error: !isOnline ? 'Go online to upload photos' : undefined,
        };
      }

      if (flushInFlight.current) {
        if (options?.waitForInFlight) {
          await new Promise<void>((resolve) => {
            flushWaiters.current.push(resolve);
          });
        }
        if (flushInFlight.current) {
          return {
            stillPending: photosStillPendingCloudSync() || (await hasPendingPhotoUploads(localId)),
            error: 'Photo upload is still in progress — try again in a moment',
          };
        }
      }

      flushInFlight.current = true;
      try {
        await reconcilePhotoQueueFromDraft(localId, draftPhotosRef.current, { hasSurveyId: true });

        const queue = await readPhotoUploadQueue();
        const pending = queue.filter((e) => e.localId === localId);

        if (pending.length > 0) {
          await Promise.all(pending.map((item) => processQueueItem(item, sid)));
        }
      } catch (e) {
        return {
          stillPending: true,
          error: toPhotoErrorMessage(e),
        };
      } finally {
        flushInFlight.current = false;
        const waiters = flushWaiters.current.splice(0);
        for (const resolve of waiters) resolve();
        await refreshPendingLinkCount();
      }

      const stillPending = photosStillPendingCloudSync() || (await hasPendingPhotoUploads(localId));
      return {
        stillPending,
        error: stillPending
          ? 'Photos could not be synced to the cloud — try again or retake from the photos step'
          : undefined,
      };
    },
    [isOnline, localId, photosStillPendingCloudSync, processQueueItem, refreshPendingLinkCount],
  );

  const releasePhoto = useCallback(
    async (photo: WizardPhotoEntry) => {
      const isLinkedSurveySlot = serverSurveyId && (photo.slot === 'front' || photo.slot === 'side');

      if (isLinkedSurveySlot) {
        if (photo.localUri) await deleteLocalSurveyPhoto(photo.localUri);
        if (photo.storageId) {
          await removeBySurveySlot({ surveyId: serverSurveyId, slot: photo.slot });
        }
        return;
      }
      if (photo.localUri) await deleteLocalSurveyPhoto(photo.localUri);
      if (photo.storageId) {
        await releaseStorage({ storageId: photo.storageId });
      }
    },
    [releaseStorage, removeBySurveySlot, serverSurveyId],
  );

  const applyPickedPhoto = useCallback(
    async (slot: SurveyPhotoSlot, picked: PickedPhoto) => {
      const existing = photoBySlot.get(slot);
      setUploadingSlot(slot);

      try {
        const sizeKb = Math.max(1, Math.ceil(picked.jpegBytes.byteLength / 1024));
        const localUri = await saveLocalSurveyPhoto(localId, slot, picked.jpegBytes);
        const capturedAt = Date.now();

        const entry: WizardPhotoEntry & { slot: SurveyPhotoSlot } = {
          slot,
          localUri,
          sizeKb,
          width: picked.width ?? 0,
          height: picked.height ?? 0,
          capturedAt,
          uploadStatus: 'pending',
        };

        if (existing) {
          await releasePhoto(existing);
        }

        await patchPhotoInDraft(slot, entry);

        const stage = serverSurveyIdRef.current ? 'needs_upload' : 'needs_survey';
        await enqueuePhotoUpload({
          localId,
          slot,
          stage,
          localFilePath: localUri,
          sizeKb,
          width: picked.width ?? 0,
          height: picked.height ?? 0,
          capturedAt,
          previewUri: picked.uri,
        });
        await refreshPendingLinkCount();

        if (isOnline && serverSurveyIdRef.current) {
          void flushPhotoQueue(serverSurveyIdRef.current);
        }

        return { ok: true as const, label: SURVEY_PHOTO_SLOT_LABEL[slot] };
      } finally {
        setUploadingSlot(null);
      }
    },
    [flushPhotoQueue, isOnline, localId, patchPhotoInDraft, photoBySlot, refreshPendingLinkCount, releasePhoto],
  );

  useEffect(() => {
    void (async () => {
      const queue = await readPhotoUploadQueue();
      const fromQueue = previewUrisFromQueue(queue, localId);
      if (Object.keys(fromQueue).length > 0) {
        setPreviewBySlot((prev) => ({ ...fromQueue, ...prev }));
      }
      await refreshPendingLinkCount();
    })();
  }, [localId, refreshPendingLinkCount]);

  useEffect(() => {
    if (!isOnline || !serverSurveyId) return;
    void flushPhotoQueue(serverSurveyId);
  }, [flushPhotoQueue, isOnline, serverSurveyId]);

  const capture = useCallback(
    async (slot: SurveyPhotoSlot) => {
      if (captureInFlight.current) return;
      captureInFlight.current = true;
      try {
        // react-doctor-disable-next-line react-doctor/async-parallel — camera flow must set pending slot before launch and clear after return
        await setPendingSurveyPhotoSlot(slot);
        const picked = await pickSurveyPhotoFromCamera();
        await clearPendingSurveyPhotoSlot();
        if (picked.canceled) return;

        return await applyPickedPhoto(slot, picked);
      } catch (e) {
        await clearPendingSurveyPhotoSlot();
        return {
          ok: false as const,
          message: toPhotoErrorMessage(e),
        };
      } finally {
        captureInFlight.current = false;
      }
    },
    [applyPickedPhoto],
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || pendingRecoveryDone.current) return;

    let cancelled = false;
    void (async () => {
      const slot = await readPendingSurveyPhotoSlot();
      if (!slot || cancelled) return;

      const picked = await recoverPendingSurveyPhotoPick();
      if (cancelled || !picked || picked.canceled) return;

      if (captureInFlight.current) return;

      pendingRecoveryDone.current = true;
      await clearPendingSurveyPhotoSlot();
      captureInFlight.current = true;
      try {
        await applyPickedPhoto(slot, picked);
      } catch {
        onRecoveryError?.('Photo recovery failed — please capture again');
      } finally {
        captureInFlight.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyPickedPhoto, onRecoveryError]);

  const remove = useCallback(
    async (slot: SurveyPhotoSlot) => {
      const existing = photoBySlot.get(slot);
      if (!existing) return;
      await releasePhoto(existing);
      await dequeuePhotoUpload(localId, slot);
      const next = filterSurveyPhotos(surveyPhotosRef.current).filter((p) => p.slot !== slot);
      surveyPhotosRef.current = next;
      await Promise.all([refreshPendingLinkCount(), update({ photos: next })]);
      setPreviewBySlot((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
    },
    [localId, photoBySlot, refreshPendingLinkCount, releasePhoto, update],
  );

  const confirmRemove = (slot: SurveyPhotoSlot) => {
    Alert.alert(`Remove ${SURVEY_PHOTO_SLOT_LABEL[slot]}?`, 'You can capture a new photo afterward.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void remove(slot),
      },
    ]);
  };

  const capturedCount = REQUIRED_SURVEY_PHOTO_SLOTS.filter((s) => photoBySlot.has(s)).length;

  return {
    surveyPhotos,
    photoBySlot,
    previewBySlot: displayPreviews,
    uploadingSlot,
    capturedCount,
    requiredCount: REQUIRED_SURVEY_PHOTO_SLOTS.length,
    pendingLinkCount,
    hasPendingLinks: pendingLinkCount > 0,
    capture,
    confirmRemove,
    flushPhotoQueue,
    hasPendingPhotoUploads: () => hasPendingPhotoUploads(localId),
  };
}
