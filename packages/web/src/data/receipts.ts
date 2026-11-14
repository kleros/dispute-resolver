import { getChain, redactingHttp, resolveReadRpcUrl, type Env, type Hex } from "@dispute-resolver/core";
import {
  BlockNotFoundError,
  createPublicClient,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type PublicClient,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import { noRpcError } from "./sectionData";
import type { ReceiptWaiter, WriteReceipt } from "./types";

const POLL_INTERVAL_MS = 4_000;
/** No receipt this long after the wait began: the transaction may be dropped or out of the search's sight. */
const LATE_AFTER_MS = 10 * 60_000;
const LATE_POLL_INTERVAL_MS = 30_000;
/** The pause between two catch-up steps, so a long gap is read at about BLOCKS_PER_STEP blocks a second. */
const CATCH_UP_PAUSE_MS = 1_000;
const FIRST_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
/** Blocks searched between two looks at the awaited receipt while the search catches up with the chain. */
const BLOCKS_PER_STEP = 16;

type ReceiptClient = Pick<PublicClient, "getBlock" | "getBlockNumber" | "getTransaction" | "getTransactionReceipt">;
type ReplacementReason = NonNullable<WriteReceipt["replacement"]>["reason"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(failures: number): number {
  return Math.min(FIRST_RETRY_DELAY_MS * 2 ** failures, MAX_RETRY_DELAY_MS);
}

/** `null` while the RPC has no such item yet, which is an answer and not a failure. */
async function orNull<T>(read: Promise<T>, notFound: new (...args: never[]) => Error): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof notFound) return null;
    throw error;
  }
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** viem's rule: the same call at another price is a repricing, a zero-value transaction to the sender a cancellation. */
function replacementReason(awaited: Transaction, replacement: Transaction): ReplacementReason {
  const sameRecipient = replacement.to && awaited.to ? sameAddress(replacement.to, awaited.to) : replacement.to === awaited.to;
  if (sameRecipient && replacement.value === awaited.value && replacement.input === awaited.input) return "repriced";
  return replacement.from === replacement.to && replacement.value === 0n ? "cancelled" : "replaced";
}

function toWriteReceipt(receipt: TransactionReceipt, replacement?: ReplacementReason): WriteReceipt {
  return {
    transactionHash: receipt.transactionHash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    logs: receipt.logs.map((log) => ({ address: log.address, topics: [...log.topics] })),
    ...(replacement === undefined ? {} : { replacement: { reason: replacement } }),
  };
}

/** What a wait has learned so far; kept across failed steps, so a failing RPC never makes it search a block twice or skip one. */
interface Search {
  awaited?: Transaction;
  /** The last block searched for a transaction replacing the awaited one. */
  searched?: bigint;
  replacement?: { readonly transaction: Transaction; readonly reason: ReplacementReason };
}

/**
 * What follows a step without a receipt: the next look after the poll interval, the next blocks of a catch-up after a
 * short pause, or, once a replacement is found, its receipt at once.
 */
type Next = "poll" | "catchUp" | "now";

type Step = { readonly receipt: WriteReceipt } | { readonly next: Next };

const POLL: Step = { next: "poll" };

async function searchBlocks(client: ReceiptClient, search: Search, awaited: Transaction, head: bigint, from: bigint): Promise<Step> {
  const last = head < from + BigInt(BLOCKS_PER_STEP) ? head : from + BigInt(BLOCKS_PER_STEP - 1);
  for (let number = from; number <= last; number += 1n) {
    const block = await orNull(client.getBlock({ blockNumber: number, includeTransactions: true }), BlockNotFoundError);
    if (block === null) return POLL;
    const transaction = block.transactions.find((candidate) => sameAddress(candidate.from, awaited.from) && candidate.nonce === awaited.nonce && candidate.hash !== awaited.hash);
    search.searched = number;
    if (transaction !== undefined) {
      search.replacement = { transaction, reason: replacementReason(awaited, transaction) };
      return { next: "now" };
    }
  }
  return last === head ? POLL : { next: "catchUp" };
}

/** The awaited receipt is read too, as a reorg can mine the awaited transaction in place of the replacement. */
async function replacementStep(client: ReceiptClient, hash: Hex, replacement: NonNullable<Search["replacement"]>): Promise<Step> {
  const mined = await orNull(client.getTransactionReceipt({ hash: replacement.transaction.hash }), TransactionReceiptNotFoundError);
  if (mined !== null) return { receipt: toWriteReceipt(mined, replacement.reason) };
  const own = await orNull(client.getTransactionReceipt({ hash }), TransactionReceiptNotFoundError);
  return own === null ? POLL : { receipt: toWriteReceipt(own) };
}

/**
 * One look at the chain: the awaited receipt, then the blocks not searched yet for a transaction of the same sender and
 * nonce, as a wallet's "Speed up" or "Cancel" sends. Blocks are searched one at a time and in order, so none is skipped,
 * at most BLOCKS_PER_STEP per look.
 *
 * Limits: the search starts at the first head the wait reads, so a replacement mined before it is not seen, and it
 * starts only once the read RPC has served the awaited transaction, which a node may never do (a private mempool, a
 * node that drops it once replaced, a hash that is not a transaction). While the transaction is pending, every new
 * block is read with its transactions.
 */
async function step(client: ReceiptClient, hash: Hex, search: Search): Promise<Step> {
  if (search.replacement !== undefined) return replacementStep(client, hash, search.replacement);
  const receipt = await orNull(client.getTransactionReceipt({ hash }), TransactionReceiptNotFoundError);
  if (receipt !== null) return { receipt: toWriteReceipt(receipt) };
  const head = await client.getBlockNumber({ cacheTime: 0 });
  search.searched ??= head - 1n;
  search.awaited ??= (await orNull(client.getTransaction({ hash }), TransactionNotFoundError)) ?? undefined;
  if (search.awaited === undefined || search.searched >= head) return POLL;
  return searchBlocks(client, search, search.awaited, head, search.searched + 1n);
}

/**
 * The pauses between steps and the single call to `onCannotConfirmYet`. A failed step is asked again after a pause
 * that doubles with each failure in a row; a step that searched blocks before it failed first halves the count, so a
 * catch-up through an RPC that refuses some requests settles at a steady pause without stalling or reaching three. The
 * callback comes when that count reaches three, or when no receipt has been found `LATE_AFTER_MS` after the wait began;
 * only the latter slows the polling.
 */
class Pace {
  private failures = 0;
  private reported = false;
  private readonly began = Date.now();
  private readonly onCannotConfirmYet: (() => void) | undefined;

  constructor(onCannotConfirmYet: (() => void) | undefined) {
    this.onCannotConfirmYet = onCannotConfirmYet;
  }

  afterFailure(searchedBlocks: boolean): number {
    if (searchedBlocks) this.failures = Math.ceil(this.failures / 2);
    if (this.failures >= 2 || this.late()) this.report();
    const pause = retryDelay(this.failures);
    this.failures += 1;
    return pause;
  }

  afterLook(next: Next): number {
    this.failures = 0;
    const late = this.late();
    if (late) this.report();
    if (next === "now") return 0;
    if (next === "catchUp") return CATCH_UP_PAUSE_MS;
    return late ? LATE_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
  }

  private late(): boolean {
    return Date.now() - this.began >= LATE_AFTER_MS;
  }

  private report(): void {
    if (this.reported) return;
    this.reported = true;
    try {
      this.onCannotConfirmYet?.();
    } catch {
      // The notice is a courtesy: a listener that throws must not end the wait for a transaction that may still be mined.
    }
  }
}

/** Steps until a receipt is found. */
async function waitPatiently(client: ReceiptClient, hash: Hex, onCannotConfirmYet: (() => void) | undefined): Promise<WriteReceipt> {
  const search: Search = {};
  const pace = new Pace(onCannotConfirmYet);
  for (;;) {
    const searchedBefore = search.searched;
    const next = await step(client, hash, search).catch(() => null);
    if (next === null) {
      await delay(pace.afterFailure(searchedBefore !== undefined && search.searched !== searchedBefore));
    } else if ("receipt" in next) {
      return next.receipt;
    } else {
      const pause = pace.afterLook(next.next);
      if (pause > 0) await delay(pause);
    }
  }
}

/**
 * Receipts are polled through the configured read RPC of the chain, never through wagmi, whose transports AppKit wraps
 * in a fallback to Reown's RPC. The wait has no deadline: it lasts until the transaction, or one that replaced it, is
 * mined, as long as the page is open. A failing RPC is asked again with a growing pause. `onCannotConfirmYet` is called
 * once, when the RPC has failed three looks in a row or no receipt has been found 10 minutes after the wait began. From
 * that 10-minute mark the wait polls every 30 s, which covers a dropped transaction, a hash the read RPC never knows
 * and a replacement the search cannot see. A chain without a configured RPC rejects at once.
 */
export function createReceiptWaiter(env: Env): ReceiptWaiter {
  return async (chainId, hash, onCannotConfirmYet) => {
    const chain = getChain(chainId);
    const resolution = chain === undefined ? undefined : resolveReadRpcUrl(chain, env);
    if (resolution?.status !== "configured") throw new Error(noRpcError(chainId).message);
    // CCIP-Read is off, as for every read.
    const client = createPublicClient({ transport: redactingHttp(resolution.url, { retryCount: 0 }), ccipRead: false });
    return waitPatiently(client, hash, onCannotConfirmYet);
  };
}
