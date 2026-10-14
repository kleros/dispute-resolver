import { z } from "zod";
import type { ChainId } from "../../../packages/core/src/types";
import { readJson } from "./output";
import { STABLE_TIER_FILE } from "./paths";

/** Where a golden case comes from: 04 §2's stable tier and its pending-execution table, or 04 §3's live tier. */
export type CaseTier = "stable" | "pending" | "live";

export interface GoldenCase {
  readonly chainId: ChainId;
  readonly disputeId: bigint;
  readonly tier: CaseTier;
}

const stableTierSchema = z.object({
  source: z.string(),
  cases: z.array(
    z.object({
      chainId: z.number().int().positive(),
      disputeId: z.number().int().nonnegative(),
      tier: z.enum(["stable", "pending"]),
    }),
  ),
});

/** Parses the transcription of 04 §2 (`data/stable-tier.json`); rejects duplicates, which would hide a typo. */
export function parseStableTier(value: unknown): GoldenCase[] {
  const parsed = stableTierSchema.parse(value);
  const seen = new Set<string>();
  return parsed.cases.map(({ chainId, disputeId, tier }) => {
    const key = `${String(chainId)}:${String(disputeId)}`;
    if (seen.has(key)) throw new Error(`data/stable-tier.json lists ${key} twice.`);
    seen.add(key);
    return { chainId, disputeId: BigInt(disputeId), tier };
  });
}

export function loadStableTier(): GoldenCase[] {
  return parseStableTier(readJson(STABLE_TIER_FILE));
}

/** A case's key in the outputs: `<chain>:<dispute>`. */
export function caseKey(chainId: ChainId, disputeId: bigint): string {
  return `${String(chainId)}:${disputeId.toString()}`;
}
