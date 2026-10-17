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
  it("A13: reads the URL from the chain's env variable", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it("A13: trims the configured value", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "  https://rpc.example/mainnet \n" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it("D-56: an unset variable means unconfigured, with no wallet or public fallback", () => {
    expect(resolveReadRpcUrl(mainnet, {})).toEqual({ status: "unconfigured", chainId: 1 });
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: undefined })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("D-56: an empty or whitespace-only variable means unconfigured", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "" })).toEqual({ status: "unconfigured", chainId: 1 });
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "   \t" })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("D-56: the public RPC setting never stands in for a missing read RPC", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_1: "https://public.example" })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("D-56: another chain's variable does not leak into this chain", () => {
    expect(resolveReadRpcUrl(mainnet, { REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://rpc.example/gnosis" })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("§7: zkSync Sepolia and zkSync Era resolve to their literal URLs with an empty env", () => {
    expect(resolveReadRpcUrl(zkSyncSepolia, {})).toEqual({ status: "configured", url: "https://sepolia.era.zksync.dev/" });
    expect(resolveReadRpcUrl(zkSyncMainnet, {})).toEqual({ status: "configured", url: "https://mainnet.era.zksync.io" });
  });

  it("§7: the literal URL is used when the chain's variable is blank", () => {
    const withBoth: ChainConfig = { ...zkSyncMainnet, readRpcEnv: "REACT_APP_ZK" };
    expect(resolveReadRpcUrl(withBoth, { REACT_APP_ZK: " " })).toEqual({ status: "configured", url: "https://mainnet.era.zksync.io" });
    expect(resolveReadRpcUrl(withBoth, { REACT_APP_ZK: "https://override.example" })).toEqual({ status: "configured", url: "https://override.example" });
  });

  it("D-18: never throws, for every chain in the table and for a chain with no source", () => {
    for (const chain of [...Object.values(CHAINS), bare]) {
      expect(() => resolveReadRpcUrl(chain, {})).not.toThrow();
    }
    expect(resolveReadRpcUrl(bare, {})).toEqual({ status: "unconfigured", chainId: 999 });
  });

  it("D-18: ignores an env value that is not a string", () => {
    const env = { REACT_APP_WEB3_PROVIDER_URL: 42 } as unknown as Record<string, string>;
    expect(resolveReadRpcUrl(mainnet, env)).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("D-56: ignores variables inherited from the env object's prototype", () => {
    const env = Object.create({ REACT_APP_WEB3_PROVIDER_URL: "https://inherited.example" }) as Record<string, string>;
    expect(resolveReadRpcUrl(mainnet, env)).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("D-56: every chain of the table is unconfigured on an empty env except 300 and 324", () => {
    const configured = Object.values(CHAINS)
      .filter((chain) => resolveReadRpcUrl(chain, {}).status === "configured")
      .map((chain) => chain.id);
    expect(ascending(configured)).toEqual([300, 324]);
  });
});

describe("resolvePublicRpcUrl", () => {
  it("D-35: with no public setting it defaults to the read RPC", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet" })).toEqual({ status: "configured", url: "https://rpc.example/mainnet" });
  });

  it("D-35: the public setting overrides the read RPC", () => {
    const env = { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet?key=secret", REACT_APP_PUBLIC_RPC_1: "https://public.example/mainnet" };
    expect(resolvePublicRpcUrl(mainnet, env)).toEqual({ status: "configured", url: "https://public.example/mainnet" });
  });

  it("D-35: the public setting is trimmed, and a blank one falls back to the read RPC", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_1: " https://public.example " })).toEqual({ status: "configured", url: "https://public.example" });
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/mainnet", REACT_APP_PUBLIC_RPC_1: "  " })).toEqual({
      status: "configured",
      url: "https://rpc.example/mainnet",
    });
  });

  it("D-35: a public setting works on a chain whose read RPC is unset", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_1: "https://public.example" })).toEqual({ status: "configured", url: "https://public.example" });
  });

  it("D-35: zkSync chains default to their literal URLs and can be overridden", () => {
    expect(resolvePublicRpcUrl(zkSyncMainnet, {})).toEqual({ status: "configured", url: "https://mainnet.era.zksync.io" });
    expect(resolvePublicRpcUrl(zkSyncMainnet, { REACT_APP_PUBLIC_RPC_324: "https://public.example/zk" })).toEqual({ status: "configured", url: "https://public.example/zk" });
  });

  it("D-35: another chain's public setting does not apply", () => {
    expect(resolvePublicRpcUrl(mainnet, { REACT_APP_PUBLIC_RPC_100: "https://public.example/gnosis" })).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("D-56: with neither setting the result is unconfigured", () => {
    expect(resolvePublicRpcUrl(mainnet, {})).toEqual({ status: "unconfigured", chainId: 1 });
  });

  it("D-18: never throws, for every chain in the table and for a chain with no source", () => {
    for (const chain of [...Object.values(CHAINS), bare]) {
      expect(() => resolvePublicRpcUrl(chain, {})).not.toThrow();
    }
    expect(resolvePublicRpcUrl(bare, {})).toEqual({ status: "unconfigured", chainId: 999 });
  });
});
