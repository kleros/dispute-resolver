/**
 * Test-only typed view of `governor-multipliers.json`: the raw replies of every multiplier getter of the four deployed
 * governors, each chain read at its own pinned block. Parsed with Zod so a malformed recording fails loudly.
 */
import { decodeFunctionResult } from "viem";
import { z } from "../../zod";
import { governorAbi } from "../../abi";
import { toRegistryAddress } from "../../registry";
import type { ChainId, Hex } from "../../types";
import type { CallReply } from "../../test/appeals/testHelpers";
import recording from "./governor-multipliers.json";
import type { RecordedGetters } from "./recorded";

const hex = z
  .string()
  .regex(/^0x[\da-f]*$/i)
  .transform((value): Hex => value as Hex);
const reply = z.union([z.object({ result: hex }), z.object({ error: z.object({ code: z.number(), message: z.string() }) })]);
const schema = z.object({
  chains: z.array(z.object({ chainId: z.number(), blockNumber: z.number() })),
  contracts: z.array(z.object({ label: z.string(), chainId: z.number(), address: z.string().transform((value) => toRegistryAddress(value)), calls: z.record(z.string(), reply) })),
});

const parsed = schema.parse(recording);

export interface RecordedGovernor extends RecordedGetters {
  readonly chainId: ChainId;
  /** The block of its chain every reply was read at. */
  readonly blockNumber: bigint;
}

function pinnedBlock(chainId: number): bigint {
  const chain = parsed.chains.find((candidate) => candidate.chainId === chainId);
  if (chain === undefined) throw new Error(`no pinned block for chain ${String(chainId)}`);
  return BigInt(chain.blockNumber);
}

/** poh.eth, ubi-voting.eth and kleros.eth (chain 1) and fork-dao.eth (chain 100), with the replies of every getter. */
export const GOVERNOR_MULTIPLIERS: readonly RecordedGovernor[] = parsed.contracts.map((contract) => ({
  label: contract.label,
  chainId: contract.chainId,
  address: contract.address,
  blockNumber: pinnedBlock(contract.chainId),
  replies: contract.calls satisfies Readonly<Record<string, CallReply>>,
}));

export type GovernorGetter = "winnerMultiplier" | "loserMultiplier" | "MULTIPLIER_DIVISOR" | "sharedMultiplier";

/** The uint256 a governor answered `getter()` with, decoded with the governor ABI. */
export function recordedValue(governor: RecordedGovernor, getter: GovernorGetter): bigint {
  const answer = governor.replies[`${getter}()`];
  if (answer === undefined || !("result" in answer)) throw new Error(`${governor.label} has no recorded ${getter}()`);
  return decodeFunctionResult({ abi: governorAbi, functionName: getter, data: answer.result });
}
