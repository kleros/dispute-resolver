import type { AbiEvent, GetLogsReturnType } from "viem";
import type { ReadClient } from "../types";
import { TooManyLogsError } from "./errors";
import { getWindowLogs, uniqueLogs, type BlockWindow, type Logs, type LogsRequest } from "./logWindows";
import { isRangeLimitError, isTooManyResultsError } from "./rangeLimit";

interface LogScanLimits {
  readonly windowSize: number;
  readonly minWindowSize: number;
  readonly windowShrinkFactor: number;
  readonly concurrency: number;
}

const LIMITS: LogScanLimits = { windowSize: 10_000, minWindowSize: 100, windowShrinkFactor: 5, concurrency: 8 };

/** The block counts a crowded window is read again in, each tried only when smaller than the refused span. */
const PIECE_SIZES: readonly number[] = [20, 4, 1];

interface ScanOptions {
  readonly maxLogs: number | undefined;
  readonly splitCrowdedWindows: boolean;
}

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

type Log<TEvent extends AbiEvent> = Logs<TEvent>[number];

/** A loop, not `push(...logs)`: spreading an answer of many thousand logs into arguments can overflow the stack. */
function append<TEvent extends AbiEvent>(target: Log<TEvent>[], logs: readonly Log<TEvent>[]): void {
  for (const log of logs) target.push(log);
}

function checkCap<TEvent extends AbiEvent>(logs: Logs<TEvent>, maxLogs: number | undefined): void {
  if (maxLogs !== undefined && uniqueLogs(logs).length > maxLogs) throw new TooManyLogsError(maxLogs);
}

/** At the smallest window or below only: a wider window is shrunk first, and is rethrown when its refusal is not a range limit. */
function isCrowded(reason: unknown, window: BlockWindow, limits: LogScanLimits, options: ScanOptions): boolean {
  const span = window.to - window.from + 1n;
  return options.splitCrowdedWindows && span > 1n && span <= BigInt(limits.minWindowSize) && isTooManyResultsError(reason);
}

/**
 * A window refused because its answer holds too many logs, read again in pieces of the largest `PIECE_SIZES` smaller
 * than it; a piece refused the same way is read in smaller pieces again. A single block still refused, or any other
 * error, is rethrown.
 */
async function readInPieces<TEvent extends AbiEvent>(fetchWindows: FetchWindows<TEvent>, window: BlockWindow, limits: LogScanLimits, options: ScanOptions): Promise<Log<TEvent>[]> {
  const span = window.to - window.from + 1n;
  const pieceSize = PIECE_SIZES.find((candidate) => BigInt(candidate) < span) ?? 1;
  const collected: Log<TEvent>[] = [];
  let cursor = window.from;
  while (cursor <= window.to) {
    const pieces = planWindows(cursor, window.to, pieceSize, limits.concurrency);
    const results = await fetchWindows(pieces);
    for (const [index, piece] of pieces.entries()) {
      const result = results[index];
      if (result?.status === "fulfilled") append(collected, result.value);
      else if (isCrowded(result?.reason, piece, limits, options)) append(collected, await readInPieces(fetchWindows, piece, limits, options));
      else throw result?.reason;
      cursor = piece.to + 1n;
    }
    checkCap(collected, options.maxLogs);
  }
  return collected;
}

type Recovery<TEvent extends AbiEvent> = { readonly retryWith: number } | { readonly logs: Log<TEvent>[] };

/**
 * A refused window is fetched again with a smaller window. At the smallest window, a refusal is rethrown, except that
 * with `splitCrowdedWindows` a window refused for too many logs is read in pieces. Any other error is rethrown.
 */
async function recover<TEvent extends AbiEvent>(
  fetchWindows: FetchWindows<TEvent>,
  refused: { readonly window: BlockWindow; readonly windowSize: number; readonly reason: unknown },
  limits: LogScanLimits,
  options: ScanOptions,
): Promise<Recovery<TEvent>> {
  const { window, windowSize, reason } = refused;
  const smaller = isRangeLimitError(reason) && window.from < window.to ? shrink(windowSize, limits) : undefined;
  if (smaller !== undefined) return { retryWith: smaller };
  if (!isCrowded(reason, window, limits, options)) throw reason;
  return { logs: await readInPieces(fetchWindows, window, limits, options) };
}

/**
 * The logs of the windows before the first refused one are kept; that window and the later ones are fetched again as
 * `recover` says. After a window read in pieces the scan goes back to `initialSize`: the crowding spans a few blocks, and
 * the rest of the range at the smallest window would take a request per hundred blocks.
 */
async function scanWindows<TEvent extends AbiEvent>(
  fetchWindows: FetchWindows<TEvent>,
  range: BlockWindow,
  initialSize: number,
  limits: LogScanLimits,
  options: ScanOptions,
): Promise<Log<TEvent>[]> {
  const collected: Log<TEvent>[] = [];
  let windowSize = initialSize;
  let cursor = range.from;
  while (cursor <= range.to) {
    const windows = planWindows(cursor, range.to, windowSize, limits.concurrency);
    const results = await fetchWindows(windows);
    let nextSize = windowSize;
    for (const [index, window] of windows.entries()) {
      const result = results[index];
      if (result?.status === "fulfilled") {
        append(collected, result.value);
      } else {
        const recovery = await recover(fetchWindows, { window, windowSize, reason: result?.reason }, limits, options);
        if ("retryWith" in recovery) {
          nextSize = recovery.retryWith;
          break;
        }
        append(collected, recovery.logs);
        nextSize = initialSize;
      }
      cursor = window.to + 1n;
    }
    windowSize = nextSize;
    checkCap(collected, options.maxLogs);
  }
  return collected;
}

async function scanRange<TEvent extends AbiEvent>(fetchWindows: FetchWindows<TEvent>, range: BlockWindow, limits: LogScanLimits, options: ScanOptions): Promise<Logs<TEvent>> {
  const [whole] = await fetchWindows([range]);
  if (whole?.status === "fulfilled") {
    checkCap(whole.value, options.maxLogs);
    return whole.value;
  }
  const refusal: unknown = whole?.reason;
  const initialSize = isRangeLimitError(refusal) ? firstWindowSize(range.to - range.from + 1n, limits) : undefined;
  if (initialSize !== undefined) return scanWindows(fetchWindows, range, initialSize, limits, options);
  if (isCrowded(refusal, range, limits, options)) return readInPieces(fetchWindows, range, limits, options);
  throw refusal;
}

/**
 * The whole range is tried in one request first; only a range or size refusal splits it into windows. Other errors are
 * rethrown, never split. A lookup with a request budget passes a client built with it (`createReadClient`). With
 * `maxLogs`, the scan throws a `TooManyLogsError` as soon as more logs than that have matched, before fetching further
 * windows; it bounds the work a contract emitting many logs can cause, not the size of one answer. With
 * `splitCrowdedWindows`, a window of the smallest size refused because its answer holds too many logs is read again in
 * smaller pieces, down to single blocks, instead of failing the scan; for a provider that caps the number of results
 * rather than the block range.
 */
export async function getLogsChunked<const TEvent extends AbiEvent>(
  client: ReadClient,
  request: LogsRequest<TEvent>,
  options: { readonly signal?: AbortSignal; readonly maxLogs?: number; readonly splitCrowdedWindows?: boolean } = {},
): Promise<GetLogsReturnType<TEvent>> {
  const { fromBlock, toBlock } = request;
  if (toBlock < fromBlock) return [];
  const fetchWindows: FetchWindows<TEvent> = (windows) => {
    options.signal?.throwIfAborted();
    return Promise.allSettled(windows.map((window) => getWindowLogs(client, request, window)));
  };

  const scanOptions: ScanOptions = { maxLogs: options.maxLogs, splitCrowdedWindows: options.splitCrowdedWindows ?? false };
  const logs = normalizeLogs(await scanRange(fetchWindows, { from: fromBlock, to: toBlock }, LIMITS, scanOptions));
  // The scan's logs are typed for explicit block numbers; the public type spells the same never-pending logs through
  // viem's defaults, which TypeScript cannot unify while `TEvent` is generic.
  return logs as GetLogsReturnType<TEvent>;
}
