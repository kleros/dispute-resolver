import { useCallback, useMemo, useState } from "react";
import { useMounted } from "../../ui";

export interface BoundaryRetries {
  key(scope: string): string;
  /** Settles, never rejecting, once the re-read has settled and the remount is queued. */
  retry(scope: string, reread: () => Promise<unknown>): Promise<void>;
}

/**
 * A reset boundary would throw again on the cached read that broke it, so Retry remounts the boundary through its key once
 * the re-read resolved. It must be called where `useCase` is, so that render reads the cache as the re-read left it. The
 * read is invalidated, not reset: a reset would put every section built from it back to loading while it runs.
 */
export function useBoundaryRetries(): BoundaryRetries {
  const [attempts, setAttempts] = useState<ReadonlyMap<string, number>>(() => new Map());
  const mounted = useMounted();
  const retry = useCallback(
    (scope: string, reread: () => Promise<unknown>) => {
      const remount = () => {
        if (mounted.current) setAttempts((current) => new Map(current).set(scope, (current.get(scope) ?? 0) + 1));
      };
      // A re-read that rejects still remounts: the boundary then renders whatever the cache holds.
      return reread().then(remount, remount);
    },
    [mounted],
  );
  return useMemo(() => ({ key: (scope: string) => `${scope}:${String(attempts.get(scope) ?? 0)}`, retry }), [attempts, retry]);
}
