import type { ChainId, WriteCall } from "../types";

/** Why a write cannot be built. The UI shows it; nothing is sent (D-07, D-47). */
export type WriteRefusal =
  | "evidence-unsupported" // family has no evidence dialect (view-only, kleros.eth)
  | "appeal-unsupported" // family has no funding dialect
  | "withdraw-unsupported" // idr-legacy (D-46), escrow, view-only
  | "local-id-unresolved" // the family needs a local ID that could not be read
  | "not-content-addressed" // an upload result failed the canonical check before going on-chain (B16)
  | "no-arbitrable-proxy" // the chain has no ArbitrableProxy (spec 4.2)
  | "ruling-out-of-range" // the dialect cannot encode the ruling: governor ruling 0 names no list (D-47), uint8 above 255 (D-46), a ruling or ruling-option count outside uint256
  | "family-mismatch"; // the family detection is not the binding's arbitrable on the binding's chain (A22)

export type WriteBuild = { readonly ok: true; readonly call: WriteCall } | { readonly ok: false; readonly refusal: WriteRefusal };

/** The chain-match guard of every write path (B3, D-48). */
export type ChainMatch =
  | { readonly ok: true; readonly chainId: ChainId }
  | { readonly ok: false; readonly reason: "no-wallet" }
  | { readonly ok: false; readonly reason: "wrong-chain"; readonly walletChainId: number; readonly pageChainId: ChainId };
