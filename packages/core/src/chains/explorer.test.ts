import { describe, expect, it } from "vitest";
import type { Address, Hex } from "../types";
import { CHAINS, explorerAddressUrl, explorerTxUrl } from "./index";
import { chainOf } from "../test/chains/testHelpers";

const ADDRESS: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const HASH: Hex = "0x4f3a1b9c2d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8";

describe("explorer links", () => {
  it("links addresses and transactions under the chain's explorer", () => {
    const chain = chainOf(1);
    expect(explorerAddressUrl(chain, ADDRESS)).toBe(`https://etherscan.io/address/${ADDRESS}`);
    expect(explorerTxUrl(chain, HASH)).toBe(`https://etherscan.io/tx/${HASH}`);
  });

  it("every explorer origin is https with no path, query or trailing slash", () => {
    for (const chain of Object.values(CHAINS)) {
      const base = chain.explorerBaseUrl;
      expect(new URL(base).origin, `chain ${String(chain.id)}`).toBe(base);
      expect(base.startsWith("https://")).toBe(true);
    }
  });
});
