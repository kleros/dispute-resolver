import { describe, expect, it } from "vitest";
import { REGISTRY } from "../../../../packages/core/src/registry";
import { OLD_REDIRECTED_RPC, buildOldScriptParameters, oldReadOnlyRpcUrl, oldRedirectMap, oldSandboxValue } from "./oldParams";

const ENV = { REACT_APP_WEB3_PROVIDER_URL: "https://mainnet.rpc.test/key", REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://gnosis.rpc.test/key" };
const KLEROS_GOVERNOR = "0xe5bcEa6F87aAEe4a81f64dfDB4d30d400e0e5cf4";
const RESOLVER = "0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf";

describe("old runner parameters (spec 9.5)", () => {
  it("§9.5: chain IDs default to the network as a string, the address stays checksummed, RPC URLs come from the old map", () => {
    const result = buildOldScriptParameters({ chainIdFields: {}, chainId: 1, disputeId: 1454, arbitrableChecksummed: RESOLVER, env: ENV });
    expect(result).toEqual({
      ok: true,
      params: {
        arbitratorChainID: "1",
        arbitrableChainID: "1",
        disputeID: "1454",
        arbitrableContractAddress: RESOLVER,
        arbitratorJsonRpcUrl: "https://mainnet.rpc.test/key",
        arbitrableJsonRpcUrl: "https://mainnet.rpc.test/key",
      },
    });
    if (result.ok) expect(Object.keys(result.params)).toEqual(["arbitratorChainID", "arbitrableChainID", "disputeID", "arbitrableContractAddress", "arbitratorJsonRpcUrl", "arbitrableJsonRpcUrl"]);
  });

  it("§9.5: a truthy meta-evidence chain ID is kept as written, number or string", () => {
    const result = buildOldScriptParameters({ chainIdFields: { arbitratorChainID: 1, arbitrableChainID: "100" }, chainId: 1, disputeId: 7, arbitrableChecksummed: RESOLVER, env: ENV });
    expect(result).toMatchObject({ ok: true, params: { arbitratorChainID: 1, arbitrableChainID: "100", arbitrableJsonRpcUrl: "https://gnosis.rpc.test/key" } });
  });

  it("§9.5: a falsy meta-evidence chain ID falls back to the network", () => {
    const result = buildOldScriptParameters({ chainIdFields: { arbitratorChainID: 0, arbitrableChainID: "" }, chainId: 100, disputeId: 7, arbitrableChecksummed: RESOLVER, env: ENV });
    expect(result).toMatchObject({ ok: true, params: { arbitratorChainID: "100", arbitrableChainID: "100" } });
  });

  it("§11.3: a chain absent from the old network map fails before the script runs", () => {
    expect(buildOldScriptParameters({ chainIdFields: { arbitrableChainID: 10 }, chainId: 1, disputeId: 7, arbitrableChecksummed: RESOLVER, env: ENV })).toEqual({
      ok: false,
      detail: "getReadOnlyRpcUrl throws for arbitrableChainID 10",
    });
  });

  it("§9.5: parseInt without a radix reads hexadecimal and trailing text as today", () => {
    expect(oldReadOnlyRpcUrl("0x64", ENV)).toEqual({ ok: true, url: "https://gnosis.rpc.test/key" });
    expect(oldReadOnlyRpcUrl("1abc", ENV)).toEqual({ ok: true, url: "https://mainnet.rpc.test/key" });
    expect(oldReadOnlyRpcUrl(5, ENV)).toEqual({ ok: true, url: undefined });
    expect(oldReadOnlyRpcUrl(300, ENV)).toEqual({ ok: true, url: "https://sepolia.era.zksync.dev/" });
  });
});

describe("old runner sandbox flags (spec 9.5, ADR 0004)", () => {
  it("§9.5: adds allow-same-origin exactly when the arbitrable allowlist lists the arbitrable under arbitrableChainID", () => {
    const listed = buildOldScriptParameters({ chainIdFields: {}, chainId: 1, disputeId: 1672, arbitrableChecksummed: KLEROS_GOVERNOR, env: ENV });
    const unlisted = buildOldScriptParameters({ chainIdFields: {}, chainId: 1, disputeId: 1454, arbitrableChecksummed: RESOLVER, env: ENV });
    if (!listed.ok || !unlisted.ok) throw new Error("parameters expected");
    expect(oldSandboxValue(listed.params, REGISTRY)).toBe("allow-scripts allow-same-origin");
    expect(oldSandboxValue(unlisted.params, REGISTRY)).toBe("allow-scripts ");
  });

  it("§9.5: the allowlist is keyed by the arbitrableChainID parameter, so another chain's key never matches", () => {
    const params = buildOldScriptParameters({ chainIdFields: { arbitrableChainID: "100" }, chainId: 1, disputeId: 1672, arbitrableChecksummed: KLEROS_GOVERNOR, env: ENV });
    if (!params.ok) throw new Error("parameters expected");
    expect(oldSandboxValue(params.params, REGISTRY)).toBe("allow-scripts ");
  });

  it("§9.5: the RPC patch redirects only the hard-coded Infura URL, and only when chain 1's RPC is set", () => {
    expect(oldRedirectMap(ENV)).toEqual({ [OLD_REDIRECTED_RPC]: "https://mainnet.rpc.test/key" });
    expect(oldRedirectMap({})).toEqual({});
  });
});
