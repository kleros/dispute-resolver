import {
  checkChainMatch,
  explorerTxUrl,
  getChain,
  toRegistryAddress,
  type Address,
  type Hex,
  type SimulationResult,
  type WriteBuild,
  type WriteCall,
} from "@dispute-resolver/core";
import { getAccount, writeContract, type Config, type Connector } from "@wagmi/core";
import type { WriteReceipt } from "../data";
import { errorMessage, isChainMismatch, isUserRejection } from "./errors";
import type { NeedsWalletGuard, WriteOptions, WriteOutcome, WriteStatus, WrongChainGuard } from "./types";
import { currentWalletState, toWalletState } from "./useWallet";

/** What one write needs besides the call: wagmi to sign, and the configured read RPC for the check and the receipt. */
export interface WriteEnvironment {
  readonly config: Config;
  waitForReceipt(chainId: number, hash: Hex): Promise<WriteReceipt>;
  simulate(call: WriteCall, from: Address): Promise<SimulationResult>;
}

/** The account the call is checked for and signed from, as wagmi reports it, with its connector. */
interface Signer {
  readonly address: `0x${string}`;
  readonly connector: Connector;
}

type Report = (status: WriteStatus) => void;

/** `null` when the wallet can sign on the page chain; else the refusal to show. */
export function chainGuard(walletChainId: number | undefined, pageChainId: number): NeedsWalletGuard | WrongChainGuard | null {
  const match = checkChainMatch(walletChainId, pageChainId);
  if (match.ok) return null;
  if (match.reason === "no-wallet") return { phase: "needs-wallet", pageChainId };
  return { phase: "wrong-chain", walletChainId: match.walletChainId, pageChainId: match.pageChainId };
}

function connectedChainId(config: Config): number | undefined {
  const wallet = currentWalletState(config);
  return wallet.status === "connected" ? wallet.chainId : undefined;
}

/** The connector's own current chain, read immediately before signing; `undefined` without a connection. */
function connectorChainId(config: Config): Promise<number | undefined> {
  const account = getAccount(config);
  if (toWalletState(account).status !== "connected" || account.connector === undefined) return Promise.resolve(undefined);
  return account.connector.getChainId();
}

function currentSigner(config: Config): Signer | undefined {
  const account = getAccount(config);
  if (toWalletState(account).status !== "connected" || account.address === undefined || account.connector === undefined) return undefined;
  return { address: account.address, connector: account.connector };
}

function sameSigner(current: Signer | undefined, checked: Signer): boolean {
  return current?.connector.uid === checked.connector.uid && current.address.toLowerCase() === checked.address.toLowerCase();
}

/**
 * Checks the call against the contract through the read RPC, as `signer` would send it. A revert or a balance too low
 * stops the write, and so does a wallet that no longer holds that account afterwards; a check that could not be made
 * leaves the decision to the wallet.
 */
async function check(environment: WriteEnvironment, call: WriteCall, signer: Signer): Promise<WriteOutcome | null> {
  const result = await environment.simulate(call, toRegistryAddress(signer.address)).catch(() => null);
  if (result?.status === "reverted") return { phase: "refused-by-contract", reason: result.reason };
  if (result?.status === "insufficient-funds") return { phase: "insufficient-funds" };
  return sameSigner(currentSigner(environment.config), signer) ? null : { phase: "account-changed" };
}

function explorerUrl(chainId: number, hash: Hex): string | null {
  const chain = getChain(chainId);
  return chain === undefined ? null : explorerTxUrl(chain, hash);
}

/**
 * Signs one call from the checked account. A chain change between the guard and the signature is caught by wagmi's
 * `chainId` check, and an account change by its check that the connection still holds `account`. The connector is not
 * passed: wagmi would then compare the connector's fresh chain with itself instead of with the connection's.
 */
async function sign(config: Config, call: WriteCall, pageChainId: number, signer: Signer): Promise<{ readonly hash: Hex } | { readonly outcome: WriteOutcome }> {
  try {
    const hash = await writeContract(config, {
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      value: call.value,
      chainId: call.chainId,
      account: signer.address,
    });
    return { hash };
  } catch (error) {
    if (isUserRejection(error)) return { outcome: { phase: "rejected" } };
    if (isChainMismatch(error)) {
      const walletChainId = await connectorChainId(config).catch(() => undefined);
      const guard = chainGuard(walletChainId, pageChainId);
      if (guard !== null) return { outcome: guard };
    }
    return { outcome: { phase: "failed", hash: null, explorerUrl: null, message: errorMessage(error, call.chainId) } };
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

export async function refreshAfter(options: WriteOptions, receipt: WriteReceipt): Promise<void> {
  try {
    await options.onMined?.(receipt);
  } catch {
    // The transactions are mined; a refresh that fails leaves its sections showing their own unavailable state.
  }
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
    return { phase: "failed", hash, explorerUrl: explorerUrl(call.chainId, hash), message: `The transaction could not be confirmed: ${errorMessage(error, call.chainId)}` };
  }
  const minedHash = receipt.transactionHash;
  const url = explorerUrl(call.chainId, minedHash);
  const replaced = replacementFailure(receipt, hash);
  if (replaced !== null) return { phase: "failed", hash: minedHash, explorerUrl: url, message: replaced };
  if (receipt.status !== "success") return { phase: "failed", hash: minedHash, explorerUrl: url, message: "The transaction reverted." };
  await refreshAfter(options, receipt);
  return { phase: "mined", hash: minedHash, explorerUrl: url, receipt };
}

/**
 * The call must target the page chain, whatever the wallet state. The wallet must be on the page chain too, checked
 * from wagmi's state and again on the connector right before signing. Between the two, the call is checked against the
 * contract from the connected account, and nothing reaches the wallet once the check stops it. A user rejection is not
 * an error. Every status goes to `report`; the final one is also returned. Never throws.
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

  const guard = chainGuard(connectedChainId(config), pageChainId);
  if (guard !== null) return settle(guard);
  const signer = currentSigner(config);
  if (signer === undefined) return settle({ phase: "needs-wallet", pageChainId });

  report({ phase: "checking" });
  const stopped = await check(environment, build.call, signer);
  if (stopped !== null) return settle(stopped);

  report({ phase: "pending" });
  let currentChainId: number | undefined;
  try {
    currentChainId = await connectorChainId(config);
  } catch (error) {
    return settle({ phase: "failed", hash: null, explorerUrl: null, message: errorMessage(error) });
  }
  const recheck = chainGuard(currentChainId, pageChainId);
  if (recheck !== null) return settle(recheck);

  const signed = await sign(config, build.call, pageChainId, signer);
  if ("outcome" in signed) return settle(signed.outcome);

  report({ phase: "submitted", hash: signed.hash, explorerUrl: explorerUrl(build.call.chainId, signed.hash) });
  return settle(await confirm(environment, build.call, signed.hash, options));
}
