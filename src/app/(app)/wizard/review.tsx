/**
 * Review & submit.
 *
 * Validates that every step is complete (re-running stepCompletion) and
 * then runs the submit pipeline:
 *
 *   1. `survey.saveDraft` + floor/photo sync → returns surveyId
 *   2. flush local photos to Convex storage + link
 *   3. `survey.submit({ id: surveyId })` → flips status to 'submitted',
 *      enforces business rules server-side
 *   4. clear the AsyncStorage draft
 *   5. navigate to the survey detail screen
 *
 * Failures at any step leave the local draft intact so the surveyor can
 * fix and retry without losing data.
 */
import { Spinner, Toast } from '@/components';
import {
  ReviewAddressSection,
  ReviewAreaSection,
  ReviewCompletionBanner,
  ReviewFloorsSection,
  ReviewGpsSection,
  ReviewOwnerSection,
  ReviewPhotosSection,
  ReviewPropertySection,
  ReviewServicesSection,
  ReviewStepChecklist,
  ReviewSubmitActions,
  ReviewSurveyStartSection,
  ReviewTaxationSection,
  ReviewWizardHeader,
} from '@/components/wizard';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useAutoDraftSync } from '@/hooks/useAutoDraftSync';
import { formatSaveDraftError, useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import {
  clearDraft,
  draftToSaveDraftPayload,
  draftToUpsertArgs,
  stepCompletion,
  useWizardDraft,
} from '@/hooks/useWizardDraft';
import type { useWizardPhotoCapture } from '@/hooks/useWizardPhotoCapture';
import { validateGpsCapture } from '@/lib/gpsValidation';
import { isTransientNetworkError } from '@/utils/convexMutationRetry';
import { convexValidationMessages, toUserMessage } from '@/utils/errors';
import { hasPendingPhotoUploads } from '@/utils/photoUploadQueue';
import { wizardScrollContentStyle, wizardScrollViewProps } from '@/utils/scroll-props';
import { hasPhotosPendingCloudSync } from '@/utils/surveyPhotos';
import { allMissingFields } from '@/utils/wizardValidation';
import { useMutation } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

export default function ReviewScreen() {
  const router = useRouter();
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const { draft, loading, update } = useWizardDraft(localId);
  const bundle = useMastersBundle();

  const { save: saveToServer, saving: savingDraft } = useSaveSurveyDraft();
  const submit = useMutation(api.surveys.mutations.submit);
  const { isOnline } = useNetworkStatus();
  const flushPhotosRef = useRef<ReturnType<typeof useWizardPhotoCapture>['flushPhotoQueue'] | null>(null);

  useAutoDraftSync(draft, update, saveToServer);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (loading || !draft) return;
    if (draft.lastActiveStepKey !== 'review') {
      void update({ lastActiveStepKey: 'review' });
    }
  }, [loading, draft, update]);

  const hideToast = useCallback(() => setToast(null), []);

  if (loading || !draft || !bundle) return <Spinner label="Loading…" />;

  const completion = stepCompletion(draft);
  const allComplete = Object.values(completion).every(Boolean);
  const missingFields = allMissingFields(draft);
  const submitReady = allComplete && missingFields.length === 0;
  const args = submitReady ? draftToUpsertArgs(draft) : null;

  const selectedUlb = bundle.ulbs.find((u) => u._id === draft.municipalityId);
  const muniName = selectedUlb?.name ?? '—';
  const districtName =
    bundle.districts.find((d) => d._id === draft.districtId)?.name ?? selectedUlb?.districtName ?? '—';

  const persistServerSurveyId = async (surveyId: Id<'surveys'>) => {
    if (draft.serverSurveyId !== surveyId) {
      await update({ serverSurveyId: surveyId });
    }
  };

  const onSaveDraft = async () => {
    if (!draftToSaveDraftPayload(draft)) {
      setToast({ title: 'Select district and ULB first', tone: 'danger' });
      return;
    }
    try {
      const result = await saveToServer(draft);
      if (!result.surveyId) {
        const err = result.sectionErrors.header ?? 'Could not save draft';
        setToast({ title: err, tone: 'danger' });
        return;
      }
      if (result.failedSections.length > 0) {
        const detail = formatSaveDraftError(result);
        setToast({
          title: detail ? `Partial save — ${detail}` : 'Partial save failed',
          tone: 'danger',
        });
        await persistServerSurveyId(result.surveyId);
        return;
      }
      await persistServerSurveyId(result.surveyId);
      setToast({ title: 'Draft saved — you can continue later', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    }
  };

  const onSubmit = async () => {
    if (!args || !submitReady) {
      const preview = missingFields.slice(0, 3).join(', ');
      setToast({
        title: preview ? `Missing: ${preview}` : 'Complete all required steps before submitting',
        tone: 'danger',
      });
      return;
    }

    setBusy(true);
    try {
      if (draft.gps) {
        const gpsErrors = validateGpsCapture(draft.gps, { strict: true });
        if (gpsErrors.length > 0) {
          setToast({ title: gpsErrors[0]!, tone: 'danger' });
          return;
        }
      }

      if (!isOnline && (hasPhotosPendingCloudSync(draft.photos) || (await hasPendingPhotoUploads(draft.localId)))) {
        setToast({
          title: 'Photos are still syncing to the cloud — go online and try again',
          tone: 'danger',
        });
        return;
      }

      const result = await saveToServer(draft);
      if (!result.surveyId) {
        setToast({ title: 'Complete all required steps before submitting', tone: 'danger' });
        return;
      }
      if (result.failedSections.length > 0) {
        const detail = formatSaveDraftError(result);
        setToast({
          title: detail ? `Save incomplete: ${detail}` : `Save incomplete: ${result.failedSections.join(', ')}`,
          tone: 'danger',
        });
        return;
      }

      const surveyId = result.surveyId;
      await persistServerSurveyId(surveyId);

      if (isOnline && flushPhotosRef.current) {
        const flushResult = await flushPhotosRef.current(surveyId, { waitForInFlight: true });
        if (flushResult.stillPending) {
          const detail = flushResult.error ?? 'Photos could not be synced to the cloud';
          setToast({
            title: isTransientNetworkError(detail)
              ? 'Photo upload failed — check your connection and try again'
              : detail,
            tone: 'danger',
          });
          return;
        }
      } else if (hasPhotosPendingCloudSync(draft.photos) || (await hasPendingPhotoUploads(draft.localId))) {
        setToast({
          title: 'Photos are still syncing to the cloud — go online and try again',
          tone: 'danger',
        });
        return;
      }

      await submit({ id: surveyId });
      await clearDraft(draft.localId);
      setToast({ title: 'Submitted for review', tone: 'success' });
      navTimerRef.current = setTimeout(() => {
        router.replace({ pathname: '/(app)/survey/[id]', params: { id: surveyId } });
      }, 700);
    } catch (e) {
      const serverMsgs = convexValidationMessages(e);
      setToast({
        title: serverMsgs.length > 0 ? serverMsgs.slice(0, 2).join(' · ') : toUserMessage(e),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <ReviewWizardHeader draft={draft} />

      <ScrollView contentContainerStyle={wizardScrollContentStyle(24)} {...wizardScrollViewProps}>
        <ReviewCompletionBanner allComplete={submitReady} draft={draft} />
        {!submitReady ? <ReviewStepChecklist draft={draft} /> : null}
        <ReviewSurveyStartSection
          draft={draft}
          districtName={districtName}
          muniName={muniName}
          muniCode={selectedUlb?.code ?? '—'}
        />
        <ReviewPropertySection draft={draft} ulbCode={selectedUlb?.code ?? ''} />
        <ReviewOwnerSection draft={draft} />
        <ReviewAddressSection draft={draft} />
        <ReviewTaxationSection draft={draft} bundle={bundle} />
        <ReviewAreaSection draft={draft} />
        <ReviewFloorsSection draft={draft} bundle={bundle} />
        <ReviewServicesSection draft={draft} bundle={bundle} />
        <ReviewGpsSection draft={draft} />

        <ReviewPhotosSection
          draft={draft}
          update={update}
          serverSurveyId={draft.serverSurveyId}
          onFlushReady={(flush) => {
            flushPhotosRef.current = flush;
          }}
          onEditStep={() =>
            router.replace({ pathname: '/(app)/wizard/photos' as never, params: { localId: draft.localId } })
          }
        />

        <ReviewSubmitActions
          canSaveDraft={!!draftToSaveDraftPayload(draft)}
          allComplete={submitReady}
          savingDraft={savingDraft}
          busy={busy}
          onSaveDraft={onSaveDraft}
          onSubmit={onSubmit}
        />
      </ScrollView>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={hideToast} /> : null}
    </View>
  );
}
