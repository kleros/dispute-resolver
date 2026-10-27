import { describe, expect, it } from "vitest";
import { REGISTRY, isDisplayAllowlisted, toRegistryAddress } from "../registry";
import { displayChainId } from "./index";
import type { ChainIdField } from "./types";

const POH_V2_MAINNET = toRegistryAddress("0xbE9834097A4E97689d9B667441acafb456D0480A");

describe("displayChainId", () => {
  it.each<[string, ChainIdField, number, number]>([
    ["an absent chain ID is the arbitrator chain", { status: "absent" }, 1, 1],
    ["an absent chain ID is the arbitrator chain, on Gnosis too", { status: "absent" }, 100, 100],
    ["a chain ID naming a configured chain is that chain", { status: "valid", chainId: 100 }, 1, 100],
    ["a chain ID naming another configured chain is that chain", { status: "valid", chainId: 137 }, 1, 137],
    ["a chain ID the chain table lacks keeps its own number instead of the arbitrator chain", { status: "unsupported", chainId: 10 }, 1, 10],
    ["a chain ID the chain table lacks keeps its own number on Gnosis too", { status: "unsupported", chainId: 690 }, 100, 690],
    ["a chain ID that is not a positive integer falls back to the arbitrator chain", { status: "invalid" }, 100, 100],
  ])("%s", (_, field, arbitrator, expected) => {
    expect(displayChainId(field, arbitrator)).toBe(expected);
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
