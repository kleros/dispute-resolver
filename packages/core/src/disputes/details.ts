import { getAbiItem } from "viem";
import { klerosLiquidAbi } from "../abi";
import { getChain } from "../chains";
import type { FamilyDetection } from "../families/types";
import { describeError, getLogsChunked } from "../rpc";
import type { Outcome, ReadClient } from "../types";
import { resolveLocalId } from "./localId";
import { fail, readOutcome, succeed } from "./outcome";
import type { AppealDecisionEvent, AppealInfo, ArbitratedBinding, ArbitratorDispute, DisputeReadContext, DisputeReads, LocalIdResolution } from "./types";

const APPEAL_DECISION_EVENT = getAbiItem({ abi: klerosLiquidAbi, name: "AppealDecision" });
const NO_RPC = "This network has no read RPC configured.";

/** The block timestamp of each distinct block, one `getBlock` per block. */
async function blockTimestamps(client: ReadClient, blocks: readonly bigint[], signal: AbortSignal | undefined): Promise<ReadonlyMap<bigint, number>> {
  signal?.throwIfAborted();
  const entries = await Promise.all(
    [...new Set(blocks)].map(async (blockNumber): Promise<[bigint, number]> => [blockNumber, Number((await client.getBlock({ blockNumber })).timestamp)]),
  );
  return new Map(entries);
}

/**
 * The `AppealDecision(id)` events of a dispute on its arbitrator, oldest first, scanned `[fromBlock, head]` and chunked
 * where the RPC caps ranges (spec 6.3). `fromBlock` is the Dispute event's block, else the arbitrator's deployment
 * block. Never rejects: a failed scan or block read is a failed `Outcome` (D-36).
 */
export async function readAppealDecisions(context: DisputeReadContext, binding: ArbitratedBinding, fromBlock: bigint): Promise<Outcome<readonly AppealDecisionEvent[]>> {
  const { client, signal } = context;
  if (client === undefined) return fail("no-rpc", NO_RPC);
  try {
    signal?.throwIfAborted();
    const head = await client.getBlockNumber();
    const logs = await getLogsChunked(
      client,
      { address: binding.arbitrator, event: APPEAL_DECISION_EVENT, args: { _disputeID: binding.disputeId }, fromBlock, toBlock: head },
      { signal },
    );
    const timestamps = await blockTimestamps(
      client,
      logs.map((log) => log.blockNumber),
      signal,
    );
    const decisions: AppealDecisionEvent[] = [];
    for (const log of logs) {
      const appealedAt = timestamps.get(log.blockNumber);
      if (appealedAt === undefined) return fail("not-found", `Block ${log.blockNumber.toString()} of an appeal decision was not read.`);
      decisions.push({ blockNumber: log.blockNumber, appealedAt });
    }
    return succeed(decisions);
  } catch (error) {
    return fail("rpc-error", `Could not read the appeal decisions: ${describeError(error)}`);
  }
}

/** `appealCost(id, 0x)` and `appealPeriod(id)` together (spec 5.3 step 7). */
function readAppealInfo(client: ReadClient, binding: ArbitratedBinding, signal: AbortSignal | undefined): Promise<Outcome<AppealInfo>> {
  const { arbitrator, disputeId } = binding;
  return readOutcome(
    "the appeal cost and period",
    async () => {
      const [appealCost, [start, end]] = await Promise.all([
        client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "appealCost", args: [disputeId, "0x"] }),
        client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "appealPeriod", args: [disputeId] }),
      ]);
      return { appealCost, appealPeriodStart: Number(start), appealPeriodEnd: Number(end) };
    },
    signal,
  );
}

function hasAppealInfo(dispute: ArbitratorDispute): boolean {
  return dispute.period === 3 || dispute.period === 4;
}

/** Every read failing for want of a client (D-56). */
function readsWithoutClient(found: { readonly dispute: ArbitratorDispute; readonly binding: ArbitratedBinding }): DisputeReads {
  const noRpc = fail<never>("no-rpc", NO_RPC);
  return {
    ...found,
    votesLengths: noRpc,
    currentRuling: noRpc,
    appealDecisions: noRpc,
    appealInfo: hasAppealInfo(found.dispute) ? noRpc : null,
    localId: { kind: "unresolved", reason: "rpc-error" },
  };
}

/**
 * The per-dispute reads of the case page (spec 5.3 step 3 without the dead `ruling` and second `getDispute` reads, Q11,
 * D-11), in parallel: `getDispute(id)` for the vote counts, `currentRuling(id)`, the appeal decisions, the local ID
 * when the family is known, and the appeal cost and period in periods 3 and 4. Each read degrades on its own (D-36).
 */
export async function readDisputeDetails(
  context: DisputeReadContext,
  found: { readonly dispute: ArbitratorDispute; readonly binding: ArbitratedBinding },
  family: FamilyDetection | undefined,
  disputeEventBlock: bigint | null,
): Promise<DisputeReads> {
  const { client, signal } = context;
  if (client === undefined) return readsWithoutClient(found);
  const { binding } = found;
  const { arbitrator, disputeId } = binding;
  const fromBlock = disputeEventBlock ?? BigInt(getChain(binding.chainId)?.arbitratorDeployedAtBlock ?? 0);
  const unresolved: LocalIdResolution = { kind: "unresolved", reason: "rpc-error" };
  const [votesLengths, currentRuling, appealDecisions, localId, appealInfo] = await Promise.all([
    readOutcome(
      "the vote counts",
      async () => {
        const [votes] = await client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "getDispute", args: [disputeId] });
        return votes;
      },
      signal,
    ),
    readOutcome("the current ruling", () => client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "currentRuling", args: [disputeId] }), signal),
    readAppealDecisions(context, binding, fromBlock),
    family === undefined ? unresolved : resolveLocalId(client, binding, family),
    hasAppealInfo(found.dispute) ? readAppealInfo(client, binding, signal) : null,
  ]);
  return { ...found, votesLengths, currentRuling, appealDecisions, appealInfo, localId };
}
