import type { WriteRefusal } from "@dispute-resolver/core";
import { chainName } from "./chains";
import type { WriteStatus } from "./types";
import type { NoticeVariant } from "../ui";

/** Why a write was refused, in the user's terms. */
const REFUSALS: Readonly<Record<WriteRefusal, string>> = {
  "evidence-unsupported": "This arbitrable contract does not accept evidence through the Dispute Resolver.",
  "appeal-unsupported": "This arbitrable contract does not accept appeal funding through the Dispute Resolver.",
  "withdraw-unsupported": "There is nothing this contract lets the Dispute Resolver withdraw.",
  "local-id-unresolved": "The arbitrable contract's identifier for this dispute could not be read, so nothing was sent.",
  "not-content-addressed": "The uploaded file did not come back as a content-addressed IPFS link, so nothing was sent.",
  "no-arbitrable-proxy": "Creating disputes is not available on this network.",
  "ruling-out-of-range": "This ruling cannot be encoded for this contract, so nothing was sent.",
  "family-mismatch": "The contract details do not match this dispute, so nothing was sent.",
  "call-chain-mismatch": "This action was prepared for a different network than this page, so nothing was sent.",
  "funding-closed": "Funding for this ruling has closed, so nothing was sent.",
};

interface WriteMessage {
  readonly variant: NoticeVariant;
  readonly title: string;
  readonly body: string;
}

interface WriteMessageOptions {
  /** Before any attempt, the wrong-chain notice explains why the action is locked, so it does not claim that nothing was sent. */
  readonly beforeAttempt?: boolean;
  /** A switch request waits in the wallet: the wrong-chain notice stops asking for a switch that was already asked. */
  readonly switching?: boolean;
}

/** The notice of every status except `idle`. A rejection is neutral, not an error. */
export function writeMessage(status: Exclude<WriteStatus, { readonly phase: "idle" }>, { beforeAttempt = false, switching = false }: WriteMessageOptions = {}): WriteMessage {
  switch (status.phase) {
    case "refused":
      return { variant: "error", title: "Action unavailable", body: REFUSALS[status.refusal] };
    case "needs-wallet":
      return { variant: "info", title: "Wallet required", body: "Connect a wallet to continue." };
    case "wrong-chain": {
      const mismatch = `Your wallet is on ${chainName(status.walletChainId)}, but this page is on ${chainName(status.pageChainId)}.`;
      const body = switching ? mismatch : `${mismatch} Switch your wallet to ${chainName(status.pageChainId)} to continue.`;
      return { variant: "warning", title: "Wrong network", body: beforeAttempt ? body : `${body} Nothing was sent.` };
    }
    case "checking":
      return { variant: "info", title: "Checking the transaction", body: "Checking with the contract that it accepts this transaction before your wallet opens." };
    case "refused-by-contract":
      return {
        variant: "error",
        title: "The contract would reject this transaction",
        body: status.reason === null ? "Nothing was sent." : `Nothing was sent. The contract's answer: “${status.reason}”`,
      };
    case "insufficient-funds":
      return { variant: "error", title: "Balance too low", body: "Your wallet's balance does not cover this transaction. Nothing was sent." };
    case "check-failed":
      return { variant: "warning", title: "Transaction not checked", body: `The transaction could not be checked against the contract, so nothing was sent. ${status.message}` };
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
