/**
 * Unit checks for photo upload queue reconcile + URI helpers (no device/APK required).
 * Run via: npm run verify:photo-upload-queue
 */
import { reconcilePhotoQueueEntries, type QueuedPhotoUpload } from '../src/utils/photoUploadQueue';
import { missingLocalPhotoMessage, samePhotoUri } from '../src/utils/surveyPhotos';

const LOCAL_ID = 'ls_test_abc';

let failed = false;

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    console.error(`[verify-photo-upload-queue] FAIL — ${msg} (got ${String(actual)}, expected ${String(expected)})`);
    failed = true;
  }
}

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

assertEqual(orphaned.length, 1, 'orphaned length');
assertEqual(orphaned[0]?.slot, 'side', 'orphaned slot');
assertEqual(orphaned[0]?.stage, 'needs_upload', 'orphaned stage');
assertEqual(orphaned[0]?.localFilePath, 'file:///side.jpg', 'orphaned localFilePath');

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
assertEqual(none.length, 0, 'uploaded photo is not re-enqueued');

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
assertEqual(needsSurvey[0]?.stage, 'needs_survey', 'stage without survey id');

// Retake uses a fixed slot path — same URI must match so we skip deleting the new file.
const slotPath = 'file:///data/user/0/com.surveyapp.app/files/survey_photos/ls_mryphzu0_s8d70o/front.jpg';
assertEqual(samePhotoUri(slotPath, slotPath), true, 'same URI equals itself');
assertEqual(
  samePhotoUri(slotPath, 'file:///data/user/0/com.surveyapp.app/files/survey_photos/ls_mryphzu0_s8d70o/front.jpg'),
  true,
  'identical file:// URIs match',
);
assertEqual(
  samePhotoUri(slotPath, '/data/user/0/com.surveyapp.app/files/survey_photos/ls_mryphzu0_s8d70o/front.jpg'),
  true,
  'file:// and bare path match',
);
assertEqual(
  samePhotoUri(slotPath, 'file:///data/user/0/com.surveyapp.app/files/survey_photos/ls_mryphzu0_s8d70o/side.jpg'),
  false,
  'front and side paths differ',
);
assertEqual(samePhotoUri(undefined, slotPath), false, 'undefined left URI');
assertEqual(samePhotoUri(slotPath, undefined), false, 'undefined right URI');

assertEqual(
  missingLocalPhotoMessage('front'),
  'Retake Front view — the local photo file is missing',
  'front missing message',
);
assertEqual(
  missingLocalPhotoMessage('side'),
  'Retake Side view — the local photo file is missing',
  'side missing message',
);

if (failed) {
  throw new Error('[verify-photo-upload-queue] FAIL');
}

console.log('[verify-photo-upload-queue] OK — reconcile, samePhotoUri, missingLocalPhotoMessage');
