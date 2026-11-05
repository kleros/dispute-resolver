import { describe, expect, it } from "vitest";
import { realityQuestionCacheKey } from "../reality";
import { REGISTRY, getRealityProxy, toRegistryAddress } from "../registry";
import type { RealityProxyEntry } from "../registry/types";
import type { Address } from "../types";
import { INVALID_META_EVIDENCE, loadMetaEvidence, metaEvidenceLocatorUrl } from "./index";
import {
  CROSS_CHAIN_PROXY,
  DEFAULT_SCRIPT_CID,
  DEFAULT_SCRIPT_URL,
  FIXTURE,
  GATEWAY,
  LOCATOR,
  META_CID,
  META_URL,
  SINGLE_CHAIN_PROXY,
  UNUSED_RUNNER,
  boolQuestion,
  context,
  fakeFetcher,
  fakeRunner,
  json,
  locatorUrl,
  realityCache,
  scriptOk,
  servedMetaEvidence,
} from "../test/metaEvidence/testHelpers";

const PLAIN = json({ title: "Plain dispute", rulingOptions: { type: "single-select", titles: ["A", "B"] } });

function proxyEntry(proxy: Address): RealityProxyEntry {
  const entry = getRealityProxy(REGISTRY, 1, proxy);
  if (entry === undefined) throw new Error(`${proxy} is not registered on mainnet`);
  return entry;
}

describe("metaEvidenceLocatorUrl", () => {
  it("the meta-evidence URI is read from the configured meta-evidence API", () => {
    expect(metaEvidenceLocatorUrl({ REACT_APP_METAEVIDENCE_URL: LOCATOR }, 100, 863n)).toBe(`${LOCATOR}?chainId=100&disputeId=863`);
    expect(metaEvidenceLocatorUrl({ REACT_APP_METAEVIDENCE_URL: ` ${LOCATOR} ` }, 1, 0n)).toBe(`${LOCATOR}?chainId=1&disputeId=0`);
  });

  it("no locator without a configured API", () => {
    expect(metaEvidenceLocatorUrl({}, 1, 1n)).toBeNull();
    expect(metaEvidenceLocatorUrl({ REACT_APP_METAEVIDENCE_URL: "  " }, 1, 1n)).toBeNull();
  });
});

describe("loadMetaEvidence gating", () => {
  it("a locator answer without metaEvidenceUri is missing, without a retry", async () => {
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: json({}) });
    expect(await loadMetaEvidence(context({ fetcher }))).toEqual({ status: "missing" });
    expect(urls).toEqual([locatorUrl(1, 1684n)]);
  });

  it("an /ipns/ meta-evidence URI yields the placeholder without fetching it", async () => {
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: json({ metaEvidenceUri: "/ipns/kleros.eth/meta.json" }) });
    const result = await loadMetaEvidence(context({ fetcher }));
    expect(result).toEqual({ status: "invalid", metaEvidence: INVALID_META_EVIDENCE, reason: "uri-not-content-addressed" });
    expect(urls).toEqual([locatorUrl(1, 1684n)]);
  });

  it("a registered Reality proxy with an /ipns/ meta-evidence URI still yields the placeholder (URI check first)", async () => {
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: json({ metaEvidenceUri: "/ipns/kleros.eth/meta.json" }) });
    const cache = realityCache({});
    const result = await loadMetaEvidence(context({ fetcher, arbitrable: CROSS_CHAIN_PROXY, realityCache: cache }));
    expect(result).toEqual({ status: "invalid", metaEvidence: INVALID_META_EVIDENCE, reason: "uri-not-content-addressed" });
    expect(urls).toHaveLength(1);
    expect(cache.reads).toHaveLength(0);
  });

  it("mainnet 1684's wallet-hijack script is refused: placeholder, the script never fetched or run", async () => {
    const dispute = FIXTURE.mainnet1684;
    const { fetcher, urls } = fakeFetcher({
      [locatorUrl(1, 1684n)]: json({ metaEvidenceUri: dispute.metaEvidenceUri }),
      [META_URL]: json({ title: "Dispute 1684", rulingOptions: { titles: ["No", "Yes"] }, dynamicScriptURI: `/ipfs/${dispute.dynamicScriptCid}` }),
    });
    const result = await loadMetaEvidence(context({ fetcher, runner: UNUSED_RUNNER }));
    expect(result).toEqual({ status: "invalid", metaEvidence: INVALID_META_EVIDENCE, reason: "script-not-allowlisted" });
    expect(urls).toEqual([locatorUrl(1, 1684n), META_URL]);
  });

  it("a script on a chain without a list is refused", async () => {
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "T", dynamicScriptURI: `/ipfs/${DEFAULT_SCRIPT_CID}` }), { chainId: 137 }));
    expect(await loadMetaEvidence(context({ fetcher, arbitratorChainId: 137 }))).toMatchObject({ status: "invalid", reason: "script-not-allowlisted" });
  });

  it("a script URI that is not content-addressed yields the placeholder", async () => {
    for (const uri of ["https://example.org/script.js", "/ipns/kleros.eth/script.js", `/ipfs/${DEFAULT_SCRIPT_CID}/../../ipns/evil`, 42]) {
      const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "T", dynamicScriptURI: uri })));
      expect(await loadMetaEvidence(context({ fetcher }))).toMatchObject({ status: "invalid", reason: "script-uri-not-content-addressed" });
    }
  });

  it("a registered Reality proxy never runs its script, even one that is not content-addressed or not allowlisted", async () => {
    for (const uri of ["/ipns/kleros.eth/script.js", `/ipfs/${FIXTURE.mainnet1684.dynamicScriptCid}`, `/ipfs/${DEFAULT_SCRIPT_CID}`]) {
      const { fetcher, urls } = fakeFetcher(servedMetaEvidence(json({ title: "Q", question: "From the JSON", dynamicScriptURI: uri })));
      const entry = proxyEntry(SINGLE_CHAIN_PROXY);
      const cache = realityCache({
        [realityQuestionCacheKey(1, entry, 1684n)]: { ...boolQuestion("Will it rain?"), reality: entry.reality, realityChainId: entry.realityChainId },
      });
      const result = await loadMetaEvidence(context({ fetcher, runner: UNUSED_RUNNER, arbitrable: SINGLE_CHAIN_PROXY, realityCache: cache }));
      expect(result).toMatchObject({ status: "ok", script: { ran: false, reason: "registered-reality-proxy" }, metaEvidence: { question: "From the JSON" } });
      expect(urls).toEqual([locatorUrl(1, 1684n), META_URL]);
    }
  });

  it("the allowlisted script is fetched from its normalized path through the gateway, never from the raw URI", async () => {
    const { fetcher, urls } = fakeFetcher({
      ...servedMetaEvidence(json({ title: "T", dynamicScriptURI: ` ipfs://${DEFAULT_SCRIPT_CID}/ ` })),
      [DEFAULT_SCRIPT_URL]: "function getMetaEvidence() {}",
    });
    const { runner, requests } = fakeRunner(scriptOk({}));
    const result = await loadMetaEvidence(context({ fetcher, runner }));
    expect(result).toMatchObject({ status: "ok", script: { ran: true, kind: "standard", jsonDuplicateKeys: false } });
    expect(urls).toEqual([locatorUrl(1, 1684n), META_URL, DEFAULT_SCRIPT_URL]);
    expect(requests[0]?.scriptText).toBe("function getMetaEvidence() {}");
  });

  it("mainnet 1621 runs its own script; the removed override is never fetched", async () => {
    const dispute = FIXTURE.mainnet1621;
    const scriptUrl = `${GATEWAY}${dispute.dynamicScriptURI}`;
    const { fetcher, urls } = fakeFetcher({
      ...servedMetaEvidence(json({ title: "Governor session", dynamicScriptURI: dispute.dynamicScriptURI }), { disputeId: 1621n }),
      [scriptUrl]: "function getMetaEvidence() {}",
    });
    const { runner } = fakeRunner(scriptOk({ rulingOptions: { type: "single-select", titles: ["List 7", "List 8"] } }));
    const result = await loadMetaEvidence(context({ fetcher, runner, disputeId: 1621n, arbitrable: toRegistryAddress(dispute.arbitrable) }));
    expect(result.status === "ok" && result.metaEvidence.rulingOptions).toEqual({ type: "single-select", titles: ["List 7", "List 8"] });
    expect(urls).toContain(scriptUrl);
    expect(urls.join(" ")).not.toContain(dispute.removedOverrideCid);
  });

  it("a script fetch that is not ok yields no merge and no Reality status", async () => {
    const { fetcher } = fakeFetcher({
      ...servedMetaEvidence(json({ title: "T", dynamicScriptURI: `/ipfs/${DEFAULT_SCRIPT_CID}` })),
      [DEFAULT_SCRIPT_URL]: { status: 404, body: "Not Found" },
    });
    const result = await loadMetaEvidence(context({ fetcher, runner: UNUSED_RUNNER }));
    expect(result).toMatchObject({ status: "ok", script: { ran: false, reason: "script-fetch-failed" }, metaEvidence: { title: "T", realityQuestion: null } });
  });

  it("without a dynamic script the meta-evidence is accepted as fetched", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence(PLAIN));
    const result = await loadMetaEvidence(context({ fetcher }));
    expect(result).toEqual({
      status: "ok",
      source: { kind: "locator", event: "not-read" },
      uri: `/ipfs/${META_CID}`,
      fileUrl: META_URL,
      script: { ran: false, reason: "no-script" },
      metaEvidence: expect.objectContaining({ title: "Plain dispute", rulingOptions: { type: "single-select", titles: ["A", "B"] } }) as unknown,
    });
    expect(urls).toEqual([locatorUrl(1, 1684n), META_URL]);
  });

  it("an empty dynamicScriptURI is no script", async () => {
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "T", dynamicScriptURI: "" })));
    expect(await loadMetaEvidence(context({ fetcher }))).toMatchObject({ status: "ok", script: { ran: false, reason: "no-script" } });
  });

  it("the legacy evidenceDisplayInterfaceURL is renamed", async () => {
    const { fetcher } = fakeFetcher(
      servedMetaEvidence(
        json({ title: "T", evidenceDisplayInterfaceURL: "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html", evidenceDisplayInterfaceURI: "/ipfs/old" }),
      ),
    );
    const result = await loadMetaEvidence(context({ fetcher }));
    expect(result.status === "ok" && result.metaEvidence.evidenceDisplayInterfaceURI).toBe("/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html");
  });

  it("rulingOptions without a type default to single-select before the merge", async () => {
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "T", rulingOptions: { type: "", titles: ["A"] } })));
    const result = await loadMetaEvidence(context({ fetcher }));
    expect(result.status === "ok" && result.metaEvidence.rulingOptions).toEqual({ type: "single-select", titles: ["A"] });
    const typed = fakeFetcher(servedMetaEvidence(json({ title: "T", rulingOptions: { type: "multiple-select", titles: ["A", "B"] } })));
    const kept = await loadMetaEvidence(context({ fetcher: typed.fetcher }));
    expect(kept.status === "ok" && kept.metaEvidence.rulingOptions?.type).toBe("multiple-select");
  });

  it("mainnet 560's PDF is failed / not-json, without a retry", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence(FIXTURE.mainnet560.body, { disputeId: 560n }));
    expect(await loadMetaEvidence(context({ fetcher, disputeId: 560n }))).toMatchObject({ status: "failed", reason: "not-json", error: { code: "invalid-data" } });
    expect(urls).toHaveLength(2);
  });

  it("Gnosis 140's unparseable JSON is failed / not-json", async () => {
    const dispute = FIXTURE.gnosis140;
    const { fetcher } = fakeFetcher(servedMetaEvidence(dispute.body, { chainId: 100, disputeId: 140n }));
    expect(await loadMetaEvidence(context({ fetcher, arbitratorChainId: 100, disputeId: 140n }))).toMatchObject({ status: "failed", reason: "not-json" });
  });

  it("a registered proxy's options, status and question come from the on-chain question", async () => {
    const entry = proxyEntry(CROSS_CHAIN_PROXY);
    const cache = realityCache({ [realityQuestionCacheKey(1, entry, 1684n)]: boolQuestion("Will it rain?") });
    const { fetcher } = fakeFetcher(
      servedMetaEvidence(json({ title: "Reality question", question: "From the JSON", dynamicScriptURI: "/ipfs/QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr/bundle.js" })),
    );
    const result = await loadMetaEvidence(context({ fetcher, arbitrable: CROSS_CHAIN_PROXY, realityCache: cache }));
    expect(result).toMatchObject({
      status: "ok",
      source: { kind: "locator", event: "not-read" },
      script: { ran: false, reason: "registered-reality-proxy" },
      metaEvidence: {
        title: "Reality question",
        question: "Will it rain?",
        rulingOptions: { type: "single-select", titles: ["No", "Yes"], reserved: { [`0x${"F".repeat(64)}`]: "Answered Too Soon" } },
        realityQuestion: { status: "verified", divergent: false, title: "Will it rain?", templateId: "0" },
      },
    });
  });

  it("a registered proxy whose template nests deeper than the parser reads gets unresolvable options at once", async () => {
    const entry = proxyEntry(CROSS_CHAIN_PROXY);
    const templateText = `{"title": "%s", "type": "bool", "x": ${"[".repeat(20_000)}${"]".repeat(20_000)}}`;
    const cache = realityCache({ [realityQuestionCacheKey(1, entry, 1684n)]: { ...boolQuestion("Will it rain?"), templateText } });
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "Reality question" })));
    const result = await loadMetaEvidence(context({ fetcher, arbitrable: CROSS_CHAIN_PROXY, realityCache: cache, budgetMs: 1_000 }));
    expect(result).toMatchObject({
      status: "ok",
      metaEvidence: { rulingOptions: { type: "single-select", titles: [] }, realityQuestion: { status: "unresolvable", reason: "invalid-template" } },
    });
  });

  it("a registered proxy whose meta-evidence has neither title nor rulingOptions is not looked up", async () => {
    const cache = realityCache({});
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ description: "No title" })));
    const result = await loadMetaEvidence(context({ fetcher, arbitrable: CROSS_CHAIN_PROXY, realityCache: cache }));
    expect(result).toMatchObject({ status: "ok", metaEvidence: { description: "No title", rulingOptions: null, realityQuestion: null } });
    expect(cache.reads).toHaveLength(0);
  });
});
