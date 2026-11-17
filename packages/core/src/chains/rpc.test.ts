import { describe, expect, it } from "vitest";
import { CHAINS, readRpcUrl, resolveReadRpcUrl } from "./index";
import { ascending, chainOf } from "../test/chains/testHelpers";
import type { ChainConfig } from "./types";

const mainnet = chainOf(1);
const zkSyncSepolia = chainOf(300);
const zkSyncMainnet = chainOf(324);

/** A chain with neither an env name nor a literal URL, which no table entry is. */
const bare: ChainConfig = { id: 999, name: "Bare", currency: "ETH", maxLookback: 1, explorerBaseUrl: "https://explorer.example" };

describe("resolveReadRpcUrl", () => {
  it("reads the URL from the chain's env variable", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it("trims the configured value", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "  https://rpc.example/mainnet \n" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it.each([
    ["an unset variable", {}],
    ["a variable set to undefined", { REACT_APP_WEB3_PROVIDER_URL: undefined }],
    ["an empty variable", { REACT_APP_WEB3_PROVIDER_URL: "" }],
    ["a whitespace-only variable", { REACT_APP_WEB3_PROVIDER_URL: "   \t" }],
    ["only another chain's variable", { REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://rpc.example/gnosis" }],
    ["an env value that is not a string", { REACT_APP_WEB3_PROVIDER_URL: 42 } as unknown as Record<string, string>],
    ["a variable inherited from the env object's prototype", Object.create({ REACT_APP_WEB3_PROVIDER_URL: "https://inherited.example" }) as Record<string, string>],
  ])("treats %s as unconfigured, with no wallet fallback", (_name, env) => {
    expect(resolveReadRpcUrl(mainnet, env)).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("resolves zkSync Sepolia and zkSync Era to their literal URLs with an empty env", () => {
    expect(resolveReadRpcUrl(zkSyncSepolia, {})).toEqual({ status: "configured", url: "https://sepolia.era.zksync.dev/" });
    expect(resolveReadRpcUrl(zkSyncMainnet, {})).toEqual({ status: "configured", url: "https://mainnet.era.zksync.io" });
  });

  it("falls back to the literal URL when the chain's variable is blank, and prefers a set variable", () => {
    const withBoth: ChainConfig = { ...zkSyncMainnet, readRpcEnv: "REACT_APP_ZK" };
    expect(resolveReadRpcUrl(withBoth, { REACT_APP_ZK: " " })).toEqual({ status: "configured", url: "https://mainnet.era.zksync.io" });
    expect(resolveReadRpcUrl(withBoth, { REACT_APP_ZK: "https://override.example" })).toEqual({ status: "configured", url: "https://override.example" });
  });

  it("never throws for any chain, and reports a chain with no source as unconfigured", () => {
    for (const chain of [...Object.values(CHAINS), bare]) {
      expect(() => resolveReadRpcUrl(chain, {})).not.toThrow();
    }
    expect(resolveReadRpcUrl(bare, {})).toEqual({ status: "unconfigured", chainId: 999 });
  });

  it("leaves every chain unconfigured on an empty env except 300 and 324", () => {
    const configured = Object.values(CHAINS)
      .filter((chain) => resolveReadRpcUrl(chain, {}).status === "configured")
      .map((chain) => chain.id);
    expect(ascending(configured)).toEqual([300, 324]);
  });
});

describe("readRpcUrl", () => {
  it("is the chain's configured read RPC", () => {
    expect(readRpcUrl(1, { REACT_APP_WEB3_PROVIDER_URL: " https://rpc.example/mainnet " })).toBe("https://rpc.example/mainnet");
    expect(readRpcUrl(324, {})).toBe("https://mainnet.era.zksync.io");
  });

  it("is null for an unconfigured chain", () => {
    expect(readRpcUrl(1, {})).toBeNull();
    expect(readRpcUrl(1, { REACT_APP_WEB3_PROVIDER_URL: "  " })).toBeNull();
  });

  it("is null for a chain the app does not support", () => {
    expect(readRpcUrl(10, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet" })).toBeNull();
  });
});
