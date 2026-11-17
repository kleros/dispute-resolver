import type { AbiEvent, GetLogsParameters, GetLogsReturnType } from "viem";
import type { Address, ReadClient } from "../types";

/** The logs of one request over mined blocks (explicit block numbers, so never pending). */
export type Logs<TEvent extends AbiEvent> = GetLogsReturnType<TEvent, undefined, undefined, bigint, bigint>;

export interface BlockWindow {
  readonly from: bigint;
  readonly to: bigint;
}

export interface LogsRequest<TEvent extends AbiEvent> {
  readonly address: Address;
  readonly event: TEvent;
  readonly args?: GetLogsParameters<TEvent>["args"];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

/** Some providers return the same log (transaction hash and log index) twice. */
export function uniqueLogs<TEvent extends AbiEvent>(logs: Logs<TEvent>): Logs<TEvent> {
  const seen = new Set<string>();
  return logs.filter((log) => {
    if (log.removed) return false;
    const id = `${log.transactionHash.toLowerCase()}:${String(log.logIndex)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function getWindowLogs<TEvent extends AbiEvent>(client: ReadClient, request: LogsRequest<TEvent>, window: BlockWindow): Promise<Logs<TEvent>> {
  return client.getLogs<TEvent, undefined, undefined, bigint, bigint>({
    address: request.address,
    event: request.event,
    args: request.args,
    fromBlock: window.from,
    toBlock: window.to,
  } as GetLogsParameters<TEvent, undefined, undefined, bigint, bigint>);
}
