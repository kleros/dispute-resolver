import { encodeEventTopics, numberToHex, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import { getChain } from "../chains";
import type { Address, Hex } from "../types";
import { disputeIdFromReceipt } from "./index";

const ARBITRATOR: Address = getChain(1)?.klerosLiquid ?? "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const PROXY = "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38";

function creationLog(address: string, disputeId: bigint): { readonly address: string; readonly topics: readonly Hex[] } {
  const topics = encodeEventTopics({ abi: klerosLiquidAbi, eventName: "DisputeCreation", args: { _disputeID: disputeId, _arbitrable: PROXY } });
  return { address, topics: topics as Hex[] };
}

const OTHER_EVENT = { address: PROXY, topics: [toEventSelector("MetaEvidence(uint256,string)"), numberToHex(7n, { size: 32 })] as const };

describe("disputeIdFromReceipt", () => {
  it("reads the dispute ID from topics[1] of the arbitrator's DisputeCreation log", () => {
    expect(disputeIdFromReceipt([OTHER_EVENT, creationLog(ARBITRATOR, 1710n)], ARBITRATOR)).toBe(1710n);
  });

  it("takes the first matching log", () => {
    expect(disputeIdFromReceipt([creationLog(ARBITRATOR, 5n), creationLog(ARBITRATOR, 6n)], ARBITRATOR)).toBe(5n);
  });

  it("compares the log address case-insensitively, as receipts carry checksummed addresses", () => {
    expect(disputeIdFromReceipt([creationLog("0x988B3A538b618C7A603e1c11Ab82Cd16dbE28069", 9n)], ARBITRATOR)).toBe(9n);
  });

  it("ignores a DisputeCreation log from another contract", () => {
    expect(disputeIdFromReceipt([creationLog(PROXY, 666n), creationLog(ARBITRATOR, 12n)], ARBITRATOR)).toBe(12n);
    expect(disputeIdFromReceipt([creationLog(PROXY, 666n)], ARBITRATOR)).toBeNull();
  });

  it("skips the arbitrator's logs that are not DisputeCreation", () => {
    expect(disputeIdFromReceipt([{ address: ARBITRATOR, topics: [] }, { ...OTHER_EVENT, address: ARBITRATOR }, creationLog(ARBITRATOR, 12n)], ARBITRATOR)).toBe(12n);
  });

  it("gives null when there is no DisputeCreation log", () => {
    expect(disputeIdFromReceipt([], ARBITRATOR)).toBeNull();
    expect(disputeIdFromReceipt([OTHER_EVENT], ARBITRATOR)).toBeNull();
  });

  it("gives null rather than a wrong ID for a malformed DisputeCreation log", () => {
    const selector = toEventSelector("DisputeCreation(uint256,address)");
    expect(disputeIdFromReceipt([{ address: ARBITRATOR, topics: [selector] }], ARBITRATOR)).toBeNull();
    expect(disputeIdFromReceipt([{ address: ARBITRATOR, topics: [selector, "0x12"] }], ARBITRATOR)).toBeNull();
    expect(disputeIdFromReceipt([{ address: ARBITRATOR, topics: [selector, `0x${"zz".repeat(32)}`] }], ARBITRATOR)).toBeNull();
  });
});
