import { describe, expect, it } from "vitest";
import { SELECTORS } from "../abi";
import type { Hex } from "../types";
import { recorded } from "./__fixtures__/recorded";
import { scanSelectors } from "./index";

describe("scanSelectors", () => {
  it("06 §1: collects every PUSH4 operand of the dispatcher", () => {
    expect([...scanSelectors("0x63aabbccdd1463112233441460")]).toEqual(["0xaabbccdd", "0x11223344"]);
  });

  it.each(Array.from({ length: 32 }, (_, index) => index + 1))(
    "F2 06 §1: skips the %i-byte immediate data of PUSH1 to PUSH32, so a 0x63 byte inside push data is not an opcode (only PUSH4's own operand counts)",
    (dataLength) => {
      const data = `63${"00".repeat(dataLength - 1)}`;
      const pushed: Hex = `0x${(0x5f + dataLength).toString(16)}${data}aabbccdd`;
      const ownOperand = dataLength === 4 ? [`0x${data}`] : [];
      expect([...scanSelectors(pushed)]).toEqual(ownOperand);
      expect([...scanSelectors(`${pushed}63deadbeef`)]).toEqual([...ownOperand, "0xdeadbeef"]);
    },
  );

  it("06 §1: PUSH0 carries no immediate data", () => {
    expect([...scanSelectors("0x5f63aabbccdd")]).toEqual(["0xaabbccdd"]);
  });

  it("06 §1: reads a PUSH4 whose operand ends the code, and ignores one cut short", () => {
    expect([...scanSelectors("0x600063aabbccdd")]).toEqual(["0xaabbccdd"]);
    expect(scanSelectors("0x600063aabbcc").size).toBe(0);
  });

  it("06 §1: empty code has no selectors", () => {
    expect(scanSelectors("0x").size).toBe(0);
  });

  it("06 §1: selectors are lowercase whatever the input case", () => {
    expect([...scanSelectors("0x63AABBCCDD")]).toEqual(["0xaabbccdd"]);
  });

  it("C11: reads the probe selectors from a recorded dispatcher (current mainnet ArbitrableProxy)", () => {
    const selectors = scanSelectors(recorded(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf").code);
    expect(selectors.has(SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256)"])).toBe(true);
    expect(selectors.has(SELECTORS["externalIDtoLocalID(uint256)"])).toBe(true);
    expect(selectors.has(SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256[])"])).toBe(false);
  });
});
