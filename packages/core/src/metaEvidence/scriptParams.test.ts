import { describe, expect, it } from "vitest";
import type { Env } from "../types";
import { buildScriptParameters, loadMetaEvidence, parseMetaEvidence } from "./index";
import {
  ARBITRABLE,
  DEFAULT_SCRIPT_CID,
  DEFAULT_SCRIPT_URL,
  ENV,
  GNOSIS_RPC,
  MAINNET_PUBLIC_RPC,
  MAINNET_RPC,
  context,
  fakeFetcher,
  fakeRunner,
  json,
  scriptOk,
  servedMetaEvidence,
} from "./testHelpers";
import type { MetaEvidence } from "./types";

function metaEvidence(fields: Record<string, unknown>): MetaEvidence {
  const outcome = parseMetaEvidence({ title: "T", ...fields });
  if (!outcome.ok) throw new Error("fixture meta-evidence must parse");
  return outcome.value;
}

function build(fields: Record<string, unknown>, env: Env = ENV) {
  return buildScriptParameters({ metaEvidence: metaEvidence(fields), arbitratorChainId: 1, disputeId: 1684n, arbitrable: ARBITRABLE, env });
}

describe("buildScriptParameters", () => {
  it("§9.5: chain IDs default to the arbitrator chain, and the dispute ID is its decimal string", () => {
    const outcome = build({});
    expect(outcome).toEqual({
      ok: true,
      value: { disputeID: "1684", arbitrableContractAddress: ARBITRABLE, arbitratorChainID: 1, arbitrableChainID: 1, arbitratorJsonRpcUrl: null, arbitrableJsonRpcUrl: null },
    });
  });

  it("§9.5: falsy chain IDs fall back to the arbitrator chain, as today's `||` does", () => {
    for (const falsy of [0, "", null, false]) {
      const outcome = build({ arbitratorChainID: falsy, arbitrableChainID: falsy });
      expect(outcome.ok && outcome.value.arbitrableChainID).toBe(1);
    }
  });

  it("§9.5: valid chain IDs are passed as integers", () => {
    const outcome = build({ arbitratorChainID: "1", arbitrableChainID: 100 });
    expect(outcome.ok && [outcome.value.arbitratorChainID, outcome.value.arbitrableChainID]).toEqual([1, 100]);
  });

  it("B5: a `</script>` chain ID fails with no parameters", () => {
    const outcome = build({ arbitrableChainID: '1</script><script>parent.postMessage({target:"script"},"*")</script>' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("no-rpc");
  });

  it("B5: non-integer chain IDs fail", () => {
    for (const bad of ["1.0", 1.5, "01", " 1", "0x1", "1e0", {}]) {
      expect(build({ arbitratorChainID: bad }).ok).toBe(false);
      expect(build({ arbitrableChainID: bad }).ok).toBe(false);
    }
  });

  it("D-18: a chain that is not configured (Optimism, 10) fails instead of throwing", () => {
    expect(build({ arbitrableChainID: 10 }).ok).toBe(false);
    expect(build({ arbitratorChainID: "10" }).ok).toBe(false);
  });

  it("B13, D-35: the RPC URLs are the public setting of each chain, defaulting to its read RPC", () => {
    const env: Env = { ...ENV, REACT_APP_WEB3_PROVIDER_URL: MAINNET_RPC, REACT_APP_PUBLIC_RPC_1: MAINNET_PUBLIC_RPC, REACT_APP_WEB3_XDAI_PROVIDER_URL: GNOSIS_RPC };
    const outcome = build({ arbitrableChainID: 100 }, env);
    expect(outcome.ok && [outcome.value.arbitratorJsonRpcUrl, outcome.value.arbitrableJsonRpcUrl]).toEqual([MAINNET_PUBLIC_RPC, GNOSIS_RPC]);
  });

  it("D-35, D-56: a configured chain without any RPC setting gets null, never a wallet or public default", () => {
    const outcome = build({ arbitrableChainID: 137 }, { ...ENV, REACT_APP_WEB3_PROVIDER_URL: MAINNET_RPC });
    expect(outcome.ok && [outcome.value.arbitratorJsonRpcUrl, outcome.value.arbitrableJsonRpcUrl]).toEqual([MAINNET_RPC, null]);
  });

  it("A22: the arbitrable is the arbitrator's, whatever the meta-evidence names", () => {
    const outcome = build({ arbitrableContractAddress: "0x0000000000000000000000000000000000000bad", arbitrable: "0x0000000000000000000000000000000000000bad" });
    expect(outcome.ok && outcome.value.arbitrableContractAddress).toBe(ARBITRABLE);
  });
});

describe("loadMetaEvidence script parameters", () => {
  const scriptJson = (fields: Record<string, unknown>) => json({ title: "T", dynamicScriptURI: `/ipfs/${DEFAULT_SCRIPT_CID}`, ...fields });

  it("B5: a `</script>` chain ID stops the script: failed / unknown-chain, never run, never retried (MODULES.md choice 6)", async () => {
    const { fetcher, urls } = fakeFetcher({ ...servedMetaEvidence(scriptJson({ arbitratorChainID: "1</script>" })), [DEFAULT_SCRIPT_URL]: "function getMetaEvidence() {}" });
    const { runner, requests } = fakeRunner(scriptOk({}));
    const result = await loadMetaEvidence(context({ fetcher, runner }));
    expect(result).toMatchObject({ status: "failed", reason: "unknown-chain" });
    expect(requests).toHaveLength(0);
    expect(urls.filter((url) => url === DEFAULT_SCRIPT_URL)).toHaveLength(1);
  });

  it("D-18: an unconfigured arbitrable chain stops the script with unknown-chain", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(scriptJson({ arbitrableChainID: 10 })), [DEFAULT_SCRIPT_URL]: "function getMetaEvidence() {}" });
    const { runner, requests } = fakeRunner(scriptOk({}));
    expect(await loadMetaEvidence(context({ fetcher, runner }))).toMatchObject({ status: "failed", reason: "unknown-chain", error: { code: "no-rpc" } });
    expect(requests).toHaveLength(0);
  });

  it("§9.5, D-35, A22: the runner receives validated parameters with the public RPC and the arbitrator's arbitrable", async () => {
    const env: Env = { ...ENV, REACT_APP_WEB3_PROVIDER_URL: MAINNET_RPC, REACT_APP_PUBLIC_RPC_1: MAINNET_PUBLIC_RPC };
    const { fetcher } = fakeFetcher({
      ...servedMetaEvidence(scriptJson({ arbitrableChainID: "1", arbitrableContractAddress: "0x0000000000000000000000000000000000000bad" })),
      [DEFAULT_SCRIPT_URL]: "function getMetaEvidence() {}",
    });
    const { runner, requests } = fakeRunner(scriptOk({}));
    await loadMetaEvidence(context({ fetcher, runner, env }));
    expect(requests[0]?.params).toEqual({
      disputeID: "1684",
      arbitrableContractAddress: ARBITRABLE,
      arbitratorChainID: 1,
      arbitrableChainID: 1,
      arbitratorJsonRpcUrl: MAINNET_PUBLIC_RPC,
      arbitrableJsonRpcUrl: MAINNET_PUBLIC_RPC,
    });
  });
});
