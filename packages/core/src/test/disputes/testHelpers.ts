import { encodeAbiParameters, encodeEventTopics } from "viem";
import { z } from "../../zod";
import { erc792Abi, klerosLiquidAbi } from "../../abi";
import type { Address, Hex } from "../../types";
import mainnet from "../../disputes/__fixtures__/arbitrator-1.json";
import executedRulings from "../../disputes/__fixtures__/executed-rulings.json";
import gnosis from "../../disputes/__fixtures__/arbitrator-100.json";
import sepolia from "../../disputes/__fixtures__/arbitrator-11155111.json";
import { callKey, rpcLog, type CallReply, type FakeNodeSpec, type RpcLog } from "../rpc/testHelpers";

export { recordedDetection } from "../families/testHelpers";
export { fakeFetcher } from "../fetch/testHelpers";
export {
  answer,
  callKey,
  fakeNode as fakeClient,
  reverting as failure,
  rpcError,
  type CallReply as CallAnswer,
  type FakeNodeSpec as FakeNode,
  type NodeRequests,
  type RpcErrorBody,
} from "../rpc/testHelpers";

export function selectorOf(key: string): string {
  return key.split(":0x")[1]?.slice(0, 8) ?? "";
}

export function disputeCreationLog(arbitrator: Address, disputeId: bigint, arbitrable: Address, blockNumber: bigint, logIndex = 0): RpcLog {
  const topics = encodeEventTopics({ abi: klerosLiquidAbi, eventName: "DisputeCreation", args: { _disputeID: disputeId, _arbitrable: arbitrable } });
  return rpcLog({ address: arbitrator, topics: topics as Hex[], data: "0x", blockNumber, logIndex });
}

export function newPeriodLog(arbitrator: Address, disputeId: bigint, period: number, blockNumber: bigint, logIndex = 0): RpcLog {
  const topics = encodeEventTopics({ abi: klerosLiquidAbi, eventName: "NewPeriod", args: { _disputeID: disputeId } });
  return rpcLog({ address: arbitrator, topics: topics as Hex[], data: encodeAbiParameters([{ type: "uint8" }], [period]), blockNumber, logIndex });
}

export function appealDecisionLog(arbitrator: Address, disputeId: bigint, arbitrable: Address, blockNumber: bigint, logIndex = 0): RpcLog {
  const topics = encodeEventTopics({ abi: klerosLiquidAbi, eventName: "AppealDecision", args: { _disputeID: disputeId, _arbitrable: arbitrable } });
  return rpcLog({ address: arbitrator, topics: topics as Hex[], data: "0x", blockNumber, logIndex });
}

export function rulingLog(arbitrable: Address, arbitrator: Address, disputeId: bigint, ruling: bigint, blockNumber: bigint, logIndex = 0): RpcLog {
  const topics = encodeEventTopics({ abi: erc792Abi, eventName: "Ruling", args: { _arbitrator: arbitrator, _disputeID: disputeId } });
  return rpcLog({ address: arbitrable, topics: topics as Hex[], data: encodeAbiParameters([{ type: "uint256" }], [ruling]), blockNumber, logIndex });
}

const hexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/)
  .transform((value) => value as Hex);
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-f]{40}$/)
  .transform((value) => value as Address);
const logSchema = z.object({
  address: addressSchema,
  topics: z.array(hexSchema),
  data: hexSchema,
  blockNumber: hexSchema,
  blockHash: hexSchema,
  transactionHash: hexSchema,
  transactionIndex: hexSchema,
  logIndex: hexSchema,
  removed: z.boolean(),
});
const recordingSchema = z.object({
  chainId: z.number(),
  readAtBlock: z.number(),
  arbitrator: addressSchema,
  policyRegistry: addressSchema,
  gateway: z
    .string()
    .startsWith("https://")
    .transform((value) => value as `https://${string}`),
  calls: z.array(
    z.object({
      to: addressSchema,
      data: hexSchema,
      result: hexSchema.optional(),
      error: z.object({ code: z.number(), message: z.string() }).optional(),
    }),
  ),
  logs: z.array(logSchema),
  timestamps: z.record(z.string(), hexSchema),
  policies: z.record(z.string(), z.string()),
});

export interface Recording {
  readonly chainId: number;
  readonly readAtBlock: bigint;
  readonly arbitrator: Address;
  readonly policyRegistry: Address;
  readonly gateway: `https://${string}`;
  readonly calls: ReadonlyMap<string, CallReply>;
  readonly logs: readonly RpcLog[];
  readonly timestamps: Readonly<Record<string, Hex>>;
  /** Policy URI as stored on chain → the gateway's body. */
  readonly policies: Readonly<Record<string, string>>;
}

function toRecording(raw: unknown): Recording {
  const parsed = recordingSchema.parse(raw);
  const entries = parsed.calls.map((call): [string, CallReply] => [
    callKey(call.to, call.data),
    call.error === undefined ? { result: call.result ?? "0x" } : { error: call.error },
  ]);
  return {
    chainId: parsed.chainId,
    readAtBlock: BigInt(parsed.readAtBlock),
    arbitrator: parsed.arbitrator,
    policyRegistry: parsed.policyRegistry,
    gateway: parsed.gateway,
    calls: new Map(entries),
    logs: parsed.logs,
    timestamps: parsed.timestamps,
    policies: parsed.policies,
  };
}

export const MAINNET = toRecording(mainnet);
export const GNOSIS = toRecording(gnosis);
export const SEPOLIA = toRecording(sepolia);

const executionSchema = z.object({
  chains: z.array(
    z.object({
      chainId: z.number(),
      readAtBlock: z.number(),
      arbitrator: addressSchema,
      calls: z.array(z.object({ to: addressSchema, data: hexSchema, result: hexSchema })),
      logs: z.array(logSchema),
    }),
  ),
});

export interface ExecutionRecording {
  readonly chainId: number;
  readonly readAtBlock: bigint;
  readonly arbitrator: Address;
  readonly calls: ReadonlyMap<string, CallReply>;
  readonly logs: readonly RpcLog[];
}

function toExecutionRecordings(raw: unknown): ExecutionRecording[] {
  return executionSchema.parse(raw).chains.map((chain) => ({
    chainId: chain.chainId,
    readAtBlock: BigInt(chain.readAtBlock),
    arbitrator: chain.arbitrator,
    calls: new Map(chain.calls.map((call): [string, CallReply] => [callKey(call.to, call.data), { result: call.result }])),
    logs: chain.logs,
  }));
}

const [executionMainnet, executionGnosis] = toExecutionRecordings(executedRulings);
if (executionMainnet === undefined || executionGnosis === undefined) throw new Error("executed-rulings.json must hold mainnet then Gnosis");

export const EXECUTION_MAINNET: ExecutionRecording = executionMainnet;
export const EXECUTION_GNOSIS: ExecutionRecording = executionGnosis;

export function executionNode(recording: ExecutionRecording, overrides: Partial<FakeNodeSpec> = {}): FakeNodeSpec {
  return { head: recording.readAtBlock, calls: recording.calls, logs: recording.logs, ...overrides };
}

export function recordedNode(recording: Recording, overrides: Partial<FakeNodeSpec> & { readonly extraCalls?: readonly [string, CallReply][] } = {}): FakeNodeSpec {
  const { extraCalls = [], ...rest } = overrides;
  return {
    head: recording.readAtBlock,
    calls: new Map([...recording.calls, ...extraCalls]),
    logs: recording.logs,
    timestamps: recording.timestamps,
    ...rest,
  };
}

export function recordedPolicyBodies(recording: Recording): Record<string, string> {
  return Object.fromEntries(Object.entries(recording.policies).map(([uri, body]) => [`${recording.gateway}${uri}`, body]));
}
