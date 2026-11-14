import { useCallback, useMemo, useState } from "react";

export interface BoundaryRetries {
  key(scope: string): string;
  retry(scope: string, reread: () => Promise<unknown>): void;
}

/**
 * A reset boundary would throw again on the cached read that broke it, so Retry remounts the boundary through its key once
 * the re-read resolved. It must be called where `useCase` is, so that render reads the cache as the re-read left it. The
 * read is invalidated, not reset: a reset would put every section built from it back to loading while it runs.
 */
export function useBoundaryRetries(): BoundaryRetries {
  const [attempts, setAttempts] = useState<ReadonlyMap<string, number>>(() => new Map());
  const retry = useCallback((scope: string, reread: () => Promise<unknown>) => {
    const remount = () => {
      setAttempts((current) => new Map(current).set(scope, (current.get(scope) ?? 0) + 1));
    };
    // A re-read that rejects still remounts: the boundary then renders whatever the cache holds.
    void reread().then(remount, remount);
  }, []);
  return useMemo(() => ({ key: (scope: string) => `${scope}:${String(attempts.get(scope) ?? 0)}`, retry }), [attempts, retry]);
}
