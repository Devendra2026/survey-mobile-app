import { api } from '@/convex/_generated/api';
import type { Role } from '@/lib/permissions';
import { useClerkConvexAuth } from '@/providers/clerk-convex-auth-provider';
import { toUserMessage } from '@/utils/errors';
import { useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const RETRY_MS = 1500;
const MAX_ATTEMPTS = 15;

function readSignupMetadata(user: NonNullable<ReturnType<typeof useUser>['user']>) {
  const meta = user.unsafeMetadata as Record<string, unknown> | undefined;
  return {
    requestedRole: typeof meta?.requestedRole === 'string' ? meta.requestedRole : 'surveyor',
    requestedReason: typeof meta?.requestedReason === 'string' ? meta.requestedReason : undefined,
  };
}

function profileFromClerk(user: NonNullable<ReturnType<typeof useUser>['user']>) {
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? undefined;
  const name =
    user.fullName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || email;

  return {
    email,
    name: name || undefined,
    avatarUrl: user.imageUrl,
    ...readSignupMetadata(user),
  };
}

export type CurrentUserQueryResult = NonNullable<FunctionReturnType<typeof api.users.currentUser>>;

type CurrentUserContextValue = {
  me: CurrentUserQueryResult | null | undefined;
  convexReady: boolean;
  needsSync: boolean;
  syncing: boolean;
  syncError: string | null;
  sync: () => Promise<boolean>;
  profileResolved: boolean;
  bootstrapped: boolean;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

/**
 * Single `users.currentUser` subscription + provisioning logic for the signed-in tree.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { convexReady } = useClerkConvexAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const me = useQuery(api.users.currentUser, convexReady ? {} : 'skip');
  const provision = useMutation(api.users.provisionCurrentUser);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const userRef = useRef(user);
  userRef.current = user;
  const meRef = useRef(me);
  meRef.current = me;

  const sync = useCallback(async () => {
    const currentUser = userRef.current;
    const currentMe = meRef.current;
    if (!convexReady || !currentUser || currentMe) return true;

    setSyncing(true);
    try {
      await provision(profileFromClerk(currentUser));
      setSyncError(null);
      return true;
    } catch (err) {
      setSyncError(toUserMessage(err));
      return false;
    } finally {
      setSyncing(false);
    }
  }, [convexReady, provision]);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  const clerkUserId = user?.id ?? null;
  const needsSync = convexReady && userLoaded && clerkUserId !== null && me === null;

  useEffect(() => {
    if (!needsSync) return;

    let cancelled = false;
    let attempt = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    setSyncError(null);

    const schedule = (delay: number) => {
      timeoutId = setTimeout(() => void tick(), delay);
    };

    const tick = async () => {
      if (cancelled) return;
      attempt += 1;
      const ok = await syncRef.current();
      if (cancelled || ok) return;
      if (attempt < MAX_ATTEMPTS) schedule(RETRY_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [needsSync]);

  const accountReady = me !== null || !needsSync;
  const profileResolved = me !== undefined;
  if (convexReady && profileResolved && accountReady && !(needsSync && syncing)) {
    bootstrappedRef.current = true;
  }

  const value = useMemo<CurrentUserContextValue>(
    () => ({
      me: me as CurrentUserQueryResult | null | undefined,
      convexReady,
      needsSync,
      syncing,
      syncError,
      sync,
      profileResolved,
      bootstrapped: bootstrappedRef.current,
    }),
    [me, convexReady, needsSync, syncing, syncError, sync, profileResolved],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUserContext(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error('useCurrentUserContext must be used within CurrentUserProvider');
  }
  return ctx;
}

/** Reactive domain user for the signed-in Clerk principal. */
export function useCurrentUser() {
  const { me, profileResolved } = useCurrentUserContext();
  const user = me ?? null;

  return {
    user,
    role: (user?.role ?? undefined) as Role | undefined,
    capabilities: user?.capabilities,
    roleName: user?.roleName,
    isLoading: !profileResolved,
    isActive: user?.status === 'active',
    isPending: user?.status === 'pending_approval',
    isDisabled: user?.status === 'disabled',
  };
}

/** Read-only sync state — provisioning runs only in CurrentUserProvider. */
export function useSyncConvexUser() {
  const { me, convexReady, needsSync, syncing, syncError, sync } = useCurrentUserContext();
  return {
    me,
    convexReady,
    needsSync,
    syncing,
    error: syncError,
    sync,
  };
}
