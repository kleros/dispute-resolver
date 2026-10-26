import type { Hex, WriteBuild } from "@dispute-resolver/core";
import { parseAbi } from "viem";
import type { WriteReceipt } from "../../data";
import type { WriteStatus } from "../../wallet";

const FUND_APPEAL_ABI = parseAbi(["function fundAppeal(uint256 localId, uint256 ruling) payable"]);

/** A transaction hash for write tests. */
export const TEST_TX_HASH: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";

/** A built `fundAppeal` call on `chainId` (core's builders produce the same shape). */
export function testWriteBuild(chainId = 1, ruling = 1n): WriteBuild {
  return {
    ok: true,
    call: {
      kind: "fund-appeal",
      chainId,
      address: "0x00000000000000000000000000000000000000aa",
      abi: FUND_APPEAL_ABI,
      functionName: "fundAppeal",
      args: [7n, ruling],
      value: 1_000n,
    },
  };
}

/** A mined receipt of `hash`. */
export function testReceipt(hash: Hex = TEST_TX_HASH, status: WriteReceipt["status"] = "success"): WriteReceipt {
  return { transactionHash: hash, status, blockNumber: 100n, logs: [] };
}

export const TEST_MINED: WriteStatus = { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: testReceipt() };

/** A write that is signed, submitted and mined. */
export const TEST_SENT: readonly WriteStatus[] = [{ phase: "pending" }, { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null }, TEST_MINED];

/** The hash of the transaction that replaces `TEST_TX_HASH` in replacement tests. */
export const TEST_REPLACEMENT_TX_HASH: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";

/**
 * The receipt the receipt waiter returns when the awaited transaction was replaced by `hash`: viem's replacement
 * detection resolves with the replacement's receipt. Without `reason` it carries no replacement details.
 */
export function testReplacementReceipt(
  reason?: NonNullable<WriteReceipt["replacement"]>["reason"],
  hash: Hex = TEST_REPLACEMENT_TX_HASH,
  status: WriteReceipt["status"] = "success",
): WriteReceipt {
  const receipt = testReceipt(hash, status);
  return reason === undefined ? receipt : { ...receipt, replacement: { reason } };
}
