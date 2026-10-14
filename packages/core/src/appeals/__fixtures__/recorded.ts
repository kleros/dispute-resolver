/**
 * Test-only typed view of the appeals fixtures, each read at the block its file names. Parsed with Zod so a malformed
 * recording fails loudly instead of feeding the tests undefined values.
 */
import { z } from "zod";
import type { AppealDecisionEvent } from "../../disputes/types";
import { toRegistryAddress } from "../../registry";
import type { Address, Hex } from "../../types";
import { callKey, rpcLog, type CallReply, type RpcLog } from "../testHelpers";
import dispute1170Event from "./dispute-1170-dispute-event.json";
import dispute1170 from "./dispute-1170-unslashed.json";
import governor1621 from "./governor-1621.json";
import multipliers1 from "./multipliers-1.json";
import unslashed from "./unslashed-1678-1226.json";

const hex = z
  .string()
  .regex(/^0x[\da-f]*$/i)
  .transform((value): Hex => value as Hex);
const address = z.string().transform((value) => toRegistryAddress(value));
const reply = z.union([z.object({ result: hex }), z.object({ error: z.object({ code: z.number(), message: z.string() }) })]);
const log = z.object({ address: z.string(), topics: z.array(hex), data: hex, blockNumber: z.number(), logIndex: z.number(), transactionHash: hex });
const recordedCall = z.object({ label: z.string(), to: address, data: hex, reply });

type RecordedLog = z.infer<typeof log>;
type RecordedCall = z.infer<typeof recordedCall>;

/** An appeal decision at a recorded block. Its timestamp was not recorded; the rounds use block numbers only. */
function appealDecision(entry: { readonly blockNumber: number }): AppealDecisionEvent {
  return { blockNumber: BigInt(entry.blockNumber), appealedAt: 0 };
}

function asCallReplies(calls: readonly RecordedCall[]): [string, CallReply][] {
  return calls.map((call) => [callKey(call.to, call.data), call.reply]);
}

function asRpcLogs(logs: readonly RecordedLog[]): RpcLog[] {
  return logs.map((entry) => rpcLog(entry));
}

const dispute1170Schema = z.object({
  readAtBlock: z.number(),
  arbitrable: address,
  localDisputeID: z.string(),
  appealDecisions: z.array(log),
  fundingEvents: z.array(log.extend({ type: z.enum(["Contribution", "RulingFunded"]) })),
});
const dispute1170EventSchema = z.object({ readAtBlock: z.number(), disputeEvent: z.object({ blockNumber: z.number() }) });

const recorded1170 = dispute1170Schema.parse(dispute1170);

/** Unslashed dispute 1170 (5 appeals, 27 funding events in rounds 1 to 6), read at block 26,189,725. */
export const DISPUTE_1170 = {
  disputeId: 1170n,
  arbitrable: recorded1170.arbitrable,
  localId: BigInt(recorded1170.localDisputeID),
  readAtBlock: BigInt(recorded1170.readAtBlock),
  /** The ERC-1497 Dispute event's block, read at block 26,190,900. */
  disputeStartBlock: BigInt(dispute1170EventSchema.parse(dispute1170Event).disputeEvent.blockNumber),
  appealDecisions: recorded1170.appealDecisions.map(appealDecision),
  /** The appeal decisions with their log positions, for `(blockNumber, logIndex)` ordering. */
  appealDecisionPositions: recorded1170.appealDecisions.map((entry) => ({ blockNumber: BigInt(entry.blockNumber), logIndex: entry.logIndex })),
  fundingEvents: recorded1170.fundingEvents.map((entry) => ({
    type: entry.type,
    blockNumber: BigInt(entry.blockNumber),
    logIndex: entry.logIndex,
    round: BigInt(entry.topics[2] ?? "0x"),
  })),
  fundingLogs: asRpcLogs(recorded1170.fundingEvents),
} as const;

const unslashedSchema = z.object({
  readAtBlock: z.number(),
  arbitrable: address,
  disputes: z.array(
    z.object({
      disputeId: z.string(),
      localId: z.string(),
      externalIDtoLocalID: z.object({ to: address, data: hex, reply }),
      disputeEvent: z.array(log).length(1),
      appealDecisions: z.array(log),
      contributions: z.array(log),
      rulingFunded: z.array(log),
      firstContributor: address,
      withdrawable: z.array(recordedCall),
    }),
  ),
});

export interface RecordedUnslashedDispute {
  readonly disputeId: bigint;
  readonly localId: bigint;
  readonly disputeStartBlock: bigint;
  readonly appealDecisions: readonly AppealDecisionEvent[];
  /** `Contribution` and `RulingFunded` logs of every round. */
  readonly fundingLogs: readonly RpcLog[];
  readonly firstContributor: Address;
  /** `getTotalWithdrawableAmount(localId, firstContributor, [ruling])` for every ruling the first contributor funded. */
  readonly withdrawCalls: readonly [string, CallReply][];
}

const recordedUnslashed = unslashedSchema.parse(unslashed);

function unslashedDispute(disputeId: string): RecordedUnslashedDispute {
  const entry = recordedUnslashed.disputes.find((candidate) => candidate.disputeId === disputeId);
  const [disputeEvent] = entry?.disputeEvent ?? [];
  if (entry === undefined || disputeEvent === undefined) throw new Error(`dispute ${disputeId} is not recorded`);
  return {
    disputeId: BigInt(entry.disputeId),
    localId: BigInt(entry.localId),
    disputeStartBlock: BigInt(disputeEvent.blockNumber),
    appealDecisions: entry.appealDecisions.map(appealDecision),
    fundingLogs: asRpcLogs([...entry.contributions, ...entry.rulingFunded]),
    firstContributor: entry.firstContributor,
    withdrawCalls: asCallReplies(entry.withdrawable),
  };
}

/** Unslashed (mainnet) recorded at block 26,190,918. */
export const UNSLASHED = {
  arbitrable: recordedUnslashed.arbitrable,
  readAtBlock: BigInt(recordedUnslashed.readAtBlock),
  /** Golden 1678: no appeal; the 0.273 ETH contribution to ruling 2 and its `RulingFunded` sit in round 1. */
  dispute1678: unslashedDispute("1678"),
  /** Golden 1226: one appeal; rulings 2 and 1 both funded in round 1, the first 56,623 blocks after the Dispute event. */
  dispute1226: unslashedDispute("1226"),
} as const;

const multipliersSchema = z.object({
  blockNumber: z.number(),
  contracts: z.array(z.object({ label: z.string(), address, calls: z.record(z.string(), reply) })),
});

const recordedMultipliers = multipliersSchema.parse(multipliers1);

export interface RecordedGetters {
  readonly label: string;
  readonly address: Address;
  /** Getter signature (`"getMultipliers()"`, …) → the node's raw reply. */
  readonly replies: Readonly<Record<string, CallReply>>;
}

/** The raw replies of every multiplier getter of spec 10.9 on six mainnet contracts, read at block 26,190,905. */
export const MULTIPLIER_GETTERS: readonly RecordedGetters[] = recordedMultipliers.contracts.map((contract) => ({
  label: contract.label,
  address: contract.address,
  replies: contract.calls,
}));

const governorSchema = z.object({
  blockNumber: z.number(),
  disputeId: z.string(),
  arbitrator: address,
  governor: address,
  session: z.string(),
  calls: z.array(recordedCall),
  disputeLogs: z.array(z.object({ topics: z.array(hex), data: hex, blockNumber: hex })).length(1),
});

const recordedGovernor = governorSchema.parse(governor1621);

/** poh.eth governor dispute 1621 (no appeal, executed, ruling 2), read at block 26,190,903. */
export const GOVERNOR_1621 = {
  disputeId: BigInt(recordedGovernor.disputeId),
  arbitrator: recordedGovernor.arbitrator,
  governor: recordedGovernor.governor,
  blockNumber: BigInt(recordedGovernor.blockNumber),
  /** The ERC-1497 Dispute event's evidence group: the last word of its data. */
  evidenceGroupId: BigInt(`0x${recordedGovernor.disputeLogs[0]?.data.slice(-64) ?? ""}`),
  disputeStartBlock: BigInt(recordedGovernor.disputeLogs[0]?.blockNumber ?? "0x0"),
  calls: asCallReplies(recordedGovernor.calls),
} as const;
