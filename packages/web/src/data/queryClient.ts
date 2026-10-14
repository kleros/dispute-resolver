import { QueryClient } from "@tanstack/react-query";

/**
 * The app's QueryClient. Core reads report failures as values and retry their own transport, so queries do not retry
 * (`useFamily` opts into one retry). Nothing refetches on window focus or reconnect: today's app never did, and
 * every refetch is an RPC or IPFS round trip.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
    },
  });
}
