import { describe, expect, it } from "vitest";
import { pathDisputeId, paths, replaceChainSegment, switchChainSegment, walletChainLocation } from "./paths";

describe("paths", () => {
  it("builds every internal target from a validated chain ID and a numeric dispute ID", () => {
    expect(paths.chainRoot(1)).toBe("/1");
    expect(paths.ongoing(100)).toBe("/100/ongoing");
    expect(paths.create(11155111)).toBe("/11155111/create");
    expect(paths.cases(137)).toBe("/137/cases");
    expect(paths.case(1, 5n)).toBe("/1/cases/5");
    expect(paths.case(1, 2n ** 256n - 1n)).toBe(`/1/cases/${(2n ** 256n - 1n).toString()}`);
  });

  it("targets are written without a trailing slash", () => {
    for (const path of [paths.chainRoot(1), paths.ongoing(1), paths.create(1), paths.cases(1), paths.case(1, 0n)]) {
      expect(path.endsWith("/")).toBe(false);
    }
  });

  it("rejects a chain that is not configured", () => {
    expect(() => paths.ongoing(10)).toThrow(RangeError);
    expect(() => paths.chainRoot(0)).toThrow(RangeError);
    expect(() => paths.cases(Number.NaN)).toThrow(RangeError);
  });

  it("rejects non-numeric and out-of-range dispute IDs", () => {
    const hostile: readonly unknown[] = ["5", "5/../../evil", "//evil.example", 5, -1n, 2n ** 256n, null];
    for (const disputeId of hostile) {
      // The builder's type only admits bigint; the cast stands for any caller that bypasses it.
      expect(() => paths.case(1, disputeId as bigint)).toThrow(RangeError);
    }
  });
});

describe("replaceChainSegment", () => {
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

describe("walletChainLocation", () => {
  it("a list or form path keeps its rest, search and hash on the wallet chain", () => {
    expect(walletChainLocation({ pathname: "/1/ongoing", search: "?period=4", hash: "#list" }, 100)).toEqual({ pathname: "/100/ongoing", search: "?period=4", hash: "#list" });
    expect(walletChainLocation({ pathname: "/100/create", search: "", hash: "" }, 1)).toEqual({ pathname: "/1/create", search: "", hash: "" });
    expect(walletChainLocation({ pathname: "/1/nowhere/else", search: "?x=1", hash: "" }, 100)).toEqual({ pathname: "/100/nowhere/else", search: "?x=1", hash: "" });
  });

  it("a case path with an ID goes to the wallet chain's Ongoing Disputes without search or hash", () => {
    expect(walletChainLocation({ pathname: "/1/cases/1621", search: "?ref=share", hash: "#evidence" }, 100)).toEqual({ pathname: "/100/ongoing", search: "", hash: "" });
    expect(walletChainLocation({ pathname: "/1/cases/not-a-number", search: "", hash: "" }, 100)).toEqual({ pathname: "/100/ongoing", search: "", hash: "" });
  });

  it("the case lookup without an ID keeps its path on the wallet chain", () => {
    expect(walletChainLocation({ pathname: "/1/cases", search: "?q=5", hash: "" }, 100)).toEqual({ pathname: "/100/cases", search: "?q=5", hash: "" });
    expect(walletChainLocation({ pathname: "/1/cases/", search: "", hash: "" }, 100)).toEqual({ pathname: "/100/cases/", search: "", hash: "" });
  });

  it("an interact path with an ID counts as a case", () => {
    expect(walletChainLocation({ pathname: "/1/interact/5/evidence", search: "?x=1", hash: "" }, 100)).toEqual({ pathname: "/100/ongoing", search: "", hash: "" });
  });

  it("a case path counts as a case however the router would still open it: other letter case or percent-encoded segments", () => {
    for (const pathname of ["/1/CASES/5", "/1/%63ases/5", "/%31/cases/5", "/1/cases/%35", "/1/Interact/5/evidence"]) {
      expect(walletChainLocation({ pathname, search: "?ref=share", hash: "#e" }, 100)).toEqual({ pathname: "/100/ongoing", search: "", hash: "" });
    }
  });

  it("a path the case route does not match keeps its path, as the router shows no dispute there", () => {
    expect(walletChainLocation({ pathname: "/1/cases/5/extra", search: "", hash: "" }, 100)).toEqual({ pathname: "/100/cases/5/extra", search: "", hash: "" });
    expect(walletChainLocation({ pathname: "/1/casesx/5", search: "", hash: "" }, 100)).toEqual({ pathname: "/100/casesx/5", search: "", hash: "" });
  });

  it("a page whose chain segment names no configured chain keeps its path", () => {
    expect(walletChainLocation({ pathname: "/abc/cases/5", search: "?ref=share", hash: "#e" }, 100)).toEqual({ pathname: "/100/cases/5", search: "?ref=share", hash: "#e" });
    expect(walletChainLocation({ pathname: "/10/ongoing", search: "", hash: "" }, 1)).toEqual({ pathname: "/1/ongoing", search: "", hash: "" });
  });

  it("an unconfigured wallet chain gets a path to the unsupported-network screen without throwing", () => {
    expect(walletChainLocation({ pathname: "/1/ongoing", search: "?period=4", hash: "" }, 10)).toEqual({ pathname: "/10/ongoing", search: "?period=4", hash: "" });
    expect(walletChainLocation({ pathname: "/1/cases/1621", search: "", hash: "" }, 10)).toEqual({ pathname: "/10/ongoing", search: "", hash: "" });
  });

  it("never produces a protocol-relative target", () => {
    expect(walletChainLocation({ pathname: "//evil.example/x", search: "", hash: "" }, 1).pathname.startsWith("//")).toBe(false);
  });
});

describe("pathDisputeId", () => {
  it("reads the dispute ID of a case or interact path and nothing else", () => {
    expect(pathDisputeId("/1/cases/1621")).toBe(1621n);
    expect(pathDisputeId("/1/interact/5/evidence")).toBe(5n);
    expect(pathDisputeId("/1/cases")).toBeNull();
    expect(pathDisputeId("/1/cases/not-a-number")).toBeNull();
    expect(pathDisputeId("/1/ongoing")).toBeNull();
  });

  it("reads the ID as the router does, whatever the letter case or percent-encoding of the path", () => {
    expect(pathDisputeId("/1/CASES/1621")).toBe(1621n);
    expect(pathDisputeId("/1/%63ases/1621")).toBe(1621n);
    expect(pathDisputeId("/1/cases/%31621")).toBe(1621n);
    expect(pathDisputeId("/1/INTERACT/5/evidence")).toBe(5n);
  });
});
