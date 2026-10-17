import type { AbiEvent, GetLogsParameters, GetLogsReturnType } from "viem";
import type { Address, ReadClient } from "../types";
import { isRangeLimitError } from "./rangeLimit";

/** Windowing parameters of the chunked log scans. */
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

/** The Reality lookup's windowing constants (spec 9.1): 10,000 blocks, 8 at a time, shrunk by 5 down to 100. */
const LIMITS: LogScanLimits = { windowSize: 10_000, minWindowSize: 100, windowShrinkFactor: 5, concurrency: 8 };

interface BlockWindow {
  readonly from: bigint;
  readonly to: bigint;
}

interface ScanRequest<TEvent extends AbiEvent> {
  readonly address: Address;
  readonly event: TEvent;
  readonly args?: GetLogsParameters<TEvent>["args"];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

interface ScanOptions {
  readonly signal?: AbortSignal;
}

/** The logs of one scan over mined blocks (explicit block numbers, so never pending). */
type Logs<TEvent extends AbiEvent> = GetLogsReturnType<TEvent, undefined, undefined, bigint, bigint>;

/** The next window size after a refusal, or `undefined` when the window cannot shrink any further. */
function shrink(windowSize: number, limits: LogScanLimits): number | undefined {
  if (windowSize <= limits.minWindowSize) return undefined;
  const next = Math.max(limits.minWindowSize, Math.floor(windowSize / limits.windowShrinkFactor));
  return next < windowSize ? next : undefined;
}

/**
 * The first window size once the whole range of `span` blocks was refused: the configured size, shrunk until it is
 * smaller than the refused range. `undefined` when no smaller window is allowed.
 */
function firstWindowSize(span: bigint, limits: LogScanLimits): number | undefined {
  let windowSize: number | undefined = limits.windowSize;
  while (windowSize !== undefined && BigInt(windowSize) >= span) windowSize = shrink(windowSize, limits);
  return windowSize;
}

/** Up to `count` consecutive windows of `windowSize` blocks from `from`, oldest first, clipped at `to`. */
function planWindows(from: bigint, to: bigint, windowSize: number, count: number): BlockWindow[] {
  const size = BigInt(windowSize);
  const windows: BlockWindow[] = [];
  for (let start = from; start <= to && windows.length < count; start += size) {
    windows.push({ from: start, to: start + size - 1n < to ? start + size - 1n : to });
  }
  return windows;
}

/**
 * Removed logs dropped, duplicates (same transaction hash and log index, which some providers return twice) dropped,
 * sorted by block and log index.
 */
function normalizeLogs<TEvent extends AbiEvent>(logs: Logs<TEvent>): Logs<TEvent> {
  const seen = new Set<string>();
  const unique = logs.filter((log) => {
    if (log.removed) return false;
    const id = `${log.transactionHash.toLowerCase()}:${String(log.logIndex)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return unique.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
}

type FetchWindows<TEvent extends AbiEvent> = (windows: readonly BlockWindow[]) => Promise<PromiseSettledResult<Logs<TEvent>>[]>;

/**
 * The windowed scan after the whole range was refused: forward from `fromBlock`, `concurrency` windows at a time. The
 * logs of the windows before the first refused one are kept; that window and the later ones are fetched again with a
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

/** The whole range in one request, or the windowed scan when the provider refuses it for its range limits. */
async function scanRange<TEvent extends AbiEvent>(fetchWindows: FetchWindows<TEvent>, range: BlockWindow, limits: LogScanLimits): Promise<Logs<TEvent>> {
  const [whole] = await fetchWindows([range]);
  if (whole?.status === "fulfilled") return whole.value;
  const refusal: unknown = whole?.reason;
  const initialSize = isRangeLimitError(refusal) ? firstWindowSize(range.to - range.from + 1n, limits) : undefined;
  if (initialSize === undefined) throw refusal;
  return scanWindows(fetchWindows, range, initialSize, limits);
}

/**
 * Every log of `request.event` emitted by `request.address` in `[fromBlock, toBlock]` (D-02, spec 6.3). The whole
 * range is tried in one request first. When the provider refuses it for its range or size limits, the range is scanned
 * forward in windows of `windowSize` blocks, `concurrency` at a time, oldest first; a refused window shrinks by
 * `windowShrinkFactor` down to `minWindowSize`, after which the refusal is rethrown. Other errors are rethrown, never
 * split. A lookup with a request budget passes a client built with it (`createReadClient`), which spends it before every
 * attempt, retries included. `signal` is checked before each round of requests.
 */
export async function getLogsChunked<const TEvent extends AbiEvent>(
  client: ReadClient,
  request: ScanRequest<TEvent>,
  options: ScanOptions = {},
): Promise<GetLogsReturnType<TEvent>> {
  const { fromBlock, toBlock } = request;
  if (toBlock < fromBlock) return [];
  const fetchWindows: FetchWindows<TEvent> = (windows) => {
    options.signal?.throwIfAborted();
    return Promise.allSettled(
      windows.map((window) =>
        client.getLogs<TEvent, undefined, undefined, bigint, bigint>({
          address: request.address,
          event: request.event,
          args: request.args,
          fromBlock: window.from,
          toBlock: window.to,
        } as GetLogsParameters<TEvent, undefined, undefined, bigint, bigint>),
      ),
    );
  };

  const logs = normalizeLogs(await scanRange(fetchWindows, { from: fromBlock, to: toBlock }, LIMITS));
  // The scan's logs are typed for explicit block numbers; the public type spells the same never-pending logs through
  // viem's defaults, which TypeScript cannot unify while `TEvent` is generic.
  return logs as GetLogsReturnType<TEvent>;
}
