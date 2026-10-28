import type { Unavailable, WriteCall } from "../types";

/** Why a write cannot be built. The UI shows it; nothing is sent. */
export type WriteRefusal =
  | "evidence-unsupported" // family has no evidence dialect (view-only, kleros.eth)
  | "appeal-unsupported" // family has no funding dialect, idr-legacy included
  | "withdraw-unsupported" // idr-legacy, escrow, view-only
  | "local-id-unresolved" // the family needs a local ID that could not be read
  | "not-content-addressed" // an upload result failed the canonical check before going on-chain
  | "no-arbitrable-proxy" // the chain has no ArbitrableProxy
  | "ruling-out-of-range" // the dialect cannot encode the ruling: governor ruling 0 names no list, a ruling or ruling-option count outside uint256
  | "family-mismatch" // the family detection is not the binding's arbitrable on the binding's chain
  | "call-chain-mismatch" // the built call targets another chain than the page
  | "funding-closed"; // the card's funding deadline has passed

export type WriteBuild = { readonly ok: true; readonly call: WriteCall } | { readonly ok: false; readonly refusal: WriteRefusal };

export type ChainMatch =
  | { readonly ok: true; readonly chainId: number }
  | { readonly ok: false; readonly reason: "no-wallet" }
  | { readonly ok: false; readonly reason: "wrong-chain"; readonly walletChainId: number; readonly pageChainId: number };

/**
 * The check of a write against the contract, made through the read RPC before the wallet opens. Only `ok` lets the
 * write go on; it never authorizes it, since the state can change before the transaction is mined.
 */
export type SimulationResult =
  | { readonly status: "ok" }
  | { readonly status: "reverted"; readonly reason: string | null } // a known contract's own reason as plain text, else null
  | { readonly status: "insufficient-funds" }
  | { readonly status: "unavailable"; readonly error: Unavailable };
