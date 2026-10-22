import type { Address, ChainId, Hex, ProbedFamily } from "@dispute-resolver/core";

// Keys hold strings and numbers only, because TanStack hashes them with `JSON.stringify`, which throws on `bigint`:
// dispute IDs, rounds and blocks are decimal strings. Every key starts with `"dr"`, which keeps them apart from the keys
// `@kleros/kleros-app` registers in the same client.

/**
 * The governor session a funding or withdraw read used, so the read runs again once a Dispute event that failed to load
 * recovers with it. Other families ignore the session.
 */
function sessionPart(session: bigint | undefined): string {
  return session === undefined ? "none" : session.toString();
}

export const queryKeys = {
  courts: (chainId: ChainId) => ["dr", "courts", chainId] as const,
  ongoing: (chainId: ChainId, courtsState: "ok" | "none") => ["dr", "ongoing", chainId, courtsState] as const,
  lookup: (chainId: ChainId, disputeId: bigint) => ["dr", "lookup", chainId, disputeId.toString()] as const,
  family: (chainId: ChainId, arbitrable: Address) => ["dr", "family", chainId, arbitrable] as const,
  metaEvidence: (chainId: ChainId, disputeId: bigint, arbitrable: Address) => ["dr", "metaEvidence", chainId, disputeId.toString(), arbitrable] as const,
  disputeEvent: (chainId: ChainId, disputeId: bigint, arbitrable: Address) => ["dr", "disputeEvent", chainId, disputeId.toString(), arbitrable] as const,
  evidence: (chainId: ChainId, disputeId: bigint, arbitrable: Address, evidenceGroupId: bigint) =>
    ["dr", "evidence", chainId, disputeId.toString(), arbitrable, evidenceGroupId.toString()] as const,
  details: (chainId: ChainId, disputeId: bigint, writeFamily: ProbedFamily | "unknown", disputeEventBlock: bigint | null) =>
    ["dr", "details", chainId, disputeId.toString(), writeFamily, disputeEventBlock === null ? "none" : disputeEventBlock.toString()] as const,
  multipliers: (chainId: ChainId, arbitrable: Address) => ["dr", "multipliers", chainId, arbitrable] as const,
  /** `session`: the evidence group of the Dispute event, a governor's session; `undefined` while it is unknown. */
  funding: (chainId: ChainId, disputeId: bigint, round: bigint, fromBlock: bigint, session: bigint | undefined) =>
    ["dr", "funding", chainId, disputeId.toString(), round.toString(), fromBlock.toString(), sessionPart(session)] as const,
  /** `session`: as for `funding`. */
  withdrawable: (chainId: ChainId, disputeId: bigint, account: Address | undefined, rounds: readonly bigint[], session: bigint | undefined) =>
    ["dr", "withdrawable", chainId, disputeId.toString(), account ?? "none", rounds.join(","), sessionPart(session)] as const,
  cost: (chainId: ChainId, extraData: Hex) => ["dr", "cost", chainId, extraData] as const,
  accountCode: (chainId: ChainId, account: Address) => ["dr", "accountCode", chainId, account] as const,
  chainTime: (chainId: ChainId) => ["dr", "chainTime", chainId] as const,
} as const;

/** Prefixes for invalidating every key of one dispute and kind, whatever the rest of the key. */
export const disputeKeyPrefix = (kind: "lookup" | "evidence" | "details" | "funding" | "withdrawable", chainId: ChainId, disputeId: bigint) =>
  ["dr", kind, chainId, disputeId.toString()] as const;

/**
 * The key of a hook whose inputs are not known yet. Its query never runs (`skipToken`) and the hook reports `loading`,
 * so a placeholder can never observe a real dispute's data (dispute 0 when the URL has no ID, for example).
 */
export const IDLE_KEY = ["dr", "idle"] as const;
