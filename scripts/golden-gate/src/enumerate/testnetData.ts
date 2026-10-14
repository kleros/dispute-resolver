import { z } from "zod";
import { toRegistryAddress } from "../../../../packages/core/src/registry";
import type { Address, ChainId } from "../../../../packages/core/src/types";
import { readJson } from "../output";
import { TESTNET_REALITY_FILE } from "../paths";

const chainSchema = z.object({
  blockNumber: z.number().int(),
  arbitrator: z.string(),
  allowlistedRealityProxies: z.array(z.string()),
  disputes: z.array(z.object({ disputeId: z.number().int().nonnegative(), arbitrable: z.string(), blockNumber: z.number().int() })),
});

const fileSchema = z.record(z.string().regex(/^\d+$/), chainSchema);

export interface TestnetRealityDispute {
  readonly chainId: ChainId;
  readonly disputeId: bigint;
  readonly arbitrable: Address;
}

/**
 * The Sepolia and Chiado disputes of allowlisted Reality proxies (`data/testnet-reality-disputes.json`, recorded by the
 * orchestrator with the block it was read at). 04 §5 requires every one of them in the gate; the enumeration is checked
 * against this list.
 */
export function parseTestnetRealityDisputes(value: unknown): TestnetRealityDispute[] {
  const file = fileSchema.parse(value);
  return Object.entries(file).flatMap(([chainId, chain]) =>
    chain.disputes.map((dispute) => ({ chainId: Number(chainId), disputeId: BigInt(dispute.disputeId), arbitrable: toRegistryAddress(dispute.arbitrable) })),
  );
}

export function loadTestnetRealityDisputes(): TestnetRealityDispute[] {
  return parseTestnetRealityDisputes(readJson(TESTNET_REALITY_FILE));
}
