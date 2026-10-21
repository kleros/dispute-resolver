import { describe, expect, it } from "vitest";
import type { Address, Hex } from "../types";
import { CHAINS, explorerAddressUrl, explorerTxUrl } from "./index";
import { ascending, chainOf } from "../test/chains/testHelpers";
import type { ChainConfig } from "./types";

const ADDRESS: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const HASH: Hex = "0x4f3a1b9c2d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8";

const EXPLORERS: Readonly<Record<number, string>> = {
  1: "https://etherscan.io",
  100: "https://gnosisscan.io",
  10200: "https://gnosis-chiado.blockscout.com",
  11155111: "https://sepolia.etherscan.io",
  130: "https://uniscan.xyz",
  1301: "https://sepolia.uniscan.xyz",
  137: "https://polygonscan.com",
  300: "https://sepolia.explorer.zksync.io",
  324: "https://explorer.zksync.io",
  42161: "https://arbiscan.io",
  421614: "https://sepolia.arbiscan.io",
  11155420: "https://optimism-sepolia.blockscout.com",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
};

describe("explorer links", () => {
  it("MC-1: Gnosis (100) links addresses and transactions to gnosisscan.io", () => {
    const gnosis = chainOf(100);
    expect(gnosis.explorerBaseUrl).toBe("https://gnosisscan.io");
    expect(explorerAddressUrl(gnosis, ADDRESS)).toBe(`https://gnosisscan.io/address/${ADDRESS}`);
    expect(explorerTxUrl(gnosis, HASH)).toBe(`https://gnosisscan.io/tx/${HASH}`);
  });

  it("MC-1: Gnosis Chiado (10200) links addresses and transactions to gnosis-chiado.blockscout.com", () => {
    const chiado = chainOf(10200);
    expect(chiado.explorerBaseUrl).toBe("https://gnosis-chiado.blockscout.com");
    expect(explorerAddressUrl(chiado, ADDRESS)).toBe(`https://gnosis-chiado.blockscout.com/address/${ADDRESS}`);
    expect(explorerTxUrl(chiado, HASH)).toBe(`https://gnosis-chiado.blockscout.com/tx/${HASH}`);
  });

  it.each(Object.entries(EXPLORERS))("D-40: chain %s links addresses and transactions to %s", (id, base) => {
    const chain = chainOf(Number(id));
    expect(chain.explorerBaseUrl).toBe(base);
    expect(explorerAddressUrl(chain, ADDRESS)).toBe(`${base}/address/${ADDRESS}`);
    expect(explorerTxUrl(chain, HASH)).toBe(`${base}/tx/${HASH}`);
  });

  it("D-40: every configured chain has an explorer", () => {
    expect(ascending(Object.keys(EXPLORERS).map(Number))).toEqual(ascending(Object.keys(CHAINS).map(Number)));
    for (const chain of Object.values(CHAINS)) {
      expect(explorerAddressUrl(chain, ADDRESS), `chain ${String(chain.id)}`).not.toBeNull();
    }
  });

  it("D-40: every explorer origin is https with no path, query or trailing slash", () => {
    for (const chain of Object.values(CHAINS)) {
      const base = chain.explorerBaseUrl;
      expect(base).toBeDefined();
      expect(new URL(base ?? "").origin, `chain ${String(chain.id)}`).toBe(base);
      expect(base?.startsWith("https://")).toBe(true);
    }
  });

  it("D-40: a chain without an explorer yields null", () => {
    const bare: ChainConfig = { id: 999, name: "Bare", currency: "ETH", isTestnet: true, maxLookback: 1 };
    expect(explorerAddressUrl(bare, ADDRESS)).toBeNull();
    expect(explorerTxUrl(bare, HASH)).toBeNull();
  });
});
