/**
 * Wizard entry. Three behaviours:
 *  - `?resume=ls_…` or `?localId=ls_…` → resume an in-progress local draft at saved step
 *  - `?surveyId=<id>` → load a server survey into a local draft and edit
 *  - no params → create a fresh draft and route to Survey Start (step 0)
 */
import { AppButton, Spinner } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useConvexReadyQuery } from '@/hooks/use-convex-ready-query';
import { createNewDraft, getDraft, persistDraft, surveyToDraft } from '@/hooks/useWizardDraft';
import { FIRST_WIZARD_ROUTE, routeForDraftResume } from '@/hooks/wizardSteps';
import { toUserMessage } from '@/utils/errors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

export default function WizardEntry() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resume?: string; localId?: string; surveyId?: string }>();
  const surveyId = params.surveyId as Id<'surveys'> | undefined;
  const survey = useConvexReadyQuery(api.survey.get, surveyId ? { id: surveyId } : 'skip');
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (surveyId && survey === undefined) return;
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        let localId = params.resume ?? params.localId;

        if (surveyId) {
          if (!survey) {
            router.replace('/surveys');
            return;
          }
          if (survey.status !== 'draft') {
            router.replace({ pathname: '/(app)/survey/[id]', params: { id: surveyId } });
            return;
          }
          const draft = surveyToDraft(survey);
          await persistDraft(draft);
          localId = draft.localId;
        } else if (!localId) {
          const fresh = await createNewDraft();
          localId = fresh.localId;
        }

        const draft = await getDraft(localId!);
        const route = draft ? routeForDraftResume(draft) : FIRST_WIZARD_ROUTE;

        router.replace({
          pathname: route as never,
          params: { localId: localId! },
        });
      } catch (e) {
        setError(toUserMessage(e));
      }
    })();
  }, [params.resume, params.localId, surveyId, survey, router]);

  if (error) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark items-center justify-center px-6">
        <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark text-center mb-4">{error}</Text>
        <AppButton label="Back to surveys" variant="outline" onPress={() => router.replace('/surveys')} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <Spinner label={surveyId ? 'Loading survey…' : 'Preparing draft…'} />
    </View>
  );
}
