/**
 * Unit checks for photo upload queue reconcile (no device/APK required).
 */
import assert from 'node:assert/strict';
import { reconcilePhotoQueueEntries, type QueuedPhotoUpload } from '../src/utils/photoUploadQueue';

const LOCAL_ID = 'ls_test_abc';

async function run() {
  const existingQueue: QueuedPhotoUpload[] = [
    {
      localId: LOCAL_ID,
      slot: 'front',
      stage: 'needs_upload',
      localFilePath: 'file:///front.jpg',
      sizeKb: 100,
      width: 800,
      height: 600,
      capturedAt: 1,
    },
  ];

  const orphaned = reconcilePhotoQueueEntries(
    LOCAL_ID,
    [
      {
        slot: 'side',
        localUri: 'file:///side.jpg',
        sizeKb: 120,
        width: 900,
        height: 700,
        capturedAt: 2,
      },
    ],
    existingQueue,
    { hasSurveyId: true },
  );

  assert.equal(orphaned.length, 1);
  assert.equal(orphaned[0]!.slot, 'side');
  assert.equal(orphaned[0]!.stage, 'needs_upload');
  assert.equal(orphaned[0]!.localFilePath, 'file:///side.jpg');

  const none = reconcilePhotoQueueEntries(
    LOCAL_ID,
    [
      {
        slot: 'front',
        localUri: 'file:///front.jpg',
        storageId: 'storage123' as never,
        sizeKb: 100,
        width: 800,
        height: 600,
        capturedAt: 1,
      },
    ],
    existingQueue,
    { hasSurveyId: true },
  );
  assert.equal(none.length, 0);

  const needsSurvey = reconcilePhotoQueueEntries(
    LOCAL_ID,
    [
      {
        slot: 'side',
        localUri: 'file:///side2.jpg',
        sizeKb: 80,
        width: 640,
        height: 480,
        capturedAt: 3,
      },
    ],
    [],
    { hasSurveyId: false },
  );
  assert.equal(needsSurvey[0]!.stage, 'needs_survey');

  console.log('[verify-photo-upload-queue] OK — reconcile enqueues orphaned local photos only');
}

run().catch((err) => {
  console.error('[verify-photo-upload-queue] FAIL —', err);
  process.exit(1);
});
