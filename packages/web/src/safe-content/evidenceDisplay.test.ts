import type { Address, Env, GatewayOrigin, MetaEvidence } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { testMetaEvidence } from "../test/safe-content";
import { buildEvidenceDisplay } from "./evidenceDisplay";
import type { EvidenceDisplayInput } from "./types";

const GATEWAY: GatewayOrigin = "https://cdn.kleros.link";
const CID = "QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh";
const KLEROS_LIQUID_MAINNET: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
/** On the display allowlist under chain 1 (T2CR). */
const ALLOWLISTED_ON_1: Address = "0xebcf3bca271b26ae4b162ba560e243055af0e679";
/** On the display allowlist under chain 100 only. */
const ALLOWLISTED_ON_100: Address = "0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001";
const NOT_ALLOWLISTED: Address = "0x00000000000000000000000000000000000000aa";
const ENV: Env = {
  REACT_APP_WEB3_PROVIDER_URL: "https://mainnet.read.example/secret-key",
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

const PARAM_ORDER = [
  "disputeID",
  "chainID",
  "arbitratorContractAddress",
  "arbitratorJsonRpcUrl",
  "arbitratorChainID",
  "arbitrableContractAddress",
  "arbitrableChainID",
  "arbitrableJsonRpcUrl",
  "jsonRpcUrl",
];

function decodeJsonQuery(src: string | undefined): Record<string, unknown> {
  const query = src?.slice(src.indexOf("?") + 1) ?? "";
  return JSON.parse(decodeURIComponent(query)) as Record<string, unknown>;
}

function withDisplay(uri: string | null, overrides: Partial<EvidenceDisplayInput> = {}): EvidenceDisplayInput {
  return input({ metaEvidence: testMetaEvidence({ evidenceDisplayInterfaceURI: uri }), ...overrides });
}

describe("buildEvidenceDisplay source", () => {
  it("renders no frame without an evidenceDisplayInterfaceURI", () => {
    expect(buildEvidenceDisplay(withDisplay(null))).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://display.example/index.html", "//display.example/index.html", "/ipns/kleros.io"])(
    "renders no frame for the non-https source %j",
    (uri) => {
      expect(buildEvidenceDisplay(withDisplay(uri))).toBeNull();
    },
  );

  it("serves a canonical IPFS path through the configured gateway", () => {
    const model = buildEvidenceDisplay(withDisplay(`/ipfs/${CID}/index.html`));
    expect(model?.src.startsWith(`${GATEWAY}/ipfs/${CID}/index.html?`)).toBe(true);
    expect(model?.srcOrigin).toBe(GATEWAY);
  });

  it("re-serves the T2CR display URL through the configured gateway without naming the contract", () => {
    const model = buildEvidenceDisplay(withDisplay(`https://ipfs.kleros.io/ipfs/${CID}/index.html`, { arbitrable: ALLOWLISTED_ON_1 }));
    expect(model?.src.startsWith(`${GATEWAY}/ipfs/${CID}/index.html?`)).toBe(true);
  });

  it("uses any other https display as is", () => {
    const model = buildEvidenceDisplay(withDisplay("https://display.example/app/"));
    expect(model?.src.startsWith("https://display.example/app/?")).toBe(true);
    expect(model?.srcOrigin).toBe("https://display.example");
  });
});

describe("buildEvidenceDisplay parameters", () => {
  it("passes the dispute, the page chain, the arbitrator and the arbitrable from the binding", () => {
    const model = buildEvidenceDisplay(input());
    expect(model?.params).toEqual({
      disputeID: "1255",
      chainID: 1,
      arbitratorContractAddress: KLEROS_LIQUID_MAINNET,
      arbitratorJsonRpcUrl: "https://mainnet.read.example/secret-key",
      arbitratorChainID: 1,
      arbitrableContractAddress: NOT_ALLOWLISTED,
      arbitrableChainID: 1,
      arbitrableJsonRpcUrl: "https://mainnet.read.example/secret-key",
      jsonRpcUrl: "https://mainnet.read.example/secret-key",
    });
  });

  it("gives frames the read RPC of the chain each URL is for", () => {
    const model = buildEvidenceDisplay(
      input({ metaEvidence: testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}`, arbitrableChainID: { status: "valid", chainId: 100 } }) }),
    );
    expect(model?.params.arbitrableJsonRpcUrl).toBe("https://gnosis.read.example/secret-key");
  });

  it("writes null for a chain with no RPC configured", () => {
    const model = buildEvidenceDisplay(input({ env: {} }));
    expect(model?.params.arbitratorJsonRpcUrl).toBeNull();
    expect(model?.params.arbitrableJsonRpcUrl).toBeNull();
    expect(model?.params.jsonRpcUrl).toBeNull();
  });

  it("takes the chain IDs from valid meta-evidence fields", () => {
    const metaEvidence = testMetaEvidence({
      evidenceDisplayInterfaceURI: `/ipfs/${CID}`,
      arbitratorChainID: { status: "valid", chainId: 100 },
      arbitrableChainID: { status: "valid", chainId: 100 },
    });
    const model = buildEvidenceDisplay(input({ metaEvidence }));
    expect(model?.params.chainID).toBe(1);
    expect(model?.params.arbitratorChainID).toBe(100);
    expect(model?.params.arbitrableChainID).toBe(100);
    expect(model?.params.arbitratorJsonRpcUrl).toBe("https://gnosis.read.example/secret-key");
    expect(model?.params.jsonRpcUrl).toBe("https://mainnet.read.example/secret-key");
  });

  it("falls back to the page chain for an invalid chain ID field", () => {
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}`, arbitratorChainID: { status: "invalid" }, arbitrableChainID: { status: "invalid" } });
    const model = buildEvidenceDisplay(input({ metaEvidence }));
    expect(model?.params.arbitratorChainID).toBe(1);
    expect(model?.params.arbitrableChainID).toBe(1);
    expect(model?.params.arbitratorJsonRpcUrl).toBe("https://mainnet.read.example/secret-key");
    expect(model?.params.arbitrableJsonRpcUrl).toBe("https://mainnet.read.example/secret-key");
  });
});

describe("buildEvidenceDisplay for a chain the app does not configure", () => {
  function unconfigured(fields: Partial<MetaEvidence>, version: string | null) {
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}/index.html`, displayParamsVersion: version, ...fields });
    return buildEvidenceDisplay(input({ metaEvidence }));
  }

  it.each([10, 690])("tells a JSON display arbitrable chain %i with no RPC, keeping the court's chain and RPC", (chainId) => {
    const model = unconfigured({ arbitrableChainID: { status: "unsupported", chainId } }, null);
    expect(model?.encoding).toBe("json");
    const decoded = decodeJsonQuery(model?.src);
    expect(Object.keys(decoded)).toEqual(PARAM_ORDER);
    expect(decoded).toEqual({
      disputeID: "1255",
      chainID: 1,
      arbitratorContractAddress: KLEROS_LIQUID_MAINNET,
      arbitratorJsonRpcUrl: "https://mainnet.read.example/secret-key",
      arbitratorChainID: 1,
      arbitrableContractAddress: NOT_ALLOWLISTED,
      arbitrableChainID: chainId,
      arbitrableJsonRpcUrl: null,
      jsonRpcUrl: "https://mainnet.read.example/secret-key",
    });
  });

  it.each([10, 690])("tells a URLSearchParams display arbitrable chain %i with an empty RPC, keeping the court's chain and RPC", (chainId) => {
    const model = unconfigured({ arbitrableChainID: { status: "unsupported", chainId } }, "1");
    expect(model?.encoding).toBe("search-params");
    const search = new URL(model?.src ?? "").searchParams;
    expect([...search.keys()]).toEqual(PARAM_ORDER);
    expect(Object.fromEntries(search)).toEqual({
      disputeID: "1255",
      chainID: "1",
      arbitratorContractAddress: KLEROS_LIQUID_MAINNET,
      arbitratorJsonRpcUrl: "https://mainnet.read.example/secret-key",
      arbitratorChainID: "1",
      arbitrableContractAddress: NOT_ALLOWLISTED,
      arbitrableChainID: String(chainId),
      arbitrableJsonRpcUrl: "",
      jsonRpcUrl: "https://mainnet.read.example/secret-key",
    });
  });

  it.each([10, 690])("tells a JSON display arbitrator chain %i with no RPC, keeping the court's chain and RPC", (chainId) => {
    const model = unconfigured({ arbitratorChainID: { status: "unsupported", chainId } }, null);
    expect(model?.encoding).toBe("json");
    const decoded = decodeJsonQuery(model?.src);
    expect(Object.keys(decoded)).toEqual(PARAM_ORDER);
    expect(decoded).toEqual({
      disputeID: "1255",
      chainID: 1,
      arbitratorContractAddress: KLEROS_LIQUID_MAINNET,
      arbitratorJsonRpcUrl: null,
      arbitratorChainID: chainId,
      arbitrableContractAddress: NOT_ALLOWLISTED,
      arbitrableChainID: 1,
      arbitrableJsonRpcUrl: "https://mainnet.read.example/secret-key",
      jsonRpcUrl: "https://mainnet.read.example/secret-key",
    });
  });

  it.each([10, 690])("tells a URLSearchParams display arbitrator chain %i with an empty RPC, keeping the court's chain and RPC", (chainId) => {
    const model = unconfigured({ arbitratorChainID: { status: "unsupported", chainId } }, "1");
    expect(model?.encoding).toBe("search-params");
    const search = new URL(model?.src ?? "").searchParams;
    expect([...search.keys()]).toEqual(PARAM_ORDER);
    expect(Object.fromEntries(search)).toEqual({
      disputeID: "1255",
      chainID: "1",
      arbitratorContractAddress: KLEROS_LIQUID_MAINNET,
      arbitratorJsonRpcUrl: "",
      arbitratorChainID: String(chainId),
      arbitrableContractAddress: NOT_ALLOWLISTED,
      arbitrableChainID: "1",
      arbitrableJsonRpcUrl: "https://mainnet.read.example/secret-key",
      jsonRpcUrl: "https://mainnet.read.example/secret-key",
    });
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

  it("encodes URLSearchParams for any other _v, writing unconfigured RPC URLs as empty strings", () => {
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}/index.html`, displayParamsVersion: "1" });
    const model = buildEvidenceDisplay(input({ metaEvidence, env: {} }));
    expect(model?.encoding).toBe("search-params");
    const search = new URL(model?.src ?? "").searchParams;
    expect(Object.fromEntries(search)).toEqual({
      disputeID: "1255",
      chainID: "1",
      arbitratorContractAddress: KLEROS_LIQUID_MAINNET,
      arbitratorJsonRpcUrl: "",
      arbitratorChainID: "1",
      arbitrableContractAddress: NOT_ALLOWLISTED,
      arbitrableChainID: "1",
      arbitrableJsonRpcUrl: "",
      jsonRpcUrl: "",
    });
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
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}`, arbitrableChainID: { status: "valid", chainId: 100 } });
    expect(buildEvidenceDisplay(input({ metaEvidence, arbitrable: ALLOWLISTED_ON_100 }))?.sandbox).toEqual(RELAXED);
  });

  it("falls back to the arbitrator chain for an arbitrableChainID that is not a positive integer", () => {
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}`, arbitrableChainID: { status: "invalid" } });
    expect(buildEvidenceDisplay(input({ metaEvidence, arbitrable: ALLOWLISTED_ON_100 }))?.sandbox).toEqual(["allow-scripts"]);
    expect(buildEvidenceDisplay(input({ metaEvidence, arbitrable: ALLOWLISTED_ON_1 }))?.sandbox).toEqual(RELAXED);
  });

  it.each([10, 690])("gives allow-scripts only for unconfigured arbitrable chain %i, even to an arbitrable allowlisted on the arbitrator chain", (chainId) => {
    const metaEvidence = testMetaEvidence({ evidenceDisplayInterfaceURI: `/ipfs/${CID}`, arbitrableChainID: { status: "unsupported", chainId } });
    expect(buildEvidenceDisplay(input({ metaEvidence, arbitrable: ALLOWLISTED_ON_1 }))?.sandbox).toEqual(["allow-scripts"]);
    expect(buildEvidenceDisplay(input({ metaEvidence, arbitrable: ALLOWLISTED_ON_100, arbitratorChainId: 100 }))?.sandbox).toEqual(["allow-scripts"]);
  });

  it("never gives allow-same-origin to a display on the app's own origin", () => {
    const model = buildEvidenceDisplay(withDisplay("https://resolve.kleros.io/display/index.html", { arbitrable: ALLOWLISTED_ON_1 }));
    expect(model?.sandbox).toEqual(["allow-scripts"]);
  });

  it("compares origins, so a gateway display stays relaxed when the app runs elsewhere", () => {
    const model = buildEvidenceDisplay(input({ arbitrable: ALLOWLISTED_ON_1, appOrigin: "https://cdn.kleros.link:8443" }));
    expect(model?.sandbox).toEqual(RELAXED);
  });
});
