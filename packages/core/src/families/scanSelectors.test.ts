import { describe, expect, it } from "vitest";
import type { Hex } from "../types";
import { scanSelectors } from "./index";

describe("scanSelectors", () => {
  it("collects every PUSH4 operand of the dispatcher", () => {
    expect([...scanSelectors("0x63aabbccdd1463112233441460")]).toEqual(["0xaabbccdd", "0x11223344"]);
  });

  it.each(Array.from({ length: 32 }, (_, index) => index + 1))(
    "skips the %i-byte immediate data of PUSH1 to PUSH32, so a 0x63 byte inside push data is not an opcode (only PUSH4's own operand counts)",
    (dataLength) => {
      const data = `63${"00".repeat(dataLength - 1)}`;
      const pushed: Hex = `0x${(0x5f + dataLength).toString(16)}${data}aabbccdd`;
      const ownOperand = dataLength === 4 ? [`0x${data}`] : [];
      expect([...scanSelectors(pushed)]).toEqual(ownOperand);
      expect([...scanSelectors(`${pushed}63deadbeef`)]).toEqual([...ownOperand, "0xdeadbeef"]);
    },
  );

  it("PUSH0 carries no immediate data", () => {
    expect([...scanSelectors("0x5f63aabbccdd")]).toEqual(["0xaabbccdd"]);
  });

  it("reads a PUSH4 whose operand ends the code, and ignores one cut short", () => {
    expect([...scanSelectors("0x600063aabbccdd")]).toEqual(["0xaabbccdd"]);
    expect(scanSelectors("0x600063aabbcc").size).toBe(0);
  });

  it("empty code has no selectors", () => {
    expect(scanSelectors("0x").size).toBe(0);
  });

  it("selectors are lowercase whatever the input case", () => {
    expect([...scanSelectors("0x63AABBCCDD")]).toEqual(["0xaabbccdd"]);
  });
});
