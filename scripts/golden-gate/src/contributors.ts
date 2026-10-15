import { getAbiItem } from "viem";
import { idrV2Abi, klerosLiquidAbi } from "../../../packages/core/src/abi";
import { lookupDispute, resolveLocalId } from "../../../packages/core/src/disputes";
import type { ArbitratedBinding, DisputeLookup, LocalIdResolution } from "../../../packages/core/src/disputes/types";
import { detectFamily } from "../../../packages/core/src/families";
import type { Family, FamilyDetection } from "../../../packages/core/src/families/types";
import { toRegistryAddress } from "../../../packages/core/src/registry";
import { describeError, getLogsChunked } from "../../../packages/core/src/rpc";
import type { Address, Hex } from "../../../packages/core/src/types";
import type { ChainReader } from "./chains";

const CONTRIBUTION_EVENT = getAbiItem({ abi: idrV2Abi, name: "Contribution" });
const DISPUTE_CREATION_EVENT = getAbiItem({ abi: klerosLiquidAbi, name: "DisputeCreation" });

/** One `Contribution` event of a dispute's arbitrable. */
export interface ContributionLog {
  readonly contributor: Address;
  readonly round: bigint;
  readonly ruling: bigint;
  readonly amount: bigint;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash: Hex;
}

/** What 04 §1's account context records for one case. */
export type ContributorRecord =
  | {
      readonly status: "contributor";
      readonly account: Address;
      readonly family: Family;
      readonly localId: bigint;
      readonly contributions: number;
      readonly first: ContributionLog;
    }
  | { readonly status: "no-contributions"; readonly account: null; readonly family: Family; readonly localId: bigint }
  | { readonly status: "no-local-id"; readonly account: null; readonly family: Family; readonly reason: string }
  | { readonly status: "error"; readonly account: null; readonly message: string };

/** The reads `readFirstContributor` needs, injected so the selection is tested without a chain. */
export interface ContributorReads {
  lookup(disputeId: bigint): Promise<DisputeLookup>;
  detect(arbitrable: Address): Promise<FamilyDetection>;
  localId(binding: ArbitratedBinding, family: FamilyDetection): Promise<LocalIdResolution>;
  /** The block of the arbitrator's `DisputeCreation` event of the dispute: no contribution can be older. */
  creationBlock(disputeId: bigint): Promise<bigint>;
  contributions(arbitrable: Address, localId: bigint, fromBlock: bigint): Promise<ContributionLog[]>;
}

function chronological(a: ContributionLog, b: ContributionLog): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}

/** The earliest contribution: lowest block, then lowest log index (04 §1 "the first contributor"). */
export function firstContribution(logs: readonly ContributionLog[]): ContributionLog | undefined {
  return [...logs].sort(chronological)[0];
}

function localIdReason(resolution: LocalIdResolution, family: Family): string {
  switch (resolution.kind) {
    case "not-applicable":
      return family === "governor"
        ? "the governor emits no Contribution events: its contributions are read per contributor with getContributions (D-47), so its logs name no contributor"
        : `the ${family} family has no local dispute ID, so it emits no Contribution events`;
    case "transaction-id":
      return "Escrow V1 transactions are appealed by paying the appeal cost and emit no Contribution events";
    case "unresolved":
      return `the local dispute ID could not be read (${resolution.reason})`;
    case "local-id":
      return "";
  }
}

/**
 * The first contributor of a dispute (04 §1): every `Contribution` event of the arbitrable for the dispute's local ID,
 * all rounds, from the dispute's creation block to the reader's block, ordered by block and log index. Families
 * without a local dispute ID (governors, Escrow V1, view-only) have no `Contribution` events (MC-7). Never rejects: a
 * failed read is an `error` record with a message safe to print.
 */
export async function readFirstContributor(reads: ContributorReads, disputeId: bigint): Promise<ContributorRecord> {
  try {
    const lookup = await reads.lookup(disputeId);
    if (lookup.status === "unavailable") return { status: "error", account: null, message: lookup.error.message };
    if (lookup.status !== "found") return { status: "error", account: null, message: `Dispute ${disputeId.toString()} does not exist (${lookup.status}).` };
    const family = await reads.detect(lookup.binding.arbitrated);
    const resolution = await reads.localId(lookup.binding, family);
    if (resolution.kind === "unresolved" && resolution.reason === "rpc-error") return { status: "error", account: null, message: localIdReason(resolution, family.family) };
    if (resolution.kind !== "local-id") return { status: "no-local-id", account: null, family: family.family, reason: localIdReason(resolution, family.family) };
    const fromBlock = await reads.creationBlock(disputeId);
    const logs = await reads.contributions(lookup.binding.arbitrated, resolution.value, fromBlock);
    const first = firstContribution(logs);
    if (first === undefined) return { status: "no-contributions", account: null, family: family.family, localId: resolution.value };
    return { status: "contributor", account: first.contributor, family: family.family, localId: resolution.value, contributions: logs.length, first };
  } catch (error) {
    return { status: "error", account: null, message: describeError(error) };
  }
}

/** The reads of `readFirstContributor` over core, as of the reader's block. */
export function chainContributorReads(reader: ChainReader): ContributorReads {
  const { client, chainId, arbitrator, block, chain } = reader;
  return {
    lookup: (disputeId) => lookupDispute({ chainId, client }, disputeId),
    detect: (arbitrable) => detectFamily({ client, chainId, arbitrable }),
    localId: (binding, family) => resolveLocalId(client, binding, family),
    creationBlock: async (disputeId) => {
      const fromBlock = BigInt(chain.arbitratorDeployedAtBlock ?? 0);
      const logs = await getLogsChunked(client, { address: arbitrator, event: DISPUTE_CREATION_EVENT, args: { _disputeID: disputeId }, fromBlock, toBlock: block });
      const [created] = logs;
      if (created === undefined) throw new Error(`No DisputeCreation event for dispute ${disputeId.toString()} on chain ${String(chainId)}.`);
      return created.blockNumber;
    },
    contributions: async (arbitrable, localId, fromBlock) => {
      const logs = await getLogsChunked(client, { address: arbitrable, event: CONTRIBUTION_EVENT, args: { _localDisputeID: localId }, fromBlock, toBlock: block });
      return logs.map((log) => {
        const { _contributor, _round, ruling, _amount } = log.args;
        if (_contributor === undefined || _round === undefined || ruling === undefined || _amount === undefined) {
          throw new Error(`A Contribution event of ${arbitrable} in transaction ${log.transactionHash} does not decode.`);
        }
        return {
          contributor: toRegistryAddress(_contributor),
          round: _round,
          ruling,
          amount: _amount,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
          transactionHash: log.transactionHash,
        };
      });
    },
  };
}
