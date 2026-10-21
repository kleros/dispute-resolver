import { describe, expect, it } from "vitest";
import { paths, replaceChainSegment, switchChainSegment } from "./paths";

describe("paths (A19)", () => {
  it("A19: builds every internal target from a validated chain ID and a numeric dispute ID", () => {
    expect(paths.chainRoot(1)).toBe("/1");
    expect(paths.ongoing(100)).toBe("/100/ongoing");
    expect(paths.create(11155111)).toBe("/11155111/create");
    expect(paths.cases(137)).toBe("/137/cases");
    expect(paths.case(1, 5n)).toBe("/1/cases/5");
    expect(paths.case(1, 2n ** 256n - 1n)).toBe(`/1/cases/${(2n ** 256n - 1n).toString()}`);
  });

  it("A19: header links are written without a trailing slash", () => {
    for (const path of [paths.chainRoot(1), paths.ongoing(1), paths.create(1), paths.cases(1), paths.case(1, 0n)]) {
      expect(path.endsWith("/")).toBe(false);
    }
  });

  it("A19: rejects a chain that is not configured", () => {
    expect(() => paths.ongoing(10)).toThrow(RangeError);
    expect(() => paths.chainRoot(0)).toThrow(RangeError);
    expect(() => paths.cases(Number.NaN)).toThrow(RangeError);
  });

  it("A19: rejects non-numeric and out-of-range dispute IDs", () => {
    const hostile: readonly unknown[] = ["5", "5/../../evil", "//evil.example", 5, -1n, 2n ** 256n, null];
    for (const disputeId of hostile) {
      // The builder's type only admits bigint; the cast stands for any caller that bypasses it.
      expect(() => paths.case(1, disputeId as bigint)).toThrow(RangeError);
    }
  });
});

describe("replaceChainSegment (spec §1.3)", () => {
  it("replaces an all-digit first segment and keeps the rest of the path", () => {
    expect(replaceChainSegment("/1/cases/5", 100)).toBe("/100/cases/5");
    expect(replaceChainSegment("/1/ongoing/", 137)).toBe("/137/ongoing/");
    expect(replaceChainSegment("/10/create", 1)).toBe("/1/create");
    expect(replaceChainSegment("/1", 100)).toBe("/100");
  });

  it("inserts the chain when the first segment is not all digits", () => {
    expect(replaceChainSegment("/ongoing", 1)).toBe("/1/ongoing");
    expect(replaceChainSegment("/index.html", 100)).toBe("/100/index.html");
    expect(replaceChainSegment("/1x/cases", 100)).toBe("/100/1x/cases");
    expect(replaceChainSegment("/", 1)).toBe("/1/");
  });

  it("accepts a wallet chain that is not configured, which then shows the unsupported-network screen", () => {
    expect(replaceChainSegment("/1/cases/5", 10)).toBe("/10/cases/5");
  });

  it("refuses a chain ID that is not a positive safe integer", () => {
    expect(() => replaceChainSegment("/1/ongoing", 0)).toThrow(RangeError);
    expect(() => replaceChainSegment("/1/ongoing", 1.5)).toThrow(RangeError);
    expect(() => replaceChainSegment("/1/ongoing", Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("never produces a protocol-relative target", () => {
    expect(replaceChainSegment("//evil.example/x", 1)).toBe("/1//evil.example/x");
    expect(replaceChainSegment("//evil.example/x", 1).startsWith("//")).toBe(false);
  });
});

describe("switchChainSegment", () => {
  it("the switcher replaces whatever first segment the URL has, digits or not", () => {
    expect(switchChainSegment("/abc/ongoing", 1)).toBe("/1/ongoing");
    expect(switchChainSegment("/1/cases/55", 100)).toBe("/100/cases/55");
    expect(switchChainSegment("/999/ongoing", 1)).toBe("/1/ongoing");
    expect(switchChainSegment("/", 1)).toBe("/1");
  });

  it("the switcher only moves to a configured chain and never to a protocol-relative target", () => {
    expect(() => switchChainSegment("/1/ongoing", 10)).toThrow(RangeError);
    expect(switchChainSegment("//evil.example/x", 1)).toBe("/1/evil.example/x");
  });
});
