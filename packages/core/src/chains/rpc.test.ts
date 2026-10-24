import { describe, expect, it } from "vitest";
import { CHAINS, resolvePublicRpcUrl, resolveReadRpcUrl } from "./index";
import { ascending, chainOf } from "../test/chains/testHelpers";
import type { ChainConfig } from "./types";

const mainnet = chainOf(1);
const zkSyncSepolia = chainOf(300);
const zkSyncMainnet = chainOf(324);

/** A chain with neither an env name nor a literal URL, which no table entry is. */
const bare: ChainConfig = { id: 999, name: "Bare", currency: "ETH", isTestnet: true, maxLookback: 1 };

describe("resolveReadRpcUrl", () => {
  it("reads the URL from the chain's env variable", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it("trims the configured value", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "  https://rpc.example/mainnet \n" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it("treats an unset variable as unconfigured, with no wallet or public fallback", () => {
    expect(resolveReadRpcUrl(mainnet, {})).toEqual({ status: "unconfigured", chainId: 1 });
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: undefined })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("treats an empty or whitespace-only variable as unconfigured", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "" })).toEqual({ status: "unconfigured", chainId: 1 });
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "   \t" })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("never lets the public RPC setting stand in for a missing read RPC", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_1: "https://public.example" })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("ignores another chain's variable", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://rpc.example/gnosis" })).toEqual({ status: "unconfigured", chainId: 1 });
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

  it("ignores an env value that is not a string", () => {
    const env = { REACT_APP_WEB3_PROVIDER_URL: 42 } as unknown as Record<string, string>;
    expect(resolveReadRpcUrl(mainnet, env)).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("ignores variables inherited from the env object's prototype", () => {
    const env = Object.create({ REACT_APP_WEB3_PROVIDER_URL: "https://inherited.example" }) as Record<string, string>;
    expect(resolveReadRpcUrl(mainnet, env)).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("leaves every chain unconfigured on an empty env except 300 and 324", () => {
    const configured = Object.values(CHAINS)
      .filter((chain) => resolveReadRpcUrl(chain, {}).status === "configured")
      .map((chain) => chain.id);
    expect(ascending(configured)).toEqual([300, 324]);
  });
});

describe("resolvePublicRpcUrl", () => {
  it("defaults to the read RPC when no public setting is set", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it("prefers the public setting over the read RPC", () => {
    const env = { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet?key=secret", REACT_APP_PUBLIC_RPC_1: "https://public.example/mainnet" };
    expect(resolvePublicRpcUrl(mainnet, env)).toEqual({ status: "configured", url: "https://public.example/mainnet" });
  });

  it("trims the public setting, and falls back to the read RPC", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_1: " https://public.example " })).toEqual({ status: "configured", url: "https://public.example" });
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet", REACT_APP_PUBLIC_RPC_1: "  " })).toEqual({
      status: "configured",
      url: "https://rpc.example/mainnet",
    });
  });

  it("uses the public setting on a chain whose read RPC is unset", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_1: "https://public.example" })).toEqual({ status: "configured", url: "https://public.example" });
  });

  it("defaults zkSync chains to their literal URLs and lets the public setting override them", () => {
    expect(resolvePublicRpcUrl(zkSyncMainnet, {})).toEqual({ status: "configured", url: "https://mainnet.era.zksync.io" });
    expect(resolvePublicRpcUrl(zkSyncMainnet, { REACT_APP_PUBLIC_RPC_324: "https://public.example/zk" })).toEqual({ status: "configured", url: "https://public.example/zk" });
  });

  it("ignores another chain's public setting", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_100: "https://public.example/gnosis" })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("is unconfigured with neither setting", () => {
    expect(resolvePublicRpcUrl(mainnet, {})).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("never throws for any chain, and falls through to unconfigured for a chain with no source", () => {
    for (const chain of [...Object.values(CHAINS), bare]) {
      expect(() => resolvePublicRpcUrl(chain, {})).not.toThrow();
    }
    expect(resolvePublicRpcUrl(bare, {})).toEqual({ status: "unconfigured", chainId: 999 });
  });
});
