import type { WriteRefusal } from "@dispute-resolver/core";
import { chainName } from "./chains";
import type { WriteStatus } from "./types";
import type { NoticeVariant } from "../ui";

/** Why a write was refused, in the user's terms (D-07, D-47). */
const REFUSALS: Readonly<Record<WriteRefusal, string>> = {
  "evidence-unsupported": "This arbitrable contract does not accept evidence through the Dispute Resolver.",
  "appeal-unsupported": "This arbitrable contract does not accept appeal funding through the Dispute Resolver.",
  "withdraw-unsupported": "There is nothing this contract lets the Dispute Resolver withdraw.",
  "local-id-unresolved": "The arbitrable contract's identifier for this dispute could not be read, so nothing was sent.",
  "not-content-addressed": "The uploaded file did not come back as a content-addressed IPFS link, so nothing was sent.",
  "no-arbitrable-proxy": "Creating disputes is not available on this network.",
  "ruling-out-of-range": "This ruling cannot be encoded for this contract, so nothing was sent.",
  "family-mismatch": "The contract details do not match this dispute, so nothing was sent.",
};

export interface WriteMessage {
  readonly variant: NoticeVariant;
  readonly title: string;
  readonly body: string;
}

/** The notice of every status except `idle` (ARCHITECTURE.md §6.1). A rejection is neutral, not an error (D-07). */
export function writeMessage(status: Exclude<WriteStatus, { readonly phase: "idle" }>): WriteMessage {
  switch (status.phase) {
    case "refused":
      return { variant: "error", title: "Action unavailable", body: REFUSALS[status.refusal] };
    case "needs-wallet":
      return { variant: "info", title: "Wallet required", body: "Connect a wallet to continue." };
    case "wrong-chain":
      return {
        variant: "warning",
        title: "Wrong network",
        body: `Your wallet is on ${chainName(status.walletChainId)}, but this page is on ${chainName(status.pageChainId)}. Switch your wallet to ${chainName(status.pageChainId)} to continue. Nothing was sent.`,
      };
    case "pending":
      return { variant: "info", title: "Waiting for your wallet", body: "Confirm the transaction in your wallet." };
    case "submitted":
      return { variant: "info", title: "Transaction submitted", body: "Waiting for the transaction to be mined." };
    case "mined":
      return { variant: "success", title: "Transaction confirmed", body: "The transaction was mined." };
    case "failed":
      return { variant: "error", title: "Transaction failed", body: status.message };
    case "rejected":
      return { variant: "info", title: "Transaction cancelled", body: "You declined the transaction in your wallet. Nothing was sent." };
  }
}
