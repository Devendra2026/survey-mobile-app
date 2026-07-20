import {
  classifyConvexTokenError,
  getLastGoodConvexToken,
  lastConvexTokenError,
  retryConvexAuth,
  setConvexSessionEstablished,
  setLastConvexTokenError,
  shouldRefreshConvexToken,
  subscribeAuthPhaseReset,
  subscribeAuthRefetch,
} from '@/hooks/use-auth-for-convex';
import { useAuth } from '@clerk/expo';
import { useConvexAuth } from 'convex/react';
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';

const MAX_AUTO_RETRIES = 5;
const AUTO_RETRY_BASE_MS = 8_000;
const MAX_STALL_MS = 45_000;
const STALL_TICK_MS = 1_000;

export type ConvexAuthPhase = 'idle' | 'connecting' | 'recovering' | 'failed';

type AuthState = {
  autoRetryCount: number;
  retrySeq: number;
  phase: ConvexAuthPhase;
};

type AuthAction =
  | { type: 'refetch' }
  | { type: 'phase_reset' }
  | { type: 'evaluate'; isSignedIn: boolean; isAuthenticated: boolean; convexAuthLoading: boolean; stalledMs: number }
  | { type: 'retry_tick' };

const initialAuthState: AuthState = {
  autoRetryCount: 0,
  retrySeq: 0,
  phase: 'idle',
};

function serverRejectedMessage(): string {
  return (
    'The server rejected your session token. Your administrator must verify Convex + Clerk ' +
    'integration (Clerk → Integrations → Convex, and CLERK_JWT_ISSUER_DOMAIN on the Convex deployment).'
  );
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'refetch':
      return { ...state, retrySeq: state.retrySeq + 1 };
    case 'phase_reset':
      return { ...state, autoRetryCount: 0, phase: 'connecting' };
    case 'retry_tick':
      return { ...state, autoRetryCount: state.autoRetryCount + 1 };
    case 'evaluate': {
      const { isSignedIn, isAuthenticated, convexAuthLoading, stalledMs } = action;
      if (!isSignedIn) {
        return { ...state, autoRetryCount: 0, phase: 'idle' };
      }
      if (isAuthenticated) {
        return { ...state, autoRetryCount: 0, phase: 'idle' };
      }

      // Wall-clock timeout applies even while Convex auth is still loading
      // (hung getToken / WebSocket handshake must not block forever).
      if (stalledMs >= MAX_STALL_MS) {
        return { ...state, phase: 'failed' };
      }

      if (convexAuthLoading) {
        return { ...state, phase: 'connecting' };
      }

      const failureKind = classifyConvexTokenError(lastConvexTokenError);
      if (failureKind === 'permanent') {
        return { ...state, phase: 'failed' };
      }

      if (state.autoRetryCount >= MAX_AUTO_RETRIES) {
        return { ...state, phase: 'failed' };
      }

      return { ...state, phase: 'recovering' };
    }
    default:
      return state;
  }
}

export type ClerkConvexAuthValue = {
  clerkLoaded: boolean;
  isSignedIn: boolean;
  convexAuthLoading: boolean;
  convexAuthPhase: ConvexAuthPhase;
  convexReady: boolean;
  convexAuthFailed: boolean;
  convexAuthRecovering: boolean;
};

const ClerkConvexAuthContext = createContext<ClerkConvexAuthValue | null>(null);

/** Single auth phase machine — mount once inside ConvexProvider. */
export function ClerkConvexAuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const stallStartedAt = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSignedInRef = useRef(isSignedIn);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const convexAuthLoadingRef = useRef(convexAuthLoading);
  isSignedInRef.current = isSignedIn;
  isAuthenticatedRef.current = isAuthenticated;
  convexAuthLoadingRef.current = convexAuthLoading;

  useEffect(() => subscribeAuthRefetch(() => dispatch({ type: 'refetch' })), []);

  useEffect(
    () =>
      subscribeAuthPhaseReset(() => {
        stallStartedAt.current = Date.now();
        dispatch({ type: 'phase_reset' });
      }),
    [],
  );

  useEffect(() => {
    setConvexSessionEstablished(Boolean(isAuthenticated));
  }, [isAuthenticated]);

  const convexReady = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && isAuthenticated;

  const evaluateAuth = () => {
    const signedIn = Boolean(isSignedInRef.current);
    const authenticated = Boolean(isAuthenticatedRef.current);
    const loading = convexAuthLoadingRef.current;

    if (!signedIn) {
      stallStartedAt.current = null;
    } else if (authenticated) {
      stallStartedAt.current = null;
    } else if (stallStartedAt.current === null) {
      // Start wall-clock stall as soon as signed-in but not yet Convex-authenticated
      // (includes while convexAuthLoading — do not pause the timer).
      stallStartedAt.current = Date.now();
    }

    const stalledMs =
      signedIn && !authenticated && stallStartedAt.current !== null ? Date.now() - stallStartedAt.current : 0;

    dispatch({
      type: 'evaluate',
      isSignedIn: signedIn,
      isAuthenticated: authenticated,
      convexAuthLoading: loading,
      stalledMs,
    });
  };

  useEffect(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    evaluateAuth();
  }, [isSignedIn, isAuthenticated, convexAuthLoading, state.retrySeq, state.autoRetryCount]);

  // Advance stalledMs even when Convex auth state is frozen (isLoading stuck true).
  useEffect(() => {
    if (!isSignedIn || isAuthenticated) return;

    const tick = setInterval(() => {
      evaluateAuth();
    }, STALL_TICK_MS);

    return () => clearInterval(tick);
  }, [isSignedIn, isAuthenticated]);

  useEffect(() => {
    if (state.phase !== 'failed') return;
    if (lastConvexTokenError) return;

    const stalledMs = stallStartedAt.current ? Date.now() - stallStartedAt.current : 0;
    const stalledWithToken = getLastGoodConvexToken() && stalledMs >= 20_000 ? serverRejectedMessage() : null;
    setLastConvexTokenError(stalledWithToken ?? 'Connection timed out. Check your network and try again.');
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'recovering') return;
    if (state.autoRetryCount >= MAX_AUTO_RETRIES) return;
    if (convexAuthLoading) return;

    const delayMs =
      state.autoRetryCount === 0 && !getLastGoodConvexToken()
        ? 400
        : AUTO_RETRY_BASE_MS * 2 ** Math.min(state.autoRetryCount, 2);
    retryTimer.current = setTimeout(() => {
      dispatch({ type: 'retry_tick' });
      retryConvexAuth();
    }, delayMs);

    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [state.phase, state.autoRetryCount, convexAuthLoading]);

  const value = useMemo<ClerkConvexAuthValue>(
    () => ({
      clerkLoaded,
      isSignedIn: Boolean(isSignedIn),
      convexAuthLoading,
      convexAuthPhase: state.phase,
      convexReady,
      convexAuthFailed: state.phase === 'failed',
      convexAuthRecovering: state.phase === 'recovering',
    }),
    [clerkLoaded, isSignedIn, convexAuthLoading, state.phase, convexReady],
  );

  return <ClerkConvexAuthContext.Provider value={value}>{children}</ClerkConvexAuthContext.Provider>;
}

export function useClerkConvexAuth(): ClerkConvexAuthValue {
  const ctx = useContext(ClerkConvexAuthContext);
  if (!ctx) {
    throw new Error('useClerkConvexAuth must be used within ClerkConvexAuthProvider');
  }
  return ctx;
}

/** Signed-out fallback when Convex is not mounted. */
export function useClerkConvexAuthOptional(): ClerkConvexAuthValue {
  const ctx = useContext(ClerkConvexAuthContext);
  if (ctx) return ctx;
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  return {
    clerkLoaded,
    isSignedIn: Boolean(isSignedIn),
    convexAuthLoading: false,
    convexAuthPhase: 'idle',
    convexReady: false,
    convexAuthFailed: false,
    convexAuthRecovering: false,
  };
}

/** Refresh Convex JWT when the app returns to foreground (only after a session was established). */
export function useAppStateSessionRefresh() {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!isSignedIn || !isAuthenticated) return;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && shouldRefreshConvexToken()) {
        retryConvexAuth();
      }
    });

    return () => {
      sub.remove();
    };
  }, [isSignedIn, isAuthenticated]);
}
