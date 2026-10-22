import type { AbiEvent, GetLogsParameters, GetLogsReturnType } from "viem";
import { isRangeLimitError } from "../rpc";
import type { RequestBudget } from "../rpc/types";
import type { Address, ReadClient } from "../types";
import { LOOKUP_LIMITS } from "./constants";

/** The logs of one request over mined blocks (explicit block numbers, so never pending). */
type Logs<TEvent extends AbiEvent> = GetLogsReturnType<TEvent, undefined, undefined, bigint, bigint>;

export interface LogsRequest<TEvent extends AbiEvent> {
  readonly address: Address;
  readonly event: TEvent;
  readonly args?: GetLogsParameters<TEvent>["args"];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

/**
 * The window size a provider has accepted so far, remembered for the next searches of one lookup so that they go straight
 * to windows of that size instead of asking for a whole range the provider already refused.
 */
export interface WindowMemory {
  size: number | undefined;
}

interface BlockWindow {
  readonly from: bigint;
  readonly to: bigint;
}

/** Some providers return the same log twice. */
function uniqueLogs<TEvent extends AbiEvent>(logs: Logs<TEvent>): Logs<TEvent> {
  const seen = new Set<string>();
  return logs.filter((log) => {
    if (log.removed) return false;
    const id = `${log.transactionHash.toLowerCase()}:${String(log.logIndex)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function fetchWindow<TEvent extends AbiEvent>(client: ReadClient, budget: RequestBudget, request: LogsRequest<TEvent>, window: BlockWindow): Promise<Logs<TEvent>> {
  budget.spend();
  const logs = await client.getLogs<TEvent, undefined, undefined, bigint, bigint>({
    address: request.address,
    event: request.event,
    args: request.args,
    fromBlock: window.from,
    toBlock: window.to,
  } as GetLogsParameters<TEvent, undefined, undefined, bigint, bigint>);
  return uniqueLogs<TEvent>(logs);
}

function planWindows(low: bigint, high: bigint, windowSize: number): BlockWindow[] {
  const size = BigInt(windowSize);
  const windows: BlockWindow[] = [];
  for (let end = high; end >= low && windows.length < LOOKUP_LIMITS.concurrency; end -= size) {
    windows.push({ from: end - size + 1n < low ? low : end - size + 1n, to: end });
  }
  return windows;
}

function shrunkWindowSize(windowSize: number): number {
  return Math.max(LOOKUP_LIMITS.minWindowSize, Math.floor(windowSize / LOOKUP_LIMITS.windowShrinkFactor));
}

type RoundOutcome<TEvent extends AbiEvent> =
  | { readonly kind: "found"; readonly logs: Logs<TEvent> }
  | { readonly kind: "refused"; readonly window: BlockWindow; readonly reason: unknown }
  | { readonly kind: "empty"; readonly nextHigh: bigint };

/** The newest window with logs or with a range refusal decides, even if an older one succeeded. */
function readRound<TEvent extends AbiEvent>(windows: readonly BlockWindow[], results: readonly PromiseSettledResult<Logs<TEvent>>[]): RoundOutcome<TEvent> {
  let nextHigh = windows[0]?.to ?? 0n;
  for (const [index, window] of windows.entries()) {
    const result = results[index];
    if (result?.status !== "fulfilled") {
      const reason: unknown = result?.reason;
      if (!isRangeLimitError(reason)) throw reason;
      return { kind: "refused", window, reason };
    }
    if (result.value.length > 0) return { kind: "found", logs: result.value };
    nextHigh = window.from - 1n;
  }
  return { kind: "empty", nextHigh };
}

async function scanBackwards<TEvent extends AbiEvent>(
  fetchLogs: (window: BlockWindow) => Promise<Logs<TEvent>>,
  range: BlockWindow,
  memory: WindowMemory,
  initialSize: number,
): Promise<Logs<TEvent>> {
  let windowSize = initialSize;
  memory.size = windowSize;
  let high = range.to;
  while (high >= range.from) {
    const windows = planWindows(range.from, high, windowSize);
    const outcome = readRound(windows, await Promise.allSettled(windows.map(fetchLogs)));
    if (outcome.kind === "found") return outcome.logs;
    if (outcome.kind === "empty") {
      high = outcome.nextHigh;
      continue;
    }
    if (windowSize <= LOOKUP_LIMITS.minWindowSize || outcome.window.from === outcome.window.to) throw outcome.reason;
    windowSize = shrunkWindowSize(windowSize);
    memory.size = windowSize;
    high = outcome.window.to;
  }
  return [];
}

/** A lookup passes one memory per read client, so its later searches skip the whole-range request already refused. */
export async function findLatestLogsRemembering<TEvent extends AbiEvent>(
  client: ReadClient,
  request: LogsRequest<TEvent>,
  budget: RequestBudget,
  memory: WindowMemory,
): Promise<GetLogsReturnType<TEvent>> {
  const { fromBlock, toBlock } = request;
  if (toBlock < fromBlock) return [];
  const fetchLogs = (window: BlockWindow) => fetchWindow(client, budget, request, window);

  const windowSize = memory.size ?? LOOKUP_LIMITS.windowSize;
  if (memory.size === undefined || toBlock - fromBlock + 1n <= BigInt(windowSize)) {
    try {
      return (await fetchLogs({ from: fromBlock, to: toBlock })) as GetLogsReturnType<TEvent>;
    } catch (error) {
      if (!isRangeLimitError(error) || toBlock === fromBlock) throw error;
    }
  }
  // The scan's logs are typed for explicit block numbers; the public type spells the same never-pending logs through
  // viem's defaults, which TypeScript cannot unify while `TEvent` is generic.
  return (await scanBackwards(fetchLogs, { from: fromBlock, to: toBlock }, memory, windowSize)) as GetLogsReturnType<TEvent>;
}

/**
 * The newest logs of `request.event` in `[fromBlock, toBlock]`. The whole range is tried first; only a range or size
 * refusal falls back to a backwards scan in shrinking windows, and the scan stops at the newest window with logs. Other
 * errors are thrown, never split.
 */
export function findLatestLogs<const TEvent extends AbiEvent>(
  client: ReadClient,
  request: { readonly address: Address; readonly event: TEvent; readonly args?: GetLogsParameters<TEvent>["args"]; readonly fromBlock: bigint; readonly toBlock: bigint },
  budget: RequestBudget,
): Promise<GetLogsReturnType<TEvent>> {
  return findLatestLogsRemembering(client, request, budget, { size: undefined });
}
