import { describe, expect, it } from "vitest";
import type { HttpGet } from "../http";
import { locateMetaEvidence } from "./locator";

const ENV = { REACT_APP_METAEVIDENCE_URL: "https://locator.test/meta-evidence" };

function answering(status: number, body: string, requested: string[] = []): HttpGet {
  return (url) => {
    requested.push(url);
    return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
  };
}

describe("meta-evidence locator (spec 9.1 step 1)", () => {
  it("asks the API with the chain and dispute IDs and returns the URI", async () => {
    const requested: string[] = [];
    const result = await locateMetaEvidence(answering(200, JSON.stringify({ metaEvidenceUri: "/ipfs/QmX/metaEvidence.json" }), requested), ENV, 100, 431n);
    expect(result).toEqual({ status: "uri", uri: "/ipfs/QmX/metaEvidence.json" });
    expect(requested).toEqual(["https://locator.test/meta-evidence?chainId=100&disputeId=431"]);
  });

  it("spec 9.1: an answer without a truthy metaEvidenceUri is missing, whatever its status", async () => {
    expect(await locateMetaEvidence(answering(400, JSON.stringify({ error: "invalid dispute or subgraph error" })), ENV, 1, 99_999n)).toEqual({
      status: "missing",
      detail: "HTTP 400: invalid dispute or subgraph error",
    });
  });

  it("an answer that is not a JSON object is an error", async () => {
    expect(await locateMetaEvidence(answering(200, "<html>"), ENV, 1, 1n)).toMatchObject({ status: "error" });
  });

  it("retries a server error and reports it without the API URL", async () => {
    const requested: string[] = [];
    const result = await locateMetaEvidence(answering(503, "busy", requested), ENV, 1, 1n, { firstBackoffMs: 0 });
    expect(requested).toHaveLength(4);
    expect(result).toEqual({ status: "error", detail: "The meta-evidence API did not answer: HTTP 503." });
  });

  it("fails clearly without REACT_APP_METAEVIDENCE_URL", async () => {
    expect(await locateMetaEvidence(answering(200, "{}"), {}, 1, 1n)).toEqual({ status: "error", detail: "REACT_APP_METAEVIDENCE_URL is not set." });
  });
});
