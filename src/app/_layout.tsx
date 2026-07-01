import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AppLoadingView } from '@/components/app-loading-view';
import { ClerkStartupError } from '@/components/clerk-startup-error';
import { ConfigGate } from '@/components/config-gate';
import { ConvexAuthError } from '@/components/convex-auth-error';
import { RootErrorBoundary } from '@/components/root-error-boundary';
import { env, envReady } from '@/config/env';
import { bootScreenStyle } from '@/constants/brand';
import { useAuthForConvex } from '@/hooks/use-auth-for-convex';
import { useHideAppSplash } from '@/hooks/use-hide-app-splash';
import { useSafeRouter } from '@/hooks/use-safe-router';
import { initMobileMonitoring } from '@/lib/perf-monitor';
import {
  ClerkConvexAuthProvider,
  useAppStateSessionRefresh,
  useClerkConvexAuth,
  type ConvexAuthPhase,
} from '@/providers/clerk-convex-auth-provider';
import { CurrentUserProvider, useCurrentUserContext } from '@/providers/current-user-provider';
import { ThemeProvider } from '@/theme';
import { clearClerkClientJwtCache, tokenCache } from '@/utils/tokenCache';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { resourceCache } from '@clerk/expo/resource-cache';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../global.css';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
initMobileMonitoring();

const CLERK_LOAD_TIMEOUT_MS = 45_000;

function signedInLoadingMessage(
  convexAuthPhase: ConvexAuthPhase,
  convexReady: boolean,
  me: unknown,
  needsSync: boolean,
  syncing: boolean,
): string {
  if (convexAuthPhase === 'recovering') {
    return 'Connecting to server…';
  }
  if (convexAuthPhase === 'connecting' || !convexReady) return 'Securing your session…';
  if (me === undefined) return 'Loading your profile…';
  if (needsSync && syncing) return 'Setting up your account…';
  return 'Please wait…';
}

/** Signed-out routing — no Convex WebSocket until user signs in. */
function SignedOutAuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const { replace, segments, navigationReady } = useSafeRouter();
  const lastNavTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !navigationReady || isSignedIn) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!inAuthGroup) {
      const target = '/(auth)/sign-in';
      if (target !== lastNavTargetRef.current) {
        lastNavTargetRef.current = target;
        replace(target);
      }
    } else {
      lastNavTargetRef.current = null;
    }
  }, [isLoaded, navigationReady, isSignedIn, segments, replace]);

  return <Slot />;
}

function SignedInAuthGate() {
  const { convexReady, convexAuthFailed, convexAuthPhase } = useClerkConvexAuth();
  useAppStateSessionRefresh();
  const { me, needsSync, syncing, syncError, profileResolved } = useCurrentUserContext();
  const { replace, segments, navigationReady } = useSafeRouter();
  const lastNavTargetRef = useRef<string | null>(null);
  const bootstrappedRef = useRef(false);

  const sessionPending = convexAuthPhase === 'connecting' || convexAuthPhase === 'recovering';
  const profilePending = convexReady && !profileResolved;
  const setupPending = convexReady && needsSync && syncing;
  const accountReady = me !== null || !needsSync;

  if (convexReady && profileResolved && accountReady && !setupPending) {
    bootstrappedRef.current = true;
  }

  const showBlockingOverlay =
    !bootstrappedRef.current && (sessionPending || !convexReady || profilePending || setupPending);

  useEffect(() => {
    if (!navigationReady) return;
    if (!convexReady || !profileResolved || me === undefined) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAdminGroup = segments[0] === '(admin)';
    const inAppGroup = segments[0] === '(app)';

    let target: string | null = null;

    if (me === null) {
      if (segments[0] !== '(auth)' || segments[1] !== 'setup') {
        target = '/(auth)/setup';
      }
    } else if (me.status !== 'active' || me.role === 'pending') {
      if (segments[0] !== '(auth)' || segments[1] !== 'awaiting-approval') {
        target = '/(auth)/awaiting-approval';
      }
    } else if (me.role === 'admin') {
      if (!inAdminGroup && !inAppGroup) target = '/(admin)/approvals';
    } else if (me.role === 'qc_supervisor' || me.role === 'surveyor' || me.role === 'supervisor') {
      if (!inAppGroup) target = '/dashboard';
    }

    if (target && target !== lastNavTargetRef.current) {
      lastNavTargetRef.current = target;
      replace(target);
    } else if (!target) {
      lastNavTargetRef.current = null;
    }
  }, [navigationReady, convexReady, profileResolved, me, segments, replace]);

  const loadingMessage = useMemo(() => {
    if (syncError && segments[0] === '(auth)' && segments[1] === 'setup') {
      return syncError;
    }
    return signedInLoadingMessage(convexAuthPhase, convexReady, me, needsSync, syncing);
  }, [convexAuthPhase, convexReady, me, needsSync, syncing, syncError, segments]);

  if (convexAuthFailed) {
    return <ConvexAuthError />;
  }

  return (
    <View className="flex-1">
      <Slot />
      {showBlockingOverlay ? (
        <View className="absolute inset-0 z-10" pointerEvents="auto">
          <AppLoadingView message={loadingMessage} />
        </View>
      ) : null}
    </View>
  );
}

function ConvexSignedInTree({ client }: { client: ConvexReactClient }) {
  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuthForConvex}>
      <ClerkConvexAuthProvider>
        <CurrentUserProvider>
          <SignedInAuthGate />
        </CurrentUserProvider>
      </ClerkConvexAuthProvider>
    </ConvexProviderWithAuth>
  );
}

/**
 * Convex mounts only after Clerk has loaded so startup work does not block clerk-js FAPI.
 * Signed-out users get Theme + routes without opening a WebSocket.
 * @see https://github.com/clerk/javascript/issues/8245
 */
function ClerkAppShell({ onClerkRetry }: { onClerkRetry: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const convexClient = useMemo(() => {
    if (!isLoaded || !envReady || !isSignedIn) return null;
    return new ConvexReactClient(env.convexUrl, { unsavedChangesWarning: false });
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (isLoaded) {
      setLoadTimedOut(false);
      setRetrying(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimedOut(true), CLERK_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useHideAppSplash(isLoaded || loadTimedOut);

  const handleRetry = () => {
    setRetrying(true);
    setLoadTimedOut(false);
    void clearClerkClientJwtCache().finally(() => onClerkRetry());
  };

  if (!isLoaded) {
    if (loadTimedOut) {
      return <ClerkStartupError onRetry={handleRetry} retrying={retrying} />;
    }
    return <AppLoadingView message="Loading sign-in…" />;
  }

  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      {isSignedIn && convexClient ? <ConvexSignedInTree client={convexClient} /> : <SignedOutAuthGate />}
    </ThemeProvider>
  );
}

function AppProviders() {
  const [clerkRetryKey, setClerkRetryKey] = useState(0);

  const handleClerkRetry = useCallback(() => {
    setClerkRetryKey((k) => k + 1);
  }, []);

  if (!envReady) {
    return <View style={bootScreenStyle} />;
  }

  return (
    <ClerkProvider
      key={clerkRetryKey}
      publishableKey={env.clerkPublishableKey}
      tokenCache={tokenCache}
      __experimental_resourceCache={resourceCache}
    >
      <ClerkAppShell onClerkRetry={handleClerkRetry} />
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ConfigGate>
            <AppProviders />
          </ConfigGate>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
