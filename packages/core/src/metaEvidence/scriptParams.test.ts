import { describe, expect, it } from "vitest";
import type { Env } from "../types";
import { buildScriptParameters, loadMetaEvidence, parseMetaEvidence } from "./index";
import {
  ARBITRABLE,
  DEFAULT_SCRIPT_CID,
  DEFAULT_SCRIPT_URL,
  ENV,
  GNOSIS_RPC,
  MAINNET_RPC,
  META_URL,
  context,
  fakeFetcher,
  fakeRunner,
  json,
  locatorUrl,
  scriptOk,
  servedMetaEvidence,
} from "../test/metaEvidence/testHelpers";
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
  it("chain IDs default to the arbitrator chain, and the dispute ID is its decimal string", () => {
    const outcome = build({});
    expect(outcome).toEqual({
      ok: true,
      value: { disputeID: "1684", arbitrableContractAddress: ARBITRABLE, arbitratorChainID: 1, arbitrableChainID: 1, arbitratorJsonRpcUrl: null, arbitrableJsonRpcUrl: null },
    });
  });

  it("falsy chain IDs fall back to the arbitrator chain", () => {
    for (const falsy of [0, "", null, false]) {
      const outcome = build({ arbitratorChainID: falsy, arbitrableChainID: falsy });
      expect(outcome.ok && outcome.value.arbitrableChainID).toBe(1);
    }
  });

  it("a chain the table lacks stops the script with the reason that its network's details are unavailable", () => {
    expect(metaEvidence({ arbitrableChainID: 690 }).arbitrableChainID).toEqual({ status: "unsupported", chainId: 690 });
    for (const fields of [{ arbitrableChainID: 690 }, { arbitratorChainID: "80001" }]) {
      expect(build(fields)).toEqual({
        ok: false,
        error: { code: "no-rpc", message: "The meta-evidence names a network whose details are unavailable, so its dynamic script did not run." },
      });
    }
  });

  it("the chain IDs are passed as integers and the RPC URLs are the read RPC of each chain", () => {
    const env: Env = { ...ENV, REACT_APP_WEB3_PROVIDER_URL: MAINNET_RPC, REACT_APP_WEB3_XDAI_PROVIDER_URL: GNOSIS_RPC };
    const outcome = build({ arbitratorChainID: "1", arbitrableChainID: 100 }, env);
    expect(outcome.ok && [outcome.value.arbitratorChainID, outcome.value.arbitrableChainID]).toEqual([1, 100]);
    expect(outcome.ok && [outcome.value.arbitratorJsonRpcUrl, outcome.value.arbitrableJsonRpcUrl]).toEqual([MAINNET_RPC, GNOSIS_RPC]);
  });

  it("a configured chain without any RPC setting gets null, never a wallet default", () => {
    const outcome = build({ arbitrableChainID: 137 }, { ...ENV, REACT_APP_WEB3_PROVIDER_URL: MAINNET_RPC });
    expect(outcome.ok && [outcome.value.arbitratorJsonRpcUrl, outcome.value.arbitrableJsonRpcUrl]).toEqual([MAINNET_RPC, null]);
  });
});

describe("loadMetaEvidence script parameters", () => {
  const scriptJson = (fields: Record<string, unknown>) => json({ title: "T", dynamicScriptURI: `/ipfs/${DEFAULT_SCRIPT_CID}`, ...fields });

  it("a `</script>` chain ID skips the script: the static meta-evidence is accepted, the script is neither fetched nor run and nothing is retried", async () => {
    const { fetcher, urls } = fakeFetcher({ ...servedMetaEvidence(scriptJson({ arbitratorChainID: "1</script>" })), [DEFAULT_SCRIPT_URL]: "function getMetaEvidence() {}" });
    const { runner, requests } = fakeRunner(scriptOk({ title: "From the script" }));
    const result = await loadMetaEvidence(context({ fetcher, runner }));
    expect(result).toMatchObject({ status: "ok", script: { ran: false, reason: "script-chain-unavailable" }, metaEvidence: { title: "T", realityQuestion: null } });
    expect(requests).toHaveLength(0);
    expect(urls).not.toContain(DEFAULT_SCRIPT_URL);
    expect(urls.filter((url) => url === META_URL)).toHaveLength(1);
  });

  it("an unconfigured arbitrable chain skips the script without fetching it and keeps the static rulingOptions and title", async () => {
    const rulingOptions = { type: "single-select", titles: ["Pay the seller", "Refund the buyer"] };
    const { fetcher, urls } = fakeFetcher({
      ...servedMetaEvidence(scriptJson({ title: "Static title", arbitrableChainID: 10, rulingOptions })),
      [DEFAULT_SCRIPT_URL]: "function getMetaEvidence() {}",
    });
    const { runner, requests } = fakeRunner(scriptOk({ title: "From the script", rulingOptions: { type: "single-select", titles: ["Script"] } }));
    const result = await loadMetaEvidence(context({ fetcher, runner }));
    expect(result).toMatchObject({ status: "ok", script: { ran: false, reason: "script-chain-unavailable" } });
    expect(result.status === "ok" && [result.metaEvidence.title, result.metaEvidence.rulingOptions]).toEqual(["Static title", rulingOptions]);
    expect(requests).toHaveLength(0);
    expect(urls).not.toContain(DEFAULT_SCRIPT_URL);
    expect(urls.filter((url) => url === locatorUrl(1, 1684n))).toHaveLength(1);
    expect(urls.filter((url) => url === META_URL)).toHaveLength(1);
  });

  it("an unconfigured arbitrable chain does not excuse a script that is off the allowlist or not content-addressed", async () => {
    const gnosisOnly = "/ipfs/QmPAHCRtSU844fdjNoEws8AgTpzzwsYwMF2wydtpvXAcoZ/linguo-script.js";
    const refusals: [unknown, string][] = [
      [gnosisOnly, "script-not-allowlisted"],
      ["https://example.org/script.js", "script-uri-not-content-addressed"],
    ];
    for (const [dynamicScriptURI, reason] of refusals) {
      const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "T", arbitrableChainID: 10, dynamicScriptURI })));
      expect(await loadMetaEvidence(context({ fetcher }))).toMatchObject({ status: "invalid", reason });
    }
  });

  it("no script-parameter reason names configuration", () => {
    for (const fields of [{ arbitrableChainID: 10 }, { arbitratorChainID: "1</script>" }, { arbitrableChainID: "1</script>" }, { arbitrableChainID: "1.0" }]) {
      const outcome = build(fields);
      if (outcome.ok) throw new Error("the chain ID must be refused");
      expect(outcome.error.code).toBe("no-rpc");
      expect(outcome.error.message).not.toMatch(/configur|RPC|REACT_APP|env/i);
    }
  });

  it("the runner receives validated parameters with the read RPC and the arbitrator's arbitrable", async () => {
    const env: Env = { ...ENV, REACT_APP_WEB3_PROVIDER_URL: MAINNET_RPC };
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
      arbitratorJsonRpcUrl: MAINNET_RPC,
      arbitrableJsonRpcUrl: MAINNET_RPC,
    });
  });
});
