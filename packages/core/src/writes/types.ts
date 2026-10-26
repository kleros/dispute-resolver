import type { WriteCall } from "../types";

/** Why a write cannot be built. The UI shows it; nothing is sent. */
export type WriteRefusal =
  | "evidence-unsupported" // family has no evidence dialect (view-only, kleros.eth)
  | "appeal-unsupported" // family has no funding dialect
  | "withdraw-unsupported" // idr-legacy, escrow, view-only
  | "local-id-unresolved" // the family needs a local ID that could not be read
  | "not-content-addressed" // an upload result failed the canonical check before going on-chain
  | "no-arbitrable-proxy" // the chain has no ArbitrableProxy
  | "ruling-out-of-range" // the dialect cannot encode the ruling: governor ruling 0 names no list, uint8 above 255, a ruling or ruling-option count outside uint256
  | "family-mismatch" // the family detection is not the binding's arbitrable on the binding's chain
  | "call-chain-mismatch"; // the built call targets another chain than the page

export type WriteBuild = { readonly ok: true; readonly call: WriteCall } | { readonly ok: false; readonly refusal: WriteRefusal };

export type ChainMatch =
  | { readonly ok: true; readonly chainId: number }
  | { readonly ok: false; readonly reason: "no-wallet" }
  | { readonly ok: false; readonly reason: "wrong-chain"; readonly walletChainId: number; readonly pageChainId: number };
