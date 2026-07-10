import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { canWithCapabilities, type Capability } from '@/lib/permissions';

/**
 * True when the signed-in user has the capability. Returns false while the
 * session is loading so callers can pass `"skip"` to useQuery and avoid
 * server-side FORBIDDEN errors for unauthorized roles.
 */
export function useHasCapability(capability: Capability): boolean {
  const { convexReady } = useClerkConvexAuth();
  const { role, capabilities, isLoading } = useCurrentUser();
  if (!convexReady || isLoading || !role) return false;
  return canWithCapabilities(capabilities, role, capability);
}
