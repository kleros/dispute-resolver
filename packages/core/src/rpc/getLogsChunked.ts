import type { AbiEvent, GetLogsReturnType } from "viem";
import type { ReadClient } from "../types";
import { getWindowLogs, uniqueLogs, type BlockWindow, type Logs, type LogsRequest } from "./logWindows";
import { isRangeLimitError } from "./rangeLimit";

interface LogScanLimits {
  /** First window size when the whole range is refused. */
  readonly windowSize: number;
  /** Smallest window before giving up. */
  readonly minWindowSize: number;
  /** Divisor applied to the window after a refusal. */
  readonly windowShrinkFactor: number;
  /** Windows fetched in parallel. */
  readonly concurrency: number;
}

const LIMITS: LogScanLimits = { windowSize: 10_000, minWindowSize: 100, windowShrinkFactor: 5, concurrency: 8 };

function shrink(windowSize: number, limits: LogScanLimits): number | undefined {
  if (windowSize <= limits.minWindowSize) return undefined;
  const next = Math.max(limits.minWindowSize, Math.floor(windowSize / limits.windowShrinkFactor));
  return next < windowSize ? next : undefined;
}

/** Shrunk until it is smaller than the refused range, so the first windows never repeat the refused request. */
function firstWindowSize(span: bigint, limits: LogScanLimits): number | undefined {
  let windowSize: number | undefined = limits.windowSize;
  while (windowSize !== undefined && BigInt(windowSize) >= span) windowSize = shrink(windowSize, limits);
  return windowSize;
}

function planWindows(from: bigint, to: bigint, windowSize: number, count: number): BlockWindow[] {
  const size = BigInt(windowSize);
  const windows: BlockWindow[] = [];
  for (let start = from; start <= to && windows.length < count; start += size) {
    windows.push({ from: start, to: start + size - 1n < to ? start + size - 1n : to });
  }
  return windows;
}

function normalizeLogs<TEvent extends AbiEvent>(logs: Logs<TEvent>): Logs<TEvent> {
  return uniqueLogs(logs).sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
}

type FetchWindows<TEvent extends AbiEvent> = (windows: readonly BlockWindow[]) => Promise<PromiseSettledResult<Logs<TEvent>>[]>;

/**
 * The logs of the windows before the first refused one are kept; that window and the later ones are fetched again with a
 * smaller window. A refusal at the smallest window, or any other error, is rethrown.
 */
async function scanWindows<TEvent extends AbiEvent>(
  fetchWindows: FetchWindows<TEvent>,
  range: BlockWindow,
  initialSize: number,
  limits: LogScanLimits,
): Promise<Logs<TEvent>[number][]> {
  const collected: Logs<TEvent>[number][] = [];
  let windowSize = initialSize;
  let cursor = range.from;
  while (cursor <= range.to) {
    const windows = planWindows(cursor, range.to, windowSize, limits.concurrency);
    const results = await fetchWindows(windows);
    for (const [index, window] of windows.entries()) {
      const result = results[index];
      if (result?.status !== "fulfilled") {
        const reason: unknown = result?.reason;
        const next = isRangeLimitError(reason) && window.from < window.to ? shrink(windowSize, limits) : undefined;
        if (next === undefined) throw reason;
        windowSize = next;
        break;
      }
      collected.push(...result.value);
      cursor = window.to + 1n;
    }
  }
  return collected;
}

async function scanRange<TEvent extends AbiEvent>(fetchWindows: FetchWindows<TEvent>, range: BlockWindow, limits: LogScanLimits): Promise<Logs<TEvent>> {
  const [whole] = await fetchWindows([range]);
  if (whole?.status === "fulfilled") return whole.value;
  const refusal: unknown = whole?.reason;
  const initialSize = isRangeLimitError(refusal) ? firstWindowSize(range.to - range.from + 1n, limits) : undefined;
  if (initialSize === undefined) throw refusal;
  return scanWindows(fetchWindows, range, initialSize, limits);
}

/**
 * The whole range is tried in one request first; only a range or size refusal splits it into windows. Other errors are
 * rethrown, never split. A lookup with a request budget passes a client built with it (`createReadClient`).
 */
export async function getLogsChunked<const TEvent extends AbiEvent>(
  client: ReadClient,
  request: LogsRequest<TEvent>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<GetLogsReturnType<TEvent>> {
  const { fromBlock, toBlock } = request;
  if (toBlock < fromBlock) return [];
  const fetchWindows: FetchWindows<TEvent> = (windows) => {
    options.signal?.throwIfAborted();
    return Promise.allSettled(windows.map((window) => getWindowLogs(client, request, window)));
  };

  const logs = normalizeLogs(await scanRange(fetchWindows, { from: fromBlock, to: toBlock }, LIMITS));
  // The scan's logs are typed for explicit block numbers; the public type spells the same never-pending logs through
  // viem's defaults, which TypeScript cannot unify while `TEvent` is generic.
  return logs as GetLogsReturnType<TEvent>;
}
