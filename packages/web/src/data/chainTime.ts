import type { ReadClient } from "@dispute-resolver/core";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CHAIN_CLOCK_CHECK_MS, CLOCK_STEP_TOLERANCE_MS, STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { IDLE_KEY, queryKeys } from "./queryKeys";

interface ChainTime {
  readonly blockTimestamp: number;
  /** The browser clock when the block arrived, so the offset measures the clock skew rather than the read's age. */
  readonly observedAtMs: number;
  /** The monotonic clock at the same moment, which a change of the browser clock does not move. */
  readonly observedAtMonotonicMs: number;
}

async function readChainTime(client: ReadClient): Promise<ChainTime> {
  const block = await client.getBlock({ blockTag: "latest" });
  // viem passes a response without a timestamp through as undefined despite its type; a NaN or zero clock would end every countdown.
  const blockTimestamp = Number(block.timestamp);
  if (blockTimestamp <= 0 || !Number.isSafeInteger(blockTimestamp * 1_000)) {
    throw new Error("The latest block carries no usable timestamp.");
  }
  return { blockTimestamp, observedAtMs: Date.now(), observedAtMonotonicMs: performance.now() };
}

/**
 * The offset holds only while the browser clock runs at the monotonic clock's pace. The sample is read again rather
 * than advanced by the monotonic clock, which some systems stop while asleep.
 */
function browserClockChangedSince(sample: ChainTime): boolean {
  const browserElapsedMs = Date.now() - sample.observedAtMs;
  const monotonicElapsedMs = performance.now() - sample.observedAtMonotonicMs;
  return Math.abs(browserElapsedMs - monotonicElapsedMs) > CLOCK_STEP_TOLERANCE_MS;
}

/**
 * How far the page chain's clock is from the browser's, in milliseconds: deadlines are chain timestamps, so a browser
 * clock that is off would end every countdown early or late. 0 (the browser clock) until a latest block with a usable
 * timestamp is read; a failed or malformed refresh keeps the last offset. Refreshed with the details, at the same stale
 * time. A change of the browser clock outdates the offset: it is dropped and read again at once, the browser clock
 * standing in until a read succeeds, that one or a later refresh.
 */
export function useChainClockOffset(chainId: number | null): number {
  const deps = useCoreDeps();
  const queryClient = useQueryClient();
  const client = chainId === null ? undefined : deps.getReadClient(chainId);
  const query = useQuery({
    queryKey: chainId === null ? IDLE_KEY : queryKeys.chainTime(chainId),
    queryFn: client === undefined ? skipToken : () => readChainTime(client),
    staleTime: STALE_TIME_MS.details,
  });
  const sample = client === undefined ? undefined : query.data;

  useEffect(() => {
    if (chainId === null || sample === undefined) return undefined;
    const interval = setInterval(() => {
      if (browserClockChangedSince(sample)) void queryClient.resetQueries({ queryKey: queryKeys.chainTime(chainId), exact: true });
    }, CHAIN_CLOCK_CHECK_MS);
    return () => {
      clearInterval(interval);
    };
  }, [chainId, sample, queryClient]);

  if (sample === undefined) return 0;
  return sample.blockTimestamp * 1_000 - sample.observedAtMs;
}
