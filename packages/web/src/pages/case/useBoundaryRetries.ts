import { useCallback, useMemo, useState } from "react";

export interface BoundaryRetries {
  key(scope: string): string;
  retry(scope: string, reread: () => Promise<unknown>): void;
}

/**
 * A boundary that caught a render error resets on Retry, but its section's props still hold the cached read that broke
 * it, so it throws again at once and stays failed when the new read lands. Retry therefore remounts the boundary through
 * its key once the re-read has resolved. The hook must be called where `useCase` is, so the render that remounts the
 * boundary reads the cache as the re-read left it. The read is invalidated, not reset: a reset would put every section
 * built from it back to loading while it runs (the view needs every read settled). The Ongoing cards reset instead,
 * because only the card reads its title.
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
