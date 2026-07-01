/**
 * Offline / background photo cloud pipeline queue.
 * Stages: needs_survey → needs_upload → needs_link (legacy entries may start at needs_link).
 */
import type { SurveyPhotoSlot } from '@/utils/surveyPhotos';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'photo_upload_queue_v1';

export type PhotoUploadStage = 'needs_survey' | 'needs_upload' | 'needs_link';

export type QueuedPhotoUpload = {
  localId: string;
  slot: SurveyPhotoSlot;
  stage: PhotoUploadStage;
  /** Persistent file path from localPhotoStore (required for needs_survey / needs_upload). */
  localFilePath: string;
  storageId?: string;
  sizeKb: number;
  width: number;
  height: number;
  capturedAt: number;
  previewUri?: string;
};

/** @deprecated Use QueuedPhotoUpload — kept for migration from link-only queue rows. */
type LegacyQueuedPhotoUpload = {
  localId: string;
  slot: SurveyPhotoSlot;
  storageId: string;
  sizeKb: number;
  width: number;
  height: number;
  capturedAt: number;
  previewUri?: string;
  stage?: PhotoUploadStage;
  localFilePath?: string;
};

function normalizeQueueEntry(raw: LegacyQueuedPhotoUpload): QueuedPhotoUpload | null {
  if (!raw.localId || !raw.slot) return null;
  if (raw.stage && raw.localFilePath) {
    return raw as QueuedPhotoUpload;
  }
  if (raw.storageId) {
    return {
      localId: raw.localId,
      slot: raw.slot,
      stage: 'needs_link',
      localFilePath: raw.localFilePath ?? '',
      storageId: raw.storageId,
      sizeKb: raw.sizeKb,
      width: raw.width,
      height: raw.height,
      capturedAt: raw.capturedAt,
      previewUri: raw.previewUri,
    };
  }
  return null;
}

export async function enqueuePhotoUpload(entry: QueuedPhotoUpload): Promise<void> {
  const queue = await readPhotoUploadQueue();
  const without = queue.filter((e) => !(e.localId === entry.localId && e.slot === entry.slot));
  without.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(without));
}

export async function readPhotoUploadQueue(): Promise<QueuedPhotoUpload[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as LegacyQueuedPhotoUpload[];
  return parsed.map(normalizeQueueEntry).filter((e): e is QueuedPhotoUpload => e !== null);
}

/** True when photos still need cloud upload or link (blocks submit). */
export async function hasPendingPhotoUploads(localId: string): Promise<boolean> {
  const queue = await readPhotoUploadQueue();
  return queue.some((e) => e.localId === localId);
}

/** True when any cloud work remains for this draft (including link retries). */
export async function hasPendingPhotoCloudSync(localId: string): Promise<boolean> {
  const queue = await readPhotoUploadQueue();
  return queue.some((e) => e.localId === localId);
}

export function previewUrisFromQueue(
  queue: QueuedPhotoUpload[],
  localId: string,
): Partial<Record<SurveyPhotoSlot, string>> {
  const out: Partial<Record<SurveyPhotoSlot, string>> = {};
  for (const item of queue) {
    if (item.localId === localId) {
      const uri = item.previewUri ?? (item.localFilePath || undefined);
      if (uri) out[item.slot] = uri;
    }
  }
  return out;
}

export async function dequeuePhotoUpload(localId: string, slot: SurveyPhotoSlot): Promise<void> {
  const queue = await readPhotoUploadQueue();
  const next = queue.filter((e) => !(e.localId === localId && e.slot === slot));
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}

export async function updatePhotoUploadQueueEntry(
  localId: string,
  slot: SurveyPhotoSlot,
  patch: Partial<QueuedPhotoUpload>,
): Promise<void> {
  const queue = await readPhotoUploadQueue();
  const idx = queue.findIndex((e) => e.localId === localId && e.slot === slot);
  if (idx < 0) return;
  queue[idx] = { ...queue[idx]!, ...patch };
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
