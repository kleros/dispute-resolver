import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import OpenDisputes, { disputeMatchesSearch } from "./open-disputes";
import * as fixtures from "../fixtures";
import malformedDispute from "../fixtures/ongoing/100.malformed.json";

const GNOSIS = "100";
const MAINNET = "1";
//The Gnosis fixture disputes in the order the page lists them (newest first).
const GNOSIS_DISPUTES = ["1013", "1012", "1011", "1010", "1009", "1008", "1007", "1005"];

let container;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

//Polls until the condition holds, letting the fixture reads and the React updates settle in between.
const waitFor = async (condition, timeoutMs = 5000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for the page to settle.");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
};

//Renders the page against the fixture of the given chain and resolves once loading has finished.
const renderPage = async (chainId, overrides = {}) => {
  const callbacks = {
    getOpenDisputesOnCourtCallback: jest.fn(() => fixtures.getOpenDisputesOnCourt(chainId)),
    getArbitratorDisputeCallback: jest.fn((disputeId) => fixtures.getArbitratorDispute(chainId, disputeId)),
    getMetaEvidenceCallback: jest.fn((arbitrated, disputeId) => fixtures.getMetaEvidence(chainId, disputeId)),
    ...overrides,
  };
  const { subcourts, subcourtDetails } = await fixtures.getSubcourtData(chainId);

  await act(async () => {
    ReactDOM.render(<OpenDisputes network={chainId} subcourts={subcourts} subcourtDetails={subcourtDetails} {...callbacks} />, container);
  });
  await waitFor(() => container.querySelector('[role="status"]') === null);

  return callbacks;
};

const visibleDisputeIDs = () => Array.from(container.querySelectorAll(".disputeID")).map((node) => node.textContent);
const searchInput = () => container.querySelector("#ongoing-search");
const hasNoMatchMessage = () => container.textContent.includes("No disputes match your search.");
const hasNoDisputesMessage = () => container.textContent.includes("There are no open disputes.");
const callCounts = (callbacks) => Object.fromEntries(Object.entries(callbacks).map(([name, callback]) => [name, callback.mock.calls.length]));

const search = async (value) => {
  await act(async () => {
    Simulate.change(searchInput(), { target: { value } });
  });
};

const selectStatusFilter = async (name) => {
  await act(async () => {
    Simulate.click(container.querySelector("#dropdown-basic-button"));
  });
  const item = Array.from(container.querySelectorAll(".dropdown-item")).find((node) => node.textContent === name);
  await act(async () => {
    Simulate.click(item);
  });
};

describe("Ongoing disputes search", () => {
  it("lists every open dispute until something is typed", async () => {
    await renderPage(GNOSIS);

    expect(searchInput()).not.toBeNull();
    expect(searchInput().value).toBe("");
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
  });

  it("shows only the dispute whose full number is typed", async () => {
    await renderPage(GNOSIS);

    await search("1007");

    expect(visibleDisputeIDs()).toEqual(["1007"]);
    expect(hasNoMatchMessage()).toBe(false);
  });

  it("matches part of a dispute ID", async () => {
    await renderPage(GNOSIS);

    await search("101");

    expect(visibleDisputeIDs()).toEqual(["1013", "1012", "1011", "1010"]);
  });

  it("matches part of a title", async () => {
    await renderPage(GNOSIS);

    await search("token");
    expect(visibleDisputeIDs()).toEqual(["1012", "1010"]);

    await search("address tags");
    expect(visibleDisputeIDs()).toEqual(["1013", "1005"]);
  });

  it("matches part of a court name", async () => {
    await renderPage(GNOSIS);

    await search("javascript");
    expect(visibleDisputeIDs()).toEqual(["1005"]);

    await search("curation");
    expect(visibleDisputeIDs()).toEqual(["1013", "1012", "1010"]);
  });

  it("ignores case", async () => {
    await renderPage(GNOSIS);

    await search("HUMANITY");
    expect(visibleDisputeIDs()).toEqual(["1011", "1009", "1008", "1007"]);

    await search("pRoOf Of HuMaNiTy");
    expect(visibleDisputeIDs()).toEqual(["1011", "1009", "1008", "1007"]);

    await search("JAVASCRIPT COURT");
    expect(visibleDisputeIDs()).toEqual(["1005"]);
  });

  it("restores the full list when the search is cleared", async () => {
    await renderPage(GNOSIS);

    await search("1007");
    expect(visibleDisputeIDs()).toEqual(["1007"]);

    await search("");
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);

    await search("   ");
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
  });

  it("shows a clear message when nothing matches", async () => {
    await renderPage(GNOSIS);

    await search("does not exist");

    expect(visibleDisputeIDs()).toEqual([]);
    expect(hasNoMatchMessage()).toBe(true);
    expect(container.textContent).toContain('No dispute ID, title or court among the open disputes contains "does not exist".');
    expect(hasNoDisputesMessage()).toBe(false);

    await search("");

    expect(hasNoMatchMessage()).toBe(false);
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
  });

  it("does not fetch again while typing or clearing", async () => {
    const callbacks = await renderPage(GNOSIS);
    const countsAfterLoad = callCounts(callbacks);
    expect(countsAfterLoad).toEqual({
      getOpenDisputesOnCourtCallback: 1,
      getArbitratorDisputeCallback: GNOSIS_DISPUTES.length,
      getMetaEvidenceCallback: GNOSIS_DISPUTES.length,
    });

    for (const value of ["1", "10", "1007", "", "humanity", "nothing here", ""]) {
      await search(value);
    }
    await waitFor(() => visibleDisputeIDs().length === GNOSIS_DISPUTES.length);

    expect(callCounts(callbacks)).toEqual(countsAfterLoad);
  });

  it("keeps working after changing the status filter", async () => {
    await renderPage(GNOSIS);

    await selectStatusFilter("Appeal");
    expect(visibleDisputeIDs()).toEqual(["1009", "1008", "1007", "1005"]);

    await search("1005");
    expect(visibleDisputeIDs()).toEqual(["1005"]);

    //1010 is open but in the Commit period, so it is outside the Appeal filter.
    await search("1010");
    expect(visibleDisputeIDs()).toEqual([]);
    expect(hasNoMatchMessage()).toBe(true);
    expect(container.textContent).toContain('among the disputes in the Appeal period contains "1010".');

    await selectStatusFilter("Ongoing");
    expect(visibleDisputeIDs()).toEqual(["1010"]);
    expect(hasNoMatchMessage()).toBe(false);

    await search("");
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
  });

  it("does nothing when there are no open disputes", async () => {
    const callbacks = await renderPage(MAINNET);
    const countsAfterLoad = callCounts(callbacks);
    expect(countsAfterLoad.getOpenDisputesOnCourtCallback).toBe(1);
    expect(hasNoDisputesMessage()).toBe(true);

    await search("1005");

    expect(visibleDisputeIDs()).toEqual([]);
    expect(hasNoDisputesMessage()).toBe(true);
    expect(hasNoMatchMessage()).toBe(false);

    await search("");

    expect(hasNoDisputesMessage()).toBe(true);
    expect(hasNoMatchMessage()).toBe(false);
    expect(callCounts(callbacks)).toEqual(countsAfterLoad);
  });

  it("searches the placeholder title of a dispute whose meta-evidence is missing", async () => {
    await renderPage(GNOSIS, {
      getMetaEvidenceCallback: jest.fn((arbitrated, disputeId) => (disputeId === "1005" ? Promise.resolve(null) : fixtures.getMetaEvidence(GNOSIS, disputeId))),
    });

    await search("meta evidence missing");
    expect(visibleDisputeIDs()).toEqual(["1005"]);

    await search("address tags");
    expect(visibleDisputeIDs()).toEqual(["1013"]);
  });
});

describe("disputeMatchesSearch", () => {
  it("treats an empty or blank query as a match", () => {
    expect(disputeMatchesSearch("", "1005", "Some title", "Some court")).toBe(true);
    expect(disputeMatchesSearch("   ", "1005", "Some title", "Some court")).toBe(true);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(disputeMatchesSearch("  SOME TITLE ", "1005", "Some title", "Some court")).toBe(true);
    expect(disputeMatchesSearch(" court ", "1005", "Some title", "Some court")).toBe(true);
    expect(disputeMatchesSearch("other", "1005", "Some title", "Some court")).toBe(false);
  });

  it("never throws on non-standard disputes and only matches their string fields", () => {
    const { disputeId, metaEvidence } = malformedDispute;

    expect(typeof metaEvidence.title).toBe("object");
    expect(disputeMatchesSearch("non-standard", disputeId, metaEvidence.title, undefined)).toBe(false);
    expect(disputeMatchesSearch("9999", disputeId, metaEvidence.title, undefined)).toBe(true);
    expect(disputeMatchesSearch("court", 42, null, undefined)).toBe(false);
    expect(disputeMatchesSearch("42", 42, null, undefined)).toBe(true);
  });
});
