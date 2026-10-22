import { checkChainMatch, explorerTxUrl, getChain, type ChainId, type ChainMatch, type Hex, type WriteBuild, type WriteCall } from "@dispute-resolver/core";
import { getAccount, writeContract, type Config } from "@wagmi/core";
import type { WriteReceipt } from "../data";
import { errorMessage, isChainMismatch, isUserRejection } from "./errors";
import type { WriteOptions, WriteOutcome, WriteStatus } from "./types";

/** What one write needs besides the call: wagmi to sign, and the configured read RPC for the receipt. */
export interface WriteEnvironment {
  readonly config: Config;
  waitForReceipt(chainId: ChainId, hash: Hex): Promise<WriteReceipt>;
}

type Report = (status: WriteStatus) => void;

function guardOutcome(match: ChainMatch, pageChainId: ChainId): WriteOutcome | null {
  if (match.ok) return null;
  if (match.reason === "no-wallet") return { phase: "needs-wallet", pageChainId };
  return { phase: "wrong-chain", walletChainId: match.walletChainId, pageChainId: match.pageChainId };
}

function connectedChainId(config: Config): number | undefined {
  const account = getAccount(config);
  return account.status === "connected" ? account.chainId : undefined;
}

/** The connector's own current chain, read immediately before signing; `undefined` without a connection. */
function connectorChainId(config: Config): Promise<number | undefined> {
  const { connector, status } = getAccount(config);
  return status === "connected" ? connector.getChainId() : Promise.resolve(undefined);
}

function explorerUrl(chainId: ChainId, hash: Hex): string | null {
  const chain = getChain(chainId);
  return chain === undefined ? null : explorerTxUrl(chain, hash);
}

/** Signs one call. A chain change between the guard and the signature is caught by wagmi's `chainId` check. */
async function sign(config: Config, call: WriteCall, pageChainId: ChainId): Promise<{ readonly hash: Hex } | { readonly outcome: WriteOutcome }> {
  try {
    const hash = await writeContract(config, {
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      value: call.value,
      chainId: call.chainId,
    });
    return { hash };
  } catch (error) {
    if (isUserRejection(error)) return { outcome: { phase: "rejected" } };
    if (isChainMismatch(error)) {
      const walletChainId = await connectorChainId(config).catch(() => undefined);
      const guard = guardOutcome(checkChainMatch(walletChainId, pageChainId), pageChainId);
      if (guard !== null) return { outcome: guard };
    }
    return { outcome: { phase: "failed", hash: null, explorerUrl: null, message: errorMessage(error) } };
  }
}

const CANCELLED_MESSAGE = "The transaction was cancelled in your wallet before it was mined, so it did not take effect.";
const REPLACED_MESSAGE = "The transaction was replaced in your wallet by a different transaction before it was mined, so it did not take effect.";
const UNDETERMINED_REPLACEMENT_MESSAGE =
  "A different transaction was mined in place of this one, so the Dispute Resolver cannot confirm the action took effect. Check the transaction link; nothing further was sent.";

/**
 * Why the mined transaction is not the awaited call; `null` when it is: the awaited hash itself, or a repricing of it
 * (same call, new hash). A receipt of another hash without replacement details is treated as a replacement.
 */
function replacementFailure(receipt: WriteReceipt, hash: Hex): string | null {
  const { replacement } = receipt;
  if (replacement === undefined) return receipt.transactionHash === hash ? null : UNDETERMINED_REPLACEMENT_MESSAGE;
  if (replacement.reason === "repriced") return null;
  return replacement.reason === "cancelled" ? CANCELLED_MESSAGE : REPLACED_MESSAGE;
}

/**
 * Waits for the receipt through the configured RPC; a revert or a lost receipt is a failure shown with the hash.
 * The receipt is that of the transaction actually mined: a repricing counts as the call under its new hash, and a
 * cancellation or another replacing transaction is a failure, so a withdrawal sequence stops there.
 */
async function confirm(environment: WriteEnvironment, call: WriteCall, hash: Hex, options: WriteOptions): Promise<WriteOutcome> {
  let receipt: WriteReceipt;
  try {
    receipt = await environment.waitForReceipt(call.chainId, hash);
  } catch (error) {
    return { phase: "failed", hash, explorerUrl: explorerUrl(call.chainId, hash), message: `The transaction could not be confirmed: ${errorMessage(error)}` };
  }
  const minedHash = receipt.transactionHash;
  const url = explorerUrl(call.chainId, minedHash);
  const replaced = replacementFailure(receipt, hash);
  if (replaced !== null) return { phase: "failed", hash: minedHash, explorerUrl: url, message: replaced };
  if (receipt.status !== "success") return { phase: "failed", hash: minedHash, explorerUrl: url, message: "The transaction reverted." };
  try {
    await options.onMined?.(receipt);
  } catch {
    // The transaction is mined; a refresh that fails leaves its sections showing their own unavailable state.
  }
  return { phase: "mined", hash: minedHash, explorerUrl: url, receipt };
}

/**
 * The call must target the page chain, whatever the wallet state. The wallet must be on the page chain too, checked
 * from wagmi's state and again on the connector right before signing. A user rejection is not an error. Every status
 * goes to `report`; the final one is also returned. Never throws.
 */
export async function performWrite(environment: WriteEnvironment, build: WriteBuild, options: WriteOptions, report: Report): Promise<WriteOutcome> {
  const settle = (outcome: WriteOutcome): WriteOutcome => {
    report(outcome);
    return outcome;
  };
  if (!build.ok) return settle({ phase: "refused", refusal: build.refusal });
  const { pageChainId } = options;
  if (build.call.chainId !== pageChainId) return settle({ phase: "refused", refusal: "call-chain-mismatch" });
  const { config } = environment;

  const guard = guardOutcome(checkChainMatch(connectedChainId(config), pageChainId), pageChainId);
  if (guard !== null) return settle(guard);

  report({ phase: "pending" });
  let currentChainId: number | undefined;
  try {
    currentChainId = await connectorChainId(config);
  } catch (error) {
    return settle({ phase: "failed", hash: null, explorerUrl: null, message: errorMessage(error) });
  }
  const recheck = guardOutcome(checkChainMatch(currentChainId, pageChainId), pageChainId);
  if (recheck !== null) return settle(recheck);

  const signed = await sign(config, build.call, pageChainId);
  if ("outcome" in signed) return settle(signed.outcome);

  report({ phase: "submitted", hash: signed.hash, explorerUrl: explorerUrl(build.call.chainId, signed.hash) });
  return settle(await confirm(environment, build.call, signed.hash, options));
}
