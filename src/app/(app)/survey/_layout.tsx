import { Stack } from 'expo-router';

/** Survey detail + legacy wizard redirect. */
export default function SurveyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="wizard" options={{ animation: 'fade' }} />
    </Stack>
  );
}
