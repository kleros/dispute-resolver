import { describe, expect, it } from "vitest";
import { checkChainMatch } from "./index";

describe("checkChainMatch", () => {
  it("without a wallet chain the write is refused as no-wallet", () => {
    expect(checkChainMatch(undefined, 1)).toEqual({ ok: false, reason: "no-wallet" });
  });

  it("a wallet on another chain is refused with both chains, so the switch can be offered", () => {
    expect(checkChainMatch(100, 1)).toEqual({ ok: false, reason: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(checkChainMatch(1, 11155111)).toEqual({ ok: false, reason: "wrong-chain", walletChainId: 1, pageChainId: 11155111 });
  });

  it("a wallet on the page chain may sign, on the page chain", () => {
    expect(checkChainMatch(100, 100)).toEqual({ ok: true, chainId: 100 });
  });

  it("a wallet chain that is not a valid chain ID never matches", () => {
    expect(checkChainMatch(Number.NaN, 1)).toEqual({ ok: false, reason: "wrong-chain", walletChainId: Number.NaN, pageChainId: 1 });
    expect(checkChainMatch(1.5, 1)).toMatchObject({ ok: false, reason: "wrong-chain" });
  });
});
