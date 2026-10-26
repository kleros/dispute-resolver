import { describe, expect, it } from "vitest";
import { REGISTRY, isDisplayAllowlisted } from "../registry";
import { addr } from "../test/registry/testHelpers";
import { displayChainId } from "./index";
import type { ChainIdField } from "./types";

const POH_V2_MAINNET = addr("0xbE9834097A4E97689d9B667441acafb456D0480A");

describe("displayChainId", () => {
  it("an absent chain ID is the arbitrator chain", () => {
    expect(displayChainId({ status: "absent" }, 1)).toBe(1);
    expect(displayChainId({ status: "absent" }, 100)).toBe(100);
  });

  it("a chain ID naming a configured chain is that chain", () => {
    expect(displayChainId({ status: "valid", chainId: 100 }, 1)).toBe(100);
    expect(displayChainId({ status: "valid", chainId: 137 }, 1)).toBe(137);
  });

  it("a chain ID the chain table lacks keeps its own number instead of the arbitrator chain", () => {
    expect(displayChainId({ status: "unsupported", chainId: 10 }, 1)).toBe(10);
    expect(displayChainId({ status: "unsupported", chainId: 690 }, 100)).toBe(690);
  });

  it("a chain ID that is not a positive integer falls back to the arbitrator chain", () => {
    expect(displayChainId({ status: "invalid" }, 100)).toBe(100);
  });

  it("as the display allowlist key, a chain the table lacks never selects the arbitrator chain's list", () => {
    const keyed = (field: ChainIdField, arbitrator: number): boolean => isDisplayAllowlisted(REGISTRY, displayChainId(field, arbitrator), POH_V2_MAINNET);
    expect(keyed({ status: "absent" }, 1)).toBe(true);
    expect(keyed({ status: "valid", chainId: 1 }, 100)).toBe(true);
    expect(keyed({ status: "invalid" }, 1)).toBe(true);
    expect(keyed({ status: "unsupported", chainId: 10 }, 1)).toBe(false);
    expect(keyed({ status: "unsupported", chainId: 690 }, 1)).toBe(false);
  });
});
