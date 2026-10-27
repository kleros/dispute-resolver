import { describe, expect, it } from "vitest";
import type { Address, Hex } from "../types";
import { CHAINS, explorerAddressUrl, explorerTxUrl } from "./index";
import { ascending, chainOf } from "../test/chains/testHelpers";

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
  it.each(Object.entries(EXPLORERS))("chain %s links addresses and transactions to %s", (id, base) => {
    const chain = chainOf(Number(id));
    expect(chain.explorerBaseUrl).toBe(base);
    expect(explorerAddressUrl(chain, ADDRESS)).toBe(`${base}/address/${ADDRESS}`);
    expect(explorerTxUrl(chain, HASH)).toBe(`${base}/tx/${HASH}`);
  });

  it("every configured chain has an explorer", () => {
    expect(ascending(Object.keys(EXPLORERS).map(Number))).toEqual(ascending(Object.keys(CHAINS).map(Number)));
  });

  it("every explorer origin is https with no path, query or trailing slash", () => {
    for (const chain of Object.values(CHAINS)) {
      const base = chain.explorerBaseUrl;
      expect(new URL(base).origin, `chain ${String(chain.id)}`).toBe(base);
      expect(base.startsWith("https://")).toBe(true);
    }
  });
});
