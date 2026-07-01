/**
 * Clerk OAuth sign-in buttons (Google + Apple).
 */
import { AppButton } from '@/components';
import { clerkErrorMessage } from '@/components/auth/field-error';
import { retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { getClerkOAuthRedirectUrl, isExpoGo } from '@/lib/clerk-oauth-redirect';
import { useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const EXPO_GO_OAUTH_MESSAGE =
  'Google sign-in requires a development or preview build. Run `npm run build:android` or install the preview APK.';

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

type OAuthButtonsProps = {
  isSignUp?: boolean;
};

export function OAuthButtons({ isSignUp: _isSignUp = false }: OAuthButtonsProps) {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onOAuth = async (strategy: 'oauth_google' | 'oauth_apple') => {
    setError(null);

    if (isExpoGo()) {
      setError(EXPO_GO_OAUTH_MESSAGE);
      return;
    }

    setLoading(strategy === 'oauth_google' ? 'google' : 'apple');
    try {
      const { createdSessionId, setActive, signUp } = await startSSOFlow({
        strategy,
        redirectUrl: getClerkOAuthRedirectUrl(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        retryConvexAuth({ resetPhase: true });
      } else if (signUp?.status === 'missing_requirements') {
        setError('Additional information is required to finish sign-up. Use email sign-up or contact support.');
      }
    } catch (e) {
      setError(clerkErrorMessage(e, 'Social sign-in failed'));
    } finally {
      setLoading(null);
    }
  };

  return (
    <View className="gap-2 mt-4">
      <Text className="text-helper text-ink-tertiary-light text-center">Or continue with</Text>
      <AppButton
        label="Continue with Google"
        variant="outline"
        iconLeft="logo-google"
        loading={loading === 'google'}
        disabled={loading !== null}
        onPress={() => void onOAuth('oauth_google')}
        fullWidth
      />
      {Platform.OS === 'ios' ? (
        <AppButton
          label="Continue with Apple"
          variant="outline"
          iconLeft="logo-apple"
          loading={loading === 'apple'}
          disabled={loading !== null}
          onPress={() => void onOAuth('oauth_apple')}
          fullWidth
        />
      ) : null}
      {error ? <Text className="text-helper text-danger text-center">{error}</Text> : null}
    </View>
  );
}
