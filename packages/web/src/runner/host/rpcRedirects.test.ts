import { describe, expect, it } from "vitest";
import { buildRpcRedirects } from "./rpcRedirects";

describe("buildRpcRedirects", () => {
  it("redirects every key on a chain's Infura host to that chain's public RPC", () => {
    const rules = buildRpcRedirects({
      REACT_APP_WEB3_PROVIDER_URL: "https://read.example/mainnet",
      REACT_APP_PUBLIC_RPC_1: "https://public.example/mainnet",
      REACT_APP_WEB3_SEPOLIA_PROVIDER_URL: "https://read.example/sepolia",
    });
    expect(rules).toContainEqual({ chainId: 1, host: "mainnet.infura.io", pathPrefix: "/v3/", target: "https://public.example/mainnet" });
    expect(rules).toContainEqual({ chainId: 11155111, host: "sepolia.infura.io", pathPrefix: "/v3/", target: "https://read.example/sepolia" });
  });

  it("defaults the target to the read RPC when no public RPC is set", () => {
    const rules = buildRpcRedirects({ REACT_APP_WEB3_PROVIDER_URL: "https://read.example/mainnet" });
    expect(rules.find((rule) => rule.chainId === 1)?.target).toBe("https://read.example/mainnet");
  });

  it("emits no rule for a chain without a configured RPC", () => {
    const rules = buildRpcRedirects({ REACT_APP_WEB3_PROVIDER_URL: "  " });
    expect(rules.map((rule) => rule.chainId).sort((a, b) => a - b)).toEqual([300, 324]);
  });

  it("covers exactly the Infura networks of the configured chains", () => {
    const rules = buildRpcRedirects({
      REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example/1",
      REACT_APP_WEB3_SEPOLIA_PROVIDER_URL: "https://rpc.example/11155111",
      REACT_APP_WEB3_POLYGON_PROVIDER_URL: "https://rpc.example/137",
      REACT_APP_ARBITRUM_ONE: "https://rpc.example/42161",
      REACT_APP_ARBITRUM_SEPOLIA: "https://rpc.example/421614",
      REACT_APP_OPTIMISM_SEPOLIA: "https://rpc.example/11155420",
      REACT_APP_BASE: "https://rpc.example/8453",
      REACT_APP_BASE_SEPOLIA: "https://rpc.example/84532",
      REACT_APP_UNICHAIN: "https://rpc.example/130",
      REACT_APP_UNICHAIN_SEPOLIA: "https://rpc.example/1301",
      REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://rpc.example/100",
      REACT_APP_WEB3_CHIADO_PROVIDER_URL: "https://rpc.example/10200",
    });
    expect(Object.fromEntries(rules.map((rule) => [rule.host, rule.chainId]))).toEqual({
      "mainnet.infura.io": 1,
      "sepolia.infura.io": 11155111,
      "polygon-mainnet.infura.io": 137,
      "arbitrum-mainnet.infura.io": 42161,
      "arbitrum-sepolia.infura.io": 421614,
      "optimism-sepolia.infura.io": 11155420,
      "base-mainnet.infura.io": 8453,
      "base-sepolia.infura.io": 84532,
      "unichain-mainnet.infura.io": 130,
      "unichain-sepolia.infura.io": 1301,
      "zksync-mainnet.infura.io": 324,
      "zksync-sepolia.infura.io": 300,
    });
    expect(rules.every((rule) => rule.pathPrefix === "/v3/")).toBe(true);
    expect(rules.find((rule) => rule.chainId === 324)?.target).toBe("https://mainnet.era.zksync.io");
  });

  it("emits no rule whose target is not https, which the https runner could not reach", () => {
    const rules = buildRpcRedirects({ REACT_APP_WEB3_PROVIDER_URL: "http://localhost:8545" });
    expect(rules.find((rule) => rule.chainId === 1)).toBeUndefined();
  });
});
