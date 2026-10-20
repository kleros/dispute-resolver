import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INVALID_META_EVIDENCE, LOCATOR_COMPARE_GRACE_MS, ON_CHAIN_WAIT_MS, loadMetaEvidence } from "./index";
import {
  FIXTURE,
  GATEWAY,
  HANG,
  META_CID,
  META_URL,
  context,
  eventFound,
  fakeFetcher,
  fakeOnChain,
  json,
  locatorUrl,
  servedMetaEvidence,
  settle,
} from "../test/metaEvidence/testHelpers";
import type { Address } from "../types";
import type { OnChainMetaEvidence } from "./types";

const GNOSIS_460 = FIXTURE.gnosis460;
const GNOSIS_460_LOCATOR = locatorUrl(100, 460n);
const GNOSIS_460_EVENT_URL = `${GATEWAY}${GNOSIS_460.eventMetaEvidenceUri}`;
const GNOSIS_460_LOCATOR_FILE_URL = `${GATEWAY}${GNOSIS_460.locatorMetaEvidenceUri}`;
const [, GNOSIS_863_LATEST_URI] = FIXTURE.gnosis863.recordedEventUris;
const CANONICAL_META = `/ipfs/${META_CID}`;
const LOCATOR_1684 = locatorUrl(1, 1684n);
const PLAIN = json({ title: "Plain dispute", rulingOptions: { type: "single-select", titles: ["A", "B"] } });

/** The Gnosis 460 case: the locator names another arbitrable's file, the gateway serves only the chain's. */
function gnosis460(onChain: OnChainMetaEvidence) {
  const { fetcher, urls } = fakeFetcher({
    [GNOSIS_460_LOCATOR]: json({ metaEvidenceUri: GNOSIS_460.locatorMetaEvidenceUri }),
    [GNOSIS_460_EVENT_URL]: GNOSIS_460.eventMetaEvidenceBody,
  });
  const reader = fakeOnChain(onChain);
  const load = loadMetaEvidence(context({ arbitratorChainId: 100, disputeId: 460n, arbitrable: GNOSIS_460.arbitrable as Address, fetcher, onChain: reader.reader }));
  return { load, urls, reader };
}

describe("meta-evidence from the chain (P-25)", () => {
  it("P-25: the on-chain URI wins over the locator's: Gnosis 460 renders QmbtSnH8... while the locator serves QmPMaPs...", async () => {
    const { load, urls, reader } = gnosis460(eventFound(GNOSIS_460.eventMetaEvidenceUri));
    const result = await load;
    expect(result).toMatchObject({
      status: "ok",
      uri: GNOSIS_460.eventMetaEvidenceUri,
      fileUrl: GNOSIS_460_EVENT_URL,
      metaEvidence: { title: "DAI token compliance Review ", rulingOptions: { titles: ["Yes, Accept DAI", "No, Reject DAI"] } },
      script: { ran: false, reason: "script-fetch-failed" },
    });
    expect(result.status === "ok" && result.source).toEqual({ kind: "event", locator: "disagrees", locatorPath: GNOSIS_460.locatorMetaEvidenceUri });
    expect(urls).toContain(GNOSIS_460_LOCATOR);
    expect(urls).toContain(GNOSIS_460_EVENT_URL);
    expect(urls).not.toContain(GNOSIS_460_LOCATOR_FILE_URL);
    expect(urls.some((url) => url.includes("QmPMaPs"))).toBe(false);
    expect(urls).toContain(`${GATEWAY}/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj`);
    expect(reader.signals).toHaveLength(1);
    expect(reader.signals[0]?.aborted).toBe(true);
  });

  it("P-25: event and locator agree across spellings (ipfs://CID/x vs /ipfs/CID/x)", async () => {
    const routes = { ...servedMetaEvidence(PLAIN, { uri: `${CANONICAL_META}/metaEvidence.json` }), [`${META_URL}/metaEvidence.json`]: PLAIN };
    const served = fakeFetcher(routes);
    const { reader } = fakeOnChain(eventFound(`ipfs://${META_CID}/metaEvidence.json`));
    const result = await loadMetaEvidence(context({ fetcher: served.fetcher, onChain: reader }));
    expect(result).toMatchObject({ status: "ok", uri: `${CANONICAL_META}/metaEvidence.json`, metaEvidence: { title: "Plain dispute" } });
    expect(result.status === "ok" && result.source).toEqual({ kind: "event", locator: "agrees", locatorPath: `${CANONICAL_META}/metaEvidence.json` });
  });

  it("P-25: without an on-chain reader the locator decides as today, with no extra fetch", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence(PLAIN));
    const result = await loadMetaEvidence(context({ fetcher }));
    expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META, metaEvidence: { title: "Plain dispute" } });
    expect(result.status === "ok" && result.source).toEqual({ kind: "locator", event: "not-read" });
    expect(urls).toEqual([LOCATOR_1684, META_URL]);
  });

  it("P-25: an event that is not found, ambiguous or unavailable leaves the locator in charge and records why", async () => {
    const answers: [OnChainMetaEvidence, string][] = [
      [{ status: "not-found", reason: "dispute-event-not-found" }, "dispute-event-not-found"],
      [{ status: "not-found", reason: "dispute-event-ambiguous" }, "dispute-event-ambiguous"],
      [{ status: "not-found", reason: "meta-evidence-event-not-found" }, "meta-evidence-event-not-found"],
      [{ status: "unavailable", error: { code: "rpc-error", message: "Could not read the MetaEvidence event." } }, "unavailable"],
    ];
    for (const [answer, event] of answers) {
      const { fetcher, urls } = fakeFetcher(servedMetaEvidence(PLAIN));
      const { reader, signals } = fakeOnChain(answer);
      const result = await loadMetaEvidence(context({ fetcher, onChain: reader }));
      expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META, metaEvidence: { title: "Plain dispute" } });
      expect(result.status === "ok" && result.source).toEqual({ kind: "locator", event });
      expect(urls).toEqual([LOCATOR_1684, META_URL]);
      expect(signals).toHaveLength(1);
    }
  });

  it("P-25: a reader that rejects is unavailable, never a retried transient", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence(PLAIN));
    const { reader, signals } = fakeOnChain(new Error("https://rpc.example/v3/SECRET-KEY exploded"));
    const result = await loadMetaEvidence(context({ fetcher, onChain: reader }));
    expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META });
    expect(result.status === "ok" && result.source).toEqual({ kind: "locator", event: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("SECRET-KEY");
    expect(urls).toEqual([LOCATOR_1684, META_URL]);
    expect(signals).toHaveLength(1);
  });

  it("P-25: the locator still answers missing as today when the event is not found", async () => {
    const { fetcher } = fakeFetcher({ [LOCATOR_1684]: json({}) });
    const { reader } = fakeOnChain({ status: "not-found", reason: "meta-evidence-event-not-found" });
    expect(await loadMetaEvidence(context({ fetcher, onChain: reader }))).toEqual({ status: "missing" });
  });

  it("P-25, A2: the content-addressing check applies to the winning URI: Gnosis 863's on-chain https URL yields the placeholder even though the locator's URI is content-addressed, with no gateway fetch", async () => {
    const locator = locatorUrl(100, 863n);
    const { fetcher, urls } = fakeFetcher({ [locator]: json({ metaEvidenceUri: CANONICAL_META }), [META_URL]: PLAIN });
    const { reader } = fakeOnChain(eventFound(GNOSIS_863_LATEST_URI ?? ""));
    const result = await loadMetaEvidence(context({ arbitratorChainId: 100, disputeId: 863n, arbitrable: FIXTURE.gnosis863.arbitrable as Address, fetcher, onChain: reader }));
    expect(GNOSIS_863_LATEST_URI?.startsWith("https://")).toBe(true);
    expect(result).toEqual({ status: "invalid", metaEvidence: INVALID_META_EVIDENCE, reason: "uri-not-content-addressed" });
    expect(urls).toEqual([locator]);
  });

  it("P-25, A2: an on-chain CID wins over a locator /ipns/ URI and renders", async () => {
    const { fetcher, urls } = fakeFetcher({ [LOCATOR_1684]: json({ metaEvidenceUri: "/ipns/kleros.eth/metaEvidence.json" }), [META_URL]: PLAIN });
    const { reader } = fakeOnChain(eventFound(CANONICAL_META));
    const result = await loadMetaEvidence(context({ fetcher, onChain: reader }));
    expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META, metaEvidence: { title: "Plain dispute" } });
    expect(result.status === "ok" && result.source).toEqual({ kind: "event", locator: "disagrees", locatorPath: null });
    expect(urls).toEqual([LOCATOR_1684, META_URL]);
  });

  it("P-25: the event wins when the locator has no metaEvidenceUri (missing) and when it answers garbage (unavailable), without a retry", async () => {
    const cases: [string, string][] = [
      [json({}), "missing"],
      ["<html>502 Bad Gateway</html>", "unavailable"],
      [json(null), "unavailable"],
    ];
    for (const [answer, locator] of cases) {
      const { fetcher, urls } = fakeFetcher({ [LOCATOR_1684]: answer, [META_URL]: PLAIN });
      const { reader } = fakeOnChain(eventFound(CANONICAL_META));
      const result = await loadMetaEvidence(context({ fetcher, onChain: reader }));
      expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META, metaEvidence: { title: "Plain dispute" } });
      expect(result.status === "ok" && result.source).toEqual({ kind: "event", locator, locatorPath: null });
      expect(urls.filter((url) => url === LOCATOR_1684)).toHaveLength(1);
    }
  });

  it("P-25: with the locator unconfigured, a found event still renders and the locator is recorded unavailable", async () => {
    const { fetcher, urls } = fakeFetcher({ [META_URL]: PLAIN });
    const { reader } = fakeOnChain(eventFound(CANONICAL_META));
    const result = await loadMetaEvidence(context({ env: {}, fetcher, onChain: reader }));
    expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META, metaEvidence: { title: "Plain dispute" } });
    expect(result.status === "ok" && result.source).toEqual({ kind: "event", locator: "unavailable", locatorPath: null });
    expect(urls).toEqual([META_URL]);
  });

  it("P-25: with the locator unconfigured and no event, today's configuration failure is returned at once", async () => {
    const unconfigured = {
      status: "failed",
      reason: "locator-error",
      error: { code: "unsupported", message: "No meta-evidence API is configured (REACT_APP_METAEVIDENCE_URL)." },
    };
    const absent = fakeFetcher({});
    expect(await loadMetaEvidence(context({ env: {}, fetcher: absent.fetcher }))).toEqual(unconfigured);
    expect(absent.urls).toEqual([]);

    const notFound = fakeFetcher({});
    const { reader, signals } = fakeOnChain({ status: "not-found", reason: "meta-evidence-event-not-found" });
    expect(await loadMetaEvidence(context({ env: {}, fetcher: notFound.fetcher, onChain: reader }))).toEqual(unconfigured);
    expect(notFound.urls).toEqual([]);
    expect(signals).toHaveLength(1);
  });
});

describe("meta-evidence from the chain within the budget (P-25, D-38)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("P-25, D-38: the waits are 30 s for the chain and 5 s for the locator's comparison", () => {
    expect(ON_CHAIN_WAIT_MS).toBe(30_000);
    expect(LOCATOR_COMPARE_GRACE_MS).toBe(5_000);
  });

  it("P-25, D-38: the on-chain read happens once per load, not once per retry attempt", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence([{ status: 504, body: "Gateway Timeout" }, PLAIN]));
    const { reader, signals } = fakeOnChain(eventFound(CANONICAL_META));
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, onChain: reader })), 20_000);
    expect(result).toMatchObject({ status: "ok", metaEvidence: { title: "Plain dispute" }, source: { kind: "event", locator: "agrees" } });
    expect(signals).toHaveLength(1);
    expect(urls.filter((url) => url === META_URL)).toHaveLength(2);
    expect(elapsedMs).toBe(5_000);
  });

  it("P-25, D-38: a locator that never answers holds a found event at most 5 s, and its request is aborted", async () => {
    const { fetcher, urls, inits } = fakeFetcher({ [LOCATOR_1684]: HANG, [META_URL]: PLAIN });
    const { reader } = fakeOnChain(eventFound(CANONICAL_META));
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, onChain: reader })), 20_000);
    expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META, source: { kind: "event", locator: "unavailable", locatorPath: null } });
    expect(elapsedMs).toBe(LOCATOR_COMPARE_GRACE_MS);
    expect(urls).toEqual([LOCATOR_1684, META_URL]);
    expect(inits[0]?.signal?.aborted).toBe(true);
  });

  it("P-25, D-38: an on-chain reader that never answers gives way to the locator after ON_CHAIN_WAIT_MS, and its signal is aborted", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence(PLAIN));
    const { reader, signals } = fakeOnChain(HANG);
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, onChain: reader })), 60_000);
    expect(result).toMatchObject({ status: "ok", uri: CANONICAL_META, source: { kind: "locator", event: "unavailable" } });
    expect(elapsedMs).toBe(ON_CHAIN_WAIT_MS);
    expect(signals[0]?.aborted).toBe(true);
    expect(urls).toEqual([LOCATOR_1684, META_URL]);
  });

  it("P-25: aborting the load aborts the reader and the locator request", async () => {
    const controller = new AbortController();
    const { fetcher, inits } = fakeFetcher({ [LOCATOR_1684]: HANG });
    const { reader, signals } = fakeOnChain(HANG);
    const load = loadMetaEvidence(context({ fetcher, onChain: reader, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signals[0]?.aborted).toBe(false);
    controller.abort();
    const { result, elapsedMs } = await settle(load, 0);
    expect(result).toMatchObject({ status: "failed", reason: "locator-error" });
    expect(elapsedMs).toBe(0);
    expect(signals[0]?.aborted).toBe(true);
    expect(inits[0]?.signal?.aborted).toBe(true);
  });
});
