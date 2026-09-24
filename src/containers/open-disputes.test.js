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
let fixtureVariant;

beforeEach(() => {
  fixtureVariant = process.env.REACT_APP_FIXTURE_VARIANT;
  delete process.env.REACT_APP_FIXTURE_VARIANT;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  jest.restoreAllMocks();
  if (fixtureVariant === undefined) delete process.env.REACT_APP_FIXTURE_VARIANT;
  else process.env.REACT_APP_FIXTURE_VARIANT = fixtureVariant;
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

  it("shows a clear message when the status filter has no disputes and no search is active", async () => {
    await renderPage(GNOSIS, {
      getOpenDisputesOnCourtCallback: jest.fn(() => Promise.resolve(["1005"])),
    });

    await selectStatusFilter("Voting");

    expect(visibleDisputeIDs()).toEqual([]);
    expect(container.textContent).toContain("No disputes in the Voting period.");
    expect(hasNoMatchMessage()).toBe(false);
    expect(hasNoDisputesMessage()).toBe(false);

    await search("1005");

    expect(hasNoMatchMessage()).toBe(true);
    expect(container.textContent).not.toContain("No disputes in the Voting period.");

    for (const value of ["", "   "]) {
      await search(value);

      expect(container.textContent).toContain("No disputes in the Voting period.");
      expect(hasNoMatchMessage()).toBe(false);
    }

    await selectStatusFilter("Ongoing");

    expect(visibleDisputeIDs()).toEqual(["1005"]);
    expect(container.textContent).not.toContain("No disputes in the Voting period.");
    expect(hasNoMatchMessage()).toBe(false);
    expect(hasNoDisputesMessage()).toBe(false);
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


describe("Ongoing disputes resilience and states", () => {
  it("preserves the ID, title, status, court, countdown and destination on every card", async () => {
    await renderPage(GNOSIS);

    for (const disputeId of GNOSIS_DISPUTES) {
      const details = await fixtures.getArbitratorDispute(GNOSIS, disputeId);
      const metaEvidence = await fixtures.getMetaEvidence(GNOSIS, disputeId);
      const { subcourtDetails } = await fixtures.getSubcourtData(GNOSIS);
      const link = container.querySelector(`a[href="/100/cases/${disputeId}"]`);
      expect(link.querySelector(".disputeID").textContent).toBe(disputeId);
      expect(link.querySelector("h2").textContent).toBe(metaEvidence.title);
      expect(link.querySelector(".status").textContent).toBe(["Evidence Period", "Commit Period", "Voting", "Appeal"][details.period]);
      expect(link.textContent).toContain(subcourtDetails[details.subcourtID].name);
      expect(link.querySelector(".countdown").textContent).toMatch(/\d+d \d{2}h \d{2}m/);
    }
  });

  it("renders the malformed fixture with a placeholder alongside all eight valid disputes", async () => {
    process.env.REACT_APP_FIXTURE_VARIANT = "malformed";
    await renderPage(GNOSIS);

    expect(visibleDisputeIDs()).toEqual([malformedDispute.disputeId, ...GNOSIS_DISPUTES]);
    const malformedCard = container.querySelector(`a[href="/100/cases/${malformedDispute.disputeId}"]`);
    expect(malformedCard.textContent).toContain("Title unavailable");
    expect(malformedCard.textContent).toContain("The meta-evidence title could not be read.");
    expect(malformedCard.textContent).toContain("Evidence Period");

    await search("title unavailable");
    expect(visibleDisputeIDs()).toEqual([malformedDispute.disputeId]);
    await search("999999");
    expect(visibleDisputeIDs()).toEqual([malformedDispute.disputeId]);
    await selectStatusFilter("Appeal");
    expect(hasNoMatchMessage()).toBe(true);

    await act(async () => {
      Simulate.click(container.querySelector(".clearFilters"));
    });
    expect(visibleDisputeIDs()).toEqual([malformedDispute.disputeId, ...GNOSIS_DISPUTES]);
  });

  it.each([null, "", 42, ["invalid"], { en: "invalid" }])("handles an unusable meta-evidence title: %p", async title => {
    await renderPage(GNOSIS, {
      getMetaEvidenceCallback: jest.fn((arbitrated, disputeId) => disputeId === "1005" ? Promise.resolve({ title }) : fixtures.getMetaEvidence(GNOSIS, disputeId)),
    });
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
    const card = container.querySelector('a[href="/100/cases/1005"]');
    expect(card.querySelector("h2").textContent).toBe(title == null ? "Meta Evidence Missing" : "Title unavailable");
    expect(card.querySelector(".placeholder")).not.toBeNull();
  });

  it("keeps valid cards visible when meta-evidence or dispute detail requests fail", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await renderPage(GNOSIS, {
      getMetaEvidenceCallback: jest.fn((arbitrated, disputeId) => disputeId === "1005" ? Promise.reject(new Error("Missing meta-evidence")) : fixtures.getMetaEvidence(GNOSIS, disputeId)),
      getArbitratorDisputeCallback: jest.fn(disputeId => disputeId === "1013" ? Promise.reject(new Error("Missing details")) : fixtures.getArbitratorDispute(GNOSIS, disputeId)),
    });

    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
    expect(container.querySelector('a[href="/100/cases/1005"]').textContent).toContain("Meta Evidence Missing");
    expect(container.querySelector('a[href="/100/cases/1013"]').textContent).toContain("Status unavailable");
    expect(container.querySelector('a[href="/100/cases/1013"]').textContent).toContain("Court unavailable");
    expect(container.textContent).not.toContain("Failed to load disputes.");
  });

  it("handles unknown courts, periods and missing timings without crashing", async () => {
    await renderPage(GNOSIS, {
      getArbitratorDisputeCallback: jest.fn(async disputeId => {
        const details = await fixtures.getArbitratorDispute(GNOSIS, disputeId);
        return disputeId === "1005" ? { ...details, subcourtID: "9999", period: "__proto__", lastPeriodChange: "invalid" } : details;
      }),
    });
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
    const card = container.querySelector('a[href="/100/cases/1005"]');
    expect(card.textContent).toContain("Court unavailable");
    expect(card.textContent).toContain("Status unavailable");
    expect(card.querySelector(".countdown > span").textContent).toBe("Unavailable");
  });

  it("shows an accessible loading state until the data has arrived", async () => {
    let resolveDisputes;
    const pendingDisputes = new Promise(resolve => { resolveDisputes = resolve; });
    await act(async () => {
      ReactDOM.render(<OpenDisputes network={MAINNET} getOpenDisputesOnCourtCallback={() => pendingDisputes} />, container);
    });
    expect(container.querySelector('[role="status"]').textContent).toContain("Loading disputes");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(hasNoDisputesMessage()).toBe(false);
    await act(async () => { resolveDisputes([]); });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(hasNoDisputesMessage()).toBe(true);
  });

  it("distinguishes errors from empty results and lets the user retry", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const getOpenDisputesOnCourtCallback = jest.fn()
      .mockRejectedValueOnce(new Error("RPC unavailable"))
      .mockImplementation(() => fixtures.getOpenDisputesOnCourt(GNOSIS));
    await renderPage(GNOSIS, { getOpenDisputesOnCourtCallback });
    expect(container.querySelector('[role="alert"]').textContent).toContain("Failed to load disputes.");
    expect(hasNoDisputesMessage()).toBe(false);
    await act(async () => { Simulate.click(container.querySelector('[role="alert"] button')); });
    await waitFor(() => container.querySelector('[role="status"]') === null);
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("ignores an earlier network request that finishes after the current request", async () => {
    let resolveOldRequest;
    const oldRequest = new Promise(resolve => { resolveOldRequest = resolve; });
    const { subcourts, subcourtDetails } = await fixtures.getSubcourtData(GNOSIS);
    const props = {
      subcourts,
      subcourtDetails,
      getArbitratorDisputeCallback: disputeId => fixtures.getArbitratorDispute(GNOSIS, disputeId),
      getMetaEvidenceCallback: (arbitrated, disputeId) => fixtures.getMetaEvidence(GNOSIS, disputeId),
    };
    await act(async () => {
      ReactDOM.render(<OpenDisputes {...props} network={MAINNET} getOpenDisputesOnCourtCallback={() => oldRequest} />, container);
    });
    await act(async () => {
      ReactDOM.render(<OpenDisputes {...props} network={GNOSIS} getOpenDisputesOnCourtCallback={() => fixtures.getOpenDisputesOnCourt(GNOSIS)} />, container);
    });
    await waitFor(() => visibleDisputeIDs().length === GNOSIS_DISPUTES.length);
    await act(async () => { resolveOldRequest([]); });
    expect(visibleDisputeIDs()).toEqual(GNOSIS_DISPUTES);
    expect(hasNoDisputesMessage()).toBe(false);
  });
});
