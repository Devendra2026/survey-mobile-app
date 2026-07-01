/**
 * Redirects to the 8-step wizard. Supports `?id=<surveyId>` to resume editing
 * an existing draft on the server.
 */
import { Spinner } from '@/components';
import type { Id } from '@/convex/_generated/dataModel';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

export default function SurveyWizardRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; resume?: string }>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (params.id) {
      router.replace({
        pathname: '/(app)/wizard',
        params: { surveyId: params.id as Id<'surveys'> },
      });
      return;
    }
    router.replace({
      pathname: '/(app)/wizard',
      params: params.resume ? { resume: params.resume } : {},
    });
  }, [params.id, params.resume, router]);

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <Spinner label="Opening survey wizard…" />
    </View>
  );
}
