import type { Address, Env, GatewayOrigin, MetaEvidence } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { testMetaEvidence } from "../test/safe-content";
import { buildEvidenceDisplay } from "./evidenceDisplay";
import type { EvidenceDisplayInput } from "./types";

const GATEWAY: GatewayOrigin = "https://cdn.kleros.link";
const CID = "QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh";
const KLEROS_LIQUID_MAINNET: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const ALLOWLISTED_ON_1: Address = "0xebcf3bca271b26ae4b162ba560e243055af0e679";
const ALLOWLISTED_ON_100: Address = "0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001";
const NOT_ALLOWLISTED: Address = "0x00000000000000000000000000000000000000aa";
const MAINNET_RPC = "https://mainnet.read.example/secret-key";
const ENV: Env = {
  REACT_APP_WEB3_PROVIDER_URL: MAINNET_RPC,
  REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://gnosis.read.example/secret-key",
};
const RELAXED = ["allow-scripts", "allow-same-origin", "allow-popups", "allow-popups-to-escape-sandbox"];

function input(overrides: Partial<EvidenceDisplayInput> = {}): EvidenceDisplayInput {
  return {
    metaEvidence: testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}/index.html` }),
    arbitratorChainId: 1,
    disputeId: 1255n,
    arbitrable: NOT_ALLOWLISTED,
    arbitrator: KLEROS_LIQUID_MAINNET,
    env: ENV,
    gateway: GATEWAY,
    appOrigin: "https://resolve.kleros.io",
    ...overrides,
  };
}

const JSON_PARAMS = {
  disputeID: "1255",
  chainID: 1,
  arbitratorContractAddress: KLEROS_LIQUID_MAINNET,
  arbitratorJsonRpcUrl: MAINNET_RPC,
  arbitratorChainID: 1,
  arbitrableContractAddress: NOT_ALLOWLISTED,
  arbitrableChainID: 1,
  arbitrableJsonRpcUrl: MAINNET_RPC,
  jsonRpcUrl: MAINNET_RPC,
};
const PARAM_ORDER = Object.keys(JSON_PARAMS);
const SEARCH_PARAMS = Object.fromEntries(Object.entries(JSON_PARAMS).map(([key, value]) => [key, String(value)]));

function decodeJsonQuery(src: string | undefined): Record<string, unknown> {
  const query = src?.slice(src.indexOf("?") + 1) ?? "";
  return JSON.parse(decodeURIComponent(query)) as Record<string, unknown>;
}

function withMeta(fields: Partial<MetaEvidence>, overrides: Partial<EvidenceDisplayInput> = {}): EvidenceDisplayInput {
  return input({ metaEvidence: testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}`, ...fields }), ...overrides });
}

describe("buildEvidenceDisplay source", () => {
  it.each<[string, string | null]>([
    ["without an evidenceDisplayInterfaceURI", null],
    ["for a source the display rules refuse", "javascript:alert(1)"],
  ])("renders no frame %s", (_label, uri) => {
    expect(buildEvidenceDisplay(withMeta({ evidenceDisplayInterfaceURI: uri }))).toBeNull();
  });
});

describe("buildEvidenceDisplay parameters", () => {
  it("passes the dispute, the page chain, the arbitrator and the arbitrable from the binding", () => {
    expect(buildEvidenceDisplay(input())?.params).toEqual(JSON_PARAMS);
  });

  it("writes null for a chain with no RPC configured", () => {
    const model = buildEvidenceDisplay(input({ env: {} }));
    expect(model?.params.arbitratorJsonRpcUrl).toBeNull();
    expect(model?.params.arbitrableJsonRpcUrl).toBeNull();
    expect(model?.params.jsonRpcUrl).toBeNull();
  });

  it("takes the chain IDs from valid meta-evidence fields", () => {
    const model = buildEvidenceDisplay(withMeta({ arbitratorChainID: { status: "valid", chainId: 100 }, arbitrableChainID: { status: "valid", chainId: 100 } }));
    expect(model?.params.chainID).toBe(1);
    expect(model?.params.arbitratorChainID).toBe(100);
    expect(model?.params.arbitrableChainID).toBe(100);
    expect(model?.params.arbitratorJsonRpcUrl).toBe("https://gnosis.read.example/secret-key");
    expect(model?.params.arbitrableJsonRpcUrl).toBe("https://gnosis.read.example/secret-key");
    expect(model?.params.jsonRpcUrl).toBe("https://mainnet.read.example/secret-key");
  });

  it("falls back to the page chain for an invalid chain ID field", () => {
    const model = buildEvidenceDisplay(withMeta({ arbitratorChainID: { status: "invalid" }, arbitrableChainID: { status: "invalid" } }));
    expect(model?.params.arbitratorChainID).toBe(1);
    expect(model?.params.arbitrableChainID).toBe(1);
    expect(model?.params.arbitratorJsonRpcUrl).toBe("https://mainnet.read.example/secret-key");
    expect(model?.params.arbitrableJsonRpcUrl).toBe("https://mainnet.read.example/secret-key");
  });
});

describe("buildEvidenceDisplay for a chain the app does not configure", () => {
  const UNCONFIGURED = [
    ["arbitrable", 10],
    ["arbitrable", 690],
    ["arbitrator", 10],
    ["arbitrator", 690],
  ] as const;

  function unsupported(side: "arbitrable" | "arbitrator", chainId: number): Partial<MetaEvidence> {
    const field = { status: "unsupported", chainId } as const;
    return side === "arbitrable" ? { arbitrableChainID: field } : { arbitratorChainID: field };
  }

  function unconfigured(fields: Partial<MetaEvidence>, version: string | null) {
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}/index.html`, displayParamsVersion: version, ...fields });
    return buildEvidenceDisplay(input({ metaEvidence }));
  }

  it.each(UNCONFIGURED)("tells a JSON display %s chain %i with no RPC, keeping the court's chain and RPC", (side, chainId) => {
    const model = unconfigured(unsupported(side, chainId), null);
    expect(model?.encoding).toBe("json");
    const decoded = decodeJsonQuery(model?.src);
    expect(Object.keys(decoded)).toEqual(PARAM_ORDER);
    expect(decoded).toEqual({ ...JSON_PARAMS, [`${side}ChainID`]: chainId, [`${side}JsonRpcUrl`]: null });
  });

  it.each(UNCONFIGURED)("tells a URLSearchParams display %s chain %i with an empty RPC, keeping the court's chain and RPC", (side, chainId) => {
    const model = unconfigured(unsupported(side, chainId), "1");
    expect(model?.encoding).toBe("search-params");
    const search = new URL(model?.src ?? "").searchParams;
    expect([...search.keys()]).toEqual(PARAM_ORDER);
    expect(Object.fromEntries(search)).toEqual({ ...SEARCH_PARAMS, [`${side}ChainID`]: String(chainId), [`${side}JsonRpcUrl`]: "" });
  });
});

describe("buildEvidenceDisplay encoding", () => {
  it.each([null, "0"])("encodes the parameters as JSON when _v is %j", (version) => {
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}/index.html`, displayParamsVersion: version });
    const model = buildEvidenceDisplay(input({ metaEvidence }));
    expect(model?.encoding).toBe("json");
    expect(model?.src).toBe(`${GATEWAY}/ipfs/${CID}/index.html?${encodeURIComponent(JSON.stringify(model?.params))}`);
    expect(Object.keys(decodeJsonQuery(model?.src))).toEqual(PARAM_ORDER);
  });
});

describe("buildEvidenceDisplay sandbox", () => {
  it("gives allowlisted arbitrables the relaxed flags", () => {
    expect(buildEvidenceDisplay(input({ arbitrable: ALLOWLISTED_ON_1 }))?.sandbox).toEqual(RELAXED);
  });

  it("gives every other arbitrable allow-scripts only", () => {
    expect(buildEvidenceDisplay(input())?.sandbox).toEqual(["allow-scripts"]);
  });

  it("keys the allowlist on a valid meta-evidence arbitrableChainID", () => {
    expect(buildEvidenceDisplay(withMeta({ arbitrableChainID: { status: "valid", chainId: 100 } }, { arbitrable: ALLOWLISTED_ON_100 }))?.sandbox).toEqual(RELAXED);
  });

  it("falls back to the arbitrator chain for an arbitrableChainID that is not a positive integer", () => {
    const fields: Partial<MetaEvidence> = { arbitrableChainID: { status: "invalid" } };
    expect(buildEvidenceDisplay(withMeta(fields, { arbitrable: ALLOWLISTED_ON_100 }))?.sandbox).toEqual(["allow-scripts"]);
    expect(buildEvidenceDisplay(withMeta(fields, { arbitrable: ALLOWLISTED_ON_1 }))?.sandbox).toEqual(RELAXED);
  });

  it.each([10, 690])("gives allow-scripts only for unconfigured arbitrable chain %i, even to an arbitrable allowlisted on the arbitrator chain", (chainId) => {
    const fields: Partial<MetaEvidence> = { arbitrableChainID: { status: "unsupported", chainId } };
    expect(buildEvidenceDisplay(withMeta(fields, { arbitrable: ALLOWLISTED_ON_1 }))?.sandbox).toEqual(["allow-scripts"]);
    expect(buildEvidenceDisplay(withMeta(fields, { arbitrable: ALLOWLISTED_ON_100, arbitratorChainId: 100 }))?.sandbox).toEqual(["allow-scripts"]);
  });

  it("never gives allow-same-origin to a display on the app's own origin", () => {
    const model = buildEvidenceDisplay(withMeta({ evidenceDisplayInterfaceURI: "https://resolve.kleros.io/display/index.html" }, { arbitrable: ALLOWLISTED_ON_1 }));
    expect(model?.sandbox).toEqual(["allow-scripts"]);
  });

  it("compares origins, so a gateway display stays relaxed when the app runs elsewhere", () => {
    const model = buildEvidenceDisplay(input({ arbitrable: ALLOWLISTED_ON_1, appOrigin: "https://cdn.kleros.link:8443" }));
    expect(model?.sandbox).toEqual(RELAXED);
  });
});
