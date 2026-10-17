import { getAbiItem } from "viem";
import { idrV2Abi, klerosLiquidAbi } from "../../../packages/core/src/abi";
import { readGovernorRound, readGovernorSession } from "../../../packages/core/src/appeals/governor";
import { lookupDispute, readAppealDecisions, resolveLocalId } from "../../../packages/core/src/disputes";
import type { ArbitratedBinding, DisputeLookup, LocalIdResolution } from "../../../packages/core/src/disputes/types";
import { readDisputeEvent } from "../../../packages/core/src/evidence";
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

/**
 * A governor session's funding of one dispute (D-47): the session its ERC-1497 `Dispute` event names, and per round of
 * the session (one more than the dispute's appeals) the fees paid to each list, as `getRoundInfo` returns them.
 */
export interface GovernorFunding {
  readonly session: bigint;
  readonly paidFees: readonly (readonly bigint[])[];
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
  /** A governor session none of whose lists was paid in any round: the case has no contributor (MC-7). */
  | { readonly status: "no-contributions"; readonly account: null; readonly family: "governor"; readonly governor: GovernorFunding; readonly reason: string }
  /**
   * A governor session with paid fees: it has contributors, but the governor emits no event naming them and 04 §1 has
   * no rule for picking one (MC-7), so the case runs with no account and the funding is recorded.
   */
  | { readonly status: "governor-funded"; readonly account: null; readonly family: "governor"; readonly governor: GovernorFunding; readonly reason: string }
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
  /** The governor session of the dispute and its fees per round and list (D-47); rejects on a failed read. */
  governorFunding(binding: ArbitratedBinding, fromBlock: bigint): Promise<GovernorFunding>;
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
      return `the ${family} family has no local dispute ID, so it emits no Contribution events`;
    case "transaction-id":
      return "Escrow V1 transactions are appealed by paying the appeal cost and emit no Contribution events";
    case "unresolved":
      return `the local dispute ID could not be read (${resolution.reason})`;
    case "local-id":
      return "";
  }
}

/**
 * A governor case (D-47, MC-7). The governor emits no `Contribution` event, so whether the dispute has contributions
 * is read from its session instead: a session whose lists were never paid has none (04 §1: no account); one with paid
 * fees has contributors that no event names, so it is recorded as funded with no account.
 */
async function governorRecord(reads: ContributorReads, binding: ArbitratedBinding, disputeId: bigint): Promise<ContributorRecord> {
  const governor = await reads.governorFunding(binding, await reads.creationBlock(disputeId));
  const session = governor.session.toString();
  if (governor.paidFees.every((round) => round.every((fee) => fee === 0n))) {
    const reason = `no list of governor session ${session} was paid in any of its ${String(governor.paidFees.length)} rounds (getRoundInfo), so the case has no contributor`;
    return { status: "no-contributions", account: null, family: "governor", governor, reason };
  }
  const reason = `governor session ${session} has paid fees, but the governor emits no Contribution events and 04 §1 has no rule naming one of its contributors (MC-7)`;
  return { status: "governor-funded", account: null, family: "governor", governor, reason };
}

/**
 * The first contributor of a dispute (04 §1): every `Contribution` event of the arbitrable for the dispute's local ID,
 * all rounds, from the dispute's creation block to the reader's block, ordered by block and log index. Escrow V1 and
 * view-only arbitrables have no local dispute ID and no `Contribution` events; governors are read through their session
 * (`governorRecord`). Never rejects: a failed read is an `error` record with a message safe to print.
 */
export async function readFirstContributor(reads: ContributorReads, disputeId: bigint): Promise<ContributorRecord> {
  try {
    const lookup = await reads.lookup(disputeId);
    if (lookup.status === "unavailable") return { status: "error", account: null, message: lookup.error.message };
    if (lookup.status !== "found") return { status: "error", account: null, message: `Dispute ${disputeId.toString()} does not exist (${lookup.status}).` };
    const family = await reads.detect(lookup.binding.arbitrated);
    if (family.family === "governor") return await governorRecord(reads, lookup.binding, disputeId);
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
    governorFunding: async (binding, fromBlock) => {
      const governor = binding.arbitrated;
      const disputeEvent = await readDisputeEvent({ client, arbitrable: governor, arbitrator, disputeId: binding.disputeId, fromBlock });
      if (!disputeEvent.ok) throw new Error(disputeEvent.error.message);
      if (disputeEvent.value.status !== "found") throw new Error(`The governor's Dispute event of dispute ${binding.disputeId.toString()} is ${disputeEvent.value.status}.`);
      const session = disputeEvent.value.event.evidenceGroupId;
      const { disputeId } = await readGovernorSession(client, governor, session);
      if (disputeId !== binding.disputeId) throw new Error(`Governor session ${session.toString()} belongs to dispute ${disputeId.toString()}, not ${binding.disputeId.toString()}.`);
      const appeals = await readAppealDecisions({ chainId, client }, binding, fromBlock);
      if (!appeals.ok) throw new Error(appeals.error.message);
      const rounds = Array.from({ length: appeals.value.length + 1 }, (_, round) => BigInt(round));
      const paidFees = await Promise.all(rounds.map(async (round) => (await readGovernorRound(client, governor, session, round)).paidFees));
      return { session, paidFees };
    },
  };
}
