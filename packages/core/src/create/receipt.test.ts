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
  it("§4.5 step 8: the dispute ID is topics[1] of the arbitrator's DisputeCreation log", () => {
    expect(disputeIdFromReceipt([OTHER_EVENT, creationLog(ARBITRATOR, 1710n)], ARBITRATOR)).toBe(1710n);
  });

  it("§4.5 step 8: the topic is DisputeCreation(uint256,address)", () => {
    expect(creationLog(ARBITRATOR, 1n).topics[0]).toBe(toEventSelector("DisputeCreation(uint256,address)"));
  });

  it("§4.5 step 8: the first matching log wins", () => {
    expect(disputeIdFromReceipt([creationLog(ARBITRATOR, 5n), creationLog(ARBITRATOR, 6n)], ARBITRATOR)).toBe(5n);
  });

  it("§4.5 step 8: the log address is compared case-insensitively, as receipts carry checksummed addresses", () => {
    expect(disputeIdFromReceipt([creationLog("0x988B3A538b618C7A603e1c11Ab82Cd16dbE28069", 9n)], ARBITRATOR)).toBe(9n);
  });

  it("§4.5 step 8: a DisputeCreation log from another contract is not the arbitrator's", () => {
    expect(disputeIdFromReceipt([creationLog(PROXY, 666n), creationLog(ARBITRATOR, 12n)], ARBITRATOR)).toBe(12n);
    expect(disputeIdFromReceipt([creationLog(PROXY, 666n)], ARBITRATOR)).toBeNull();
  });

  it("§4.6 / D-07: no DisputeCreation log gives null, which the UI reports instead of navigating", () => {
    expect(disputeIdFromReceipt([], ARBITRATOR)).toBeNull();
    expect(disputeIdFromReceipt([OTHER_EVENT], ARBITRATOR)).toBeNull();
  });

  it("D-07: a malformed DisputeCreation log gives null rather than a wrong ID", () => {
    const selector = toEventSelector("DisputeCreation(uint256,address)");
    expect(disputeIdFromReceipt([{ address: ARBITRATOR, topics: [selector] }], ARBITRATOR)).toBeNull();
    expect(disputeIdFromReceipt([{ address: ARBITRATOR, topics: [selector, "0x12"] }], ARBITRATOR)).toBeNull();
    expect(disputeIdFromReceipt([{ address: ARBITRATOR, topics: [selector, `0x${"zz".repeat(32)}`] }], ARBITRATOR)).toBeNull();
  });
});
