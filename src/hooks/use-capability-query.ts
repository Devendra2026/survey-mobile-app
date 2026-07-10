import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useHasCapability } from '@/hooks/use-has-capability';
import type { Capability } from '@/lib/permissions';
import { useQuery, type OptionalRestArgsOrSkip } from 'convex/react';
import type { FunctionReference } from 'convex/server';

/** Subscribes to a Convex query only when Clerk JWT is accepted and the user has the capability. */
export function useCapabilityQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  capability: Capability,
  ...args: OptionalRestArgsOrSkip<Query>
): Query['_returnType'] | undefined {
  const { convexReady } = useClerkConvexAuth();
  const allowed = useHasCapability(capability);
  const skip = args[0] === 'skip' || !convexReady || !allowed;
  return useQuery(query, ...(skip ? (['skip'] as OptionalRestArgsOrSkip<Query>) : args));
}
