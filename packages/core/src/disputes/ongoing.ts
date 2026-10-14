import { getAbiItem } from "viem";
import { klerosLiquidAbi } from "../abi";
import { getChain, ongoingScanStart } from "../chains";
import { describeError, getLogsChunked } from "../rpc";
import type { Address, ReadClient } from "../types";
import { readDisputeStruct, toArbitratorDispute } from "./struct";
import type { ArbitratorDispute, Court, DisputeReadContext, OngoingDispute, OngoingList } from "./types";

const DISPUTE_CREATION_EVENT = getAbiItem({ abi: klerosLiquidAbi, name: "DisputeCreation" });
const NEW_PERIOD_EVENT = getAbiItem({ abi: klerosLiquidAbi, name: "NewPeriod" });
const EXECUTION_PERIOD = 4;

/**
 * The IDs of the disputes still open in `[fromBlock, head]` (spec 6.3): every distinct ID of a `DisputeCreation` minus
 * the IDs with a `NewPeriod` to the execution period, newest first (spec 3 step 3).
 */
async function openDisputeIds(client: ReadClient, arbitrator: Address, fromBlock: bigint, head: bigint, signal: AbortSignal | undefined): Promise<bigint[]> {
  const range = { address: arbitrator, fromBlock, toBlock: head };
  const [created, periods] = await Promise.all([
    getLogsChunked(client, { ...range, event: DISPUTE_CREATION_EVENT }, { signal }),
    getLogsChunked(client, { ...range, event: NEW_PERIOD_EVENT }, { signal }),
  ]);
  const executed = new Set(periods.filter((log) => log.args._period === EXECUTION_PERIOD).map((log) => log.args._disputeID));
  const open = new Set(created.map((log) => log.args._disputeID).filter((id): id is bigint => id !== undefined && !executed.has(id)));
  return [...open].sort((a, b) => (a < b ? 1 : -1));
}

/** The card of a dispute: its struct and the end of its current period when its court is known (spec 3). */
function toOngoing(dispute: ArbitratorDispute, courts: readonly Court[] | null): OngoingDispute {
  const court = courts?.find((candidate) => candidate.id === dispute.subcourtId);
  const duration = court === undefined || dispute.period === EXECUTION_PERIOD ? undefined : court.timesPerPeriod[dispute.period];
  return {
    id: dispute.id,
    arbitrated: dispute.arbitrated,
    period: dispute.period,
    subcourtId: dispute.subcourtId,
    lastPeriodChange: dispute.lastPeriodChange,
    countdownTarget: duration === undefined ? null : dispute.lastPeriodChange + Number(duration),
  };
}

/** The struct of one listed dispute, or `null` when it cannot be read or names no arbitrated contract. */
async function readOpenDispute(client: ReadClient, arbitrator: Address, id: bigint, signal: AbortSignal | undefined): Promise<ArbitratorDispute | null> {
  try {
    signal?.throwIfAborted();
    const dispute = toArbitratorDispute(id, await readDisputeStruct(client, arbitrator, id));
    return dispute.ok ? dispute.value : null;
  } catch {
    return null;
  }
}

/**
 * The Ongoing page's disputes (spec 3, D-37): the open IDs of the chain's look-back window (`ongoingScanStart` to head),
 * newest first, each with its `disputes(id)` struct. A dispute whose struct cannot be read is reported in `failedIds`
 * instead of being dropped silently. Titles are joined in `web` from the meta-evidence pipeline.
 */
export async function listOngoingDisputes(context: DisputeReadContext, courts: readonly Court[] | null): Promise<OngoingList> {
  const chain = getChain(context.chainId);
  const arbitrator = chain?.klerosLiquid;
  if (chain === undefined || arbitrator === undefined) return { status: "no-arbitrator" };
  const { client, signal } = context;
  if (client === undefined) return { status: "failed", error: { code: "no-rpc", message: "This network has no read RPC configured." } };
  let ids: bigint[];
  try {
    signal?.throwIfAborted();
    const head = await client.getBlockNumber();
    ids = await openDisputeIds(client, arbitrator, ongoingScanStart(chain, head), head, signal);
  } catch (error) {
    return { status: "failed", error: { code: "rpc-error", message: `Could not read the open disputes: ${describeError(error)}` } };
  }
  const structs = await Promise.all(ids.map((id) => readOpenDispute(client, arbitrator, id, signal)));
  const disputes: OngoingDispute[] = [];
  const failedIds: bigint[] = [];
  ids.forEach((id, index) => {
    const dispute = structs[index];
    if (dispute === null || dispute === undefined) failedIds.push(id);
    else disputes.push(toOngoing(dispute, courts));
  });
  return { status: "ok", disputes, failedIds };
}
