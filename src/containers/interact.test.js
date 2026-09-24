import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import { calcTimeDelta, zeroPad } from "react-countdown";
import Interact from "./interact";
import * as fixtures from "../fixtures";
import ongoingGnosis from "../fixtures/ongoing/100.json";
import casesGnosis from "../fixtures/cases/100.json";
import handmadeGnosis from "../fixtures/cases/100.handmade.json";
import malformedDispute from "../fixtures/ongoing/100.malformed.json";

//react-blockies draws the avatar on a canvas, which jsdom does not implement.
jest.mock("react-blockies", () => () => null);

const GNOSIS = "100";
const KLEROS_LIQUID = "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002";
const SIGNED_IN_ADDRESS = "0x1111111111111111111111111111111111111111";
//The fixed clock of the Gnosis fixture: the timestamp of the captured block.
const NOW = casesGnosis.capturedAtTimestamp * 1000;
const GNOSIS_DISPUTES = ["1005", "1007", "1008", "1009", "1010", "1011", "1012", "1013"];
const PERIOD_NAMES = ["Evidence", "Commit", "Voting", "Appeal", "Execution"];

let container;
let originalWrites;

beforeEach(() => {
  originalWrites = process.env.REACT_APP_FIXTURE_WRITES;
  delete process.env.REACT_APP_FIXTURE_WRITES;
  container = document.createElement("div");
  document.body.appendChild(container);
  jest.spyOn(console, "debug").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  jest.restoreAllMocks();
  if (originalWrites === undefined) delete process.env.REACT_APP_FIXTURE_WRITES;
  else process.env.REACT_APP_FIXTURE_WRITES = originalWrites;
});

//Polls until the condition holds, letting the fixture reads and the React updates settle in between.
const waitFor = async (condition, timeoutMs = 5000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for the page to settle.");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
};

const sleep = ms =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });

//The same wiring App uses in fixture mode, so the page reads exactly what the fixture loader returns.
const fixtureCallbacks = chainId => ({
  getArbitratorDisputeCallback: id => fixtures.getArbitratorDispute(chainId, id),
  getArbitrableDisputeIDCallback: (arbitrated, id) => fixtures.getArbitrableDisputeID(chainId, arbitrated, id),
  getMetaEvidenceCallback: async (arbitrated, id) => {
    const metaEvidenceJSON = await fixtures.getMetaEvidence(chainId, id);
    return metaEvidenceJSON ? { metaEvidenceJSON } : null;
  },
  getArbitratorDisputeDetailsCallback: id => fixtures.getArbitratorDisputeDetails(chainId, id),
  getRulingCallback: (arbitrated, id) => fixtures.getRuling(chainId, arbitrated, id),
  getCurrentRulingCallback: id => fixtures.getCurrentRuling(chainId, id),
  getDisputeEventCallback: (arbitrated, id) => fixtures.getDisputeEvent(chainId, arbitrated, id),
  getEvidencesCallback: (arbitrated, id) => fixtures.getEvidences(chainId, arbitrated, id),
  getMultipliersCallback: arbitrated => fixtures.getMultipliers(chainId, arbitrated),
  getAppealDecisionCallback: id => fixtures.getAppealDecisions(chainId, id),
  getContributionsCallback: (localId, round, arbitrated) => fixtures.getContributions(chainId, localId, round, arbitrated),
  getRulingFundedCallback: (localId, round, arbitrated) => fixtures.getRulingFunded(chainId, localId, round, arbitrated),
  getAppealCostCallback: id => fixtures.getAppealCost(chainId, id),
  getAppealPeriodCallback: id => fixtures.getAppealPeriod(chainId, id),
  getTotalWithdrawableAmountCallback: (localId, contributedTo, arbitrated) => fixtures.getTotalWithdrawableAmount(chainId, localId, contributedTo, arbitrated),
  appealCallback: jest.fn(fixtures.appeal),
  submitEvidenceCallback: jest.fn(fixtures.submitEvidence),
  withdrawCallback: jest.fn(fixtures.withdraw),
  publishCallback: jest.fn(fixtures.publish),
  onSignIn: jest.fn(fixtures.signIn),
});

const isSettled = () => container.querySelector('[aria-busy="true"]') === null && container.textContent.trim() !== "";

//Renders the case page inside a router at /<chain>/cases/<id> without waiting for it to load.
const mountCase = async (disputeId, { chainId = GNOSIS, overrides = {}, signedIn = false, history } = {}) => {
  const callbacks = { ...fixtureCallbacks(chainId), ...overrides };
  const memoryHistory = history ?? createMemoryHistory({ initialEntries: [`/${chainId}/cases/${disputeId}`] });
  const { subcourts, subcourtDetails } = await fixtures.getSubcourtData(chainId);

  await act(async () => {
    ReactDOM.render(
      <Router history={memoryHistory}>
        <Route
          path="/:chainId/cases/:id?"
          render={route => (
            <Interact
              route={route}
              network={chainId}
              arbitratorAddress={KLEROS_LIQUID}
              subcourts={subcourts}
              subcourtDetails={subcourtDetails}
              subcourtsLoading={false}
              exceptionalContractAddresses={[]}
              activeAddress={signedIn ? SIGNED_IN_ADDRESS : ""}
              isAuthenticated={signedIn}
              isSigningIn={false}
              web3Provider={null}
              now={() => NOW}
              {...callbacks}
            />
          )}
        />
      </Router>,
      container
    );
  });

  return { callbacks, history: memoryHistory };
};

//Mounts the case page and resolves once the case has loaded (or failed).
const renderCase = async (disputeId, options) => {
  const mounted = await mountCase(disputeId, options);
  await waitFor(isSettled);
  return mounted;
};

const text = () => container.textContent;
const title = () => container.querySelector("h1")?.textContent;
const buttons = label => Array.from(container.querySelectorAll("button")).filter(button => button.textContent.trim() === label);
const currentPeriod = () => container.querySelector(".current")?.textContent ?? null;
const countdown = deadlineSeconds => {
  const delta = calcTimeDelta(deadlineSeconds * 1000, { now: () => NOW });
  return `${zeroPad(delta.days, 2)}d ${zeroPad(delta.hours, 2)}h ${zeroPad(delta.minutes, 2)}m`;
};
//The value of a labelled field; icons are SVG imports, which jest renders as their file name, so the value span is read when there is one.
const fieldText = id => (container.querySelector(`#${id} span`) ?? container.querySelector(`#${id}`))?.textContent.trim();

describe("Captured Gnosis disputes", () => {
  it.each(GNOSIS_DISPUTES)("opens dispute %s with its title, court, votes, period, decision and evidence", async disputeId => {
    await renderCase(disputeId);

    const dispute = ongoingGnosis.arbitratorDisputes[disputeId];
    const metaEvidence = ongoingGnosis.metaEvidence[disputeId];
    const record = casesGnosis.disputes[disputeId];

    expect(title()).toBe(metaEvidence.title);
    expect(fieldText("category")).toBe(`# ${disputeId}`);
    expect(fieldText("initialNumberOfJurors")).toBe(record.disputeDetails.votesLengths[0]);
    expect(fieldText("court")).toBe(ongoingGnosis.subcourtDetails[dispute.subcourtID].name);
    expect(text()).toContain("View mode only");

    const period = Number(dispute.period);
    if (PERIOD_NAMES[period] !== "Commit") expect(currentPeriod()).toContain(PERIOD_NAMES[period]);
    if (period === 3) {
      const decision = metaEvidence.rulingOptions.titles[Number(record.currentRuling) - 1];
      expect(text()).toContain(`Jury decision: ${decision}`);
    } else {
      expect(text()).not.toContain("Jury decision");
    }

    expect(container.querySelectorAll("#evidence-timeline .evidence")).toHaveLength(record.evidences.filter(evidence => evidence.evidenceJSONValid).length);
    expect(text()).toContain(record.evidences[0].evidenceJSON.title ?? record.evidences[0].evidenceJSON.name);
    expect(buttons("Go to Arbitrable Application to Submit Evidence")[0].disabled).toBe(true);
    expect(text()).not.toContain("Unavailable");
  });

  it("freezes every countdown at the fixture clock", async () => {
    await renderCase("1005");
    const dispute = ongoingGnosis.arbitratorDisputes["1005"];
    const record = casesGnosis.disputes["1005"];
    const appealDuration = Number(ongoingGnosis.subcourts[dispute.subcourtID][1][3]);
    const timelineCountdown = countdown(Number(dispute.lastPeriodChange) + appealDuration);
    const winnerDeadline = countdown(Number(record.appealPeriod.end));
    const loserDeadline = countdown(Number(record.appealPeriod.start) + (Number(record.appealPeriod.end) - Number(record.appealPeriod.start)) / 2);

    expect(currentPeriod()).toContain(timelineCountdown);
    expect(text()).toContain(winnerDeadline);
    expect(text()).toContain(loserDeadline);
    expect(winnerDeadline).toBe("00d 09h 39m");

    await sleep(1100);
    expect(currentPeriod()).toContain(timelineCountdown);
    expect(text()).toContain(winnerDeadline);
    expect(text()).toContain(loserDeadline);
  });
});

describe("Hand-made cases", () => {
  it("shows a four-outcome multi-select appeal with partial crowdfunding and lets a signed-in user fund it", async () => {
    const { callbacks } = await renderCase("900001", { signedIn: true });
    const record = handmadeGnosis.disputes["900001"];

    expect(title()).toBe(record.metaEvidence.title);
    expect(text()).toContain("Jury decision: Design / Frontend");
    expect(text()).toContain("Multiple choice: multiple select");
    expect(text()).not.toContain("View mode only");
    expect(fieldText("court")).toBe("xDai General Court");
    expect(text()).toContain("Party 1");
    expect(text()).toContain("Client");

    const cards = Array.from(container.querySelectorAll(".crowdfundingCard"));
    expect(cards).toHaveLength(17);
    expect(cards[0].textContent).toContain("Invalid / Refused to Arbitrate / Tied");
    const winner = cards.find(card => card.textContent.includes("Latest jury decision"));
    expect(winner.textContent).toContain("Design Frontend");
    expect(winner.textContent).toContain("50.00% Funded");
    expect(winner.textContent).toContain("03d 09h 59m");
    expect(cards.find(card => card.textContent.includes("16.66% Funded")).textContent).toContain("Frontend");
    expect(cards.find(card => card.textContent.includes("100.00% Funded")).textContent).toContain("None");
    expect(cards[0].textContent).toContain("01d 03h 59m");

    const submitEvidence = buttons("Submit New Evidence")[0];
    expect(submitEvidence.disabled).toBe(false);
    expect(buttons("Sign in")).toHaveLength(0);

    const fund = buttons("Fund").find(button => !button.disabled);
    await act(async () => {
      Simulate.click(fund);
    });
    await waitFor(() => callbacks.appealCallback.mock.calls.length === 1);
    expect(callbacks.appealCallback).toHaveBeenCalledWith(record.arbitratorDispute.arbitrated, 41n, 0, "9.0");
    await waitFor(isSettled);
    expect(title()).toBe(record.metaEvidence.title);
    expect(cards.length).toBe(17);
  });

  it("shows a free-value question with a card for a new value, the current ruling and other contributions", async () => {
    await renderCase("900002");
    const record = handmadeGnosis.disputes["900002"];

    expect(title()).toBe(record.metaEvidence.title);
    expect(text()).toContain("Non-negative number");
    expect(text()).toContain(record.metaEvidence.question);
    expect(container.querySelector('input[placeholder="Enter a new ruling option"]')).not.toBeNull();

    const cards = Array.from(container.querySelectorAll(".crowdfundingCard"));
    expect(cards.find(card => card.textContent.includes("Latest jury decision")).querySelector("strong").textContent).toBe("42");
    const other = cards.find(card => card.querySelector("strong")?.textContent === "43");
    expect(other.textContent).toContain("16.66% Funded");
    expect(buttons("Sign in")).toHaveLength(1);
  });

  it("keeps the timeline, votes, court and evidence when the meta-evidence is missing", async () => {
    await renderCase("900003");
    const record = handmadeGnosis.disputes["900003"];

    expect(text()).toContain("Failed to load metaevidence, thus the dispute summary.");
    expect(text()).toContain("Question unavailable.");
    expect(currentPeriod()).toContain("Voting");
    expect(currentPeriod()).toContain(countdown(Number(record.arbitratorDispute.lastPeriodChange) + Number(ongoingGnosis.subcourts[0][1][2])));
    expect(fieldText("initialNumberOfJurors")).toBe("3");
    expect(fieldText("court")).toBe("xDai General Court");
    expect(text()).toContain("Statement of the requester");
    expect(text()).not.toContain("View mode only");
  });

  it("renders the malformed dispute without crashing and marks what cannot be read", async () => {
    await renderCase(malformedDispute.disputeId);

    expect(title()).toBe("Title unavailable");
    expect(text()).toContain("Question unavailable.");
    expect(fieldText("category")).toBe(`# ${malformedDispute.disputeId}`);
    expect(fieldText("initialNumberOfJurors")).toBe("Unavailable");
    expect(fieldText("court")).toBe("xDai General Court");
    expect(currentPeriod()).toContain("Evidence");
    expect(text()).toContain("View mode only");
    expect(container.querySelectorAll("#evidence-timeline .evidence")).toHaveLength(1);
    expect(text()).toContain("Title unavailable");
    expect(text()).toContain("Submitted by: Unavailable");
    expect(text()).toContain("Date unavailable");
    expect(text()).toContain("Dispute Raised");
    expect(text()).not.toContain("Jury decision");
  });

  it("says that a non-existent dispute does not exist", async () => {
    await renderCase("123456789");

    expect(text()).toContain("Dispute with ID 123456789 does not exist on this network.");
    expect(buttons("View Ongoing Disputes")).toHaveLength(1);
    expect(text()).not.toContain("Failed to load");
    expect(container.querySelector("main")).toBeNull();
  });
});

describe("Loading", () => {
  //A deferred read: the callback resolves only when the test says so.
  const deferred = () => {
    let resolve;
    const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
    return { callback: jest.fn(() => promise), resolve };
  };

  it("shows the whole case at once when the core reads finish and keeps a placeholder in the appeal card until the crowdfunding reads finish", async () => {
    const record = handmadeGnosis.disputes["900001"];
    const evidences = deferred();
    const appealCost = deferred();
    const appealDecision = { appealedAt: 1789700000, appealedAtBlockNumber: 48306000 };
    await mountCase("900001", {
      overrides: {
        getEvidencesCallback: evidences.callback,
        getAppealCostCallback: appealCost.callback,
        getAppealDecisionCallback: jest.fn(() => Promise.resolve([appealDecision])),
      },
    });
    await sleep(50);

    //While a core read is pending nothing of the case is shown, only the loading status.
    expect(container.querySelector('[role="status"]').textContent).toContain("Fetching dispute #900001");
    expect(title()).toBeUndefined();
    expect(container.querySelector("#category")).toBeNull();
    expect(container.querySelector(".disputeTimeline")).toBeNull();
    expect(text()).not.toContain("View mode only");

    await act(async () => {
      evidences.resolve(await fixtures.getEvidences(GNOSIS, record.arbitratorDispute.arbitrated, "900001"));
    });
    await waitFor(() => title() !== undefined);

    //The summary, the details and the evidence, including the appeal event, arrive in the same render.
    expect(title()).toBe(record.metaEvidence.title);
    expect(fieldText("category")).toBe("# 900001");
    expect(fieldText("initialNumberOfJurors")).toBe("3");
    expect(fieldText("court")).toBe("xDai General Court");
    expect(currentPeriod()).toContain("Appeal");
    expect(text()).toContain("Jury decision: Design / Frontend");
    expect(container.querySelectorAll("#evidence-timeline .evidence")).toHaveLength(2);
    expect(text()).toContain("Appealed");
    expect(text()).toContain(record.metaEvidence.question);
    expect(text()).not.toContain("Fetching dispute");

    //Only the appeal card is still loading, behind its spinner, without any unavailable message.
    expect(container.querySelector('main[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('.card-body [role="status"]')).not.toBeNull();
    expect(container.querySelectorAll(".crowdfundingCard")).toHaveLength(0);
    expect(text()).not.toContain("unavailable");
    expect(text()).not.toContain("Unavailable");

    await act(async () => {
      appealCost.resolve(await fixtures.getAppealCost(GNOSIS, "900001"));
    });
    await waitFor(isSettled);

    expect(container.querySelector('.card-body [role="status"]')).toBeNull();
    expect(container.querySelectorAll(".crowdfundingCard")).toHaveLength(17);
    expect(title()).toBe(record.metaEvidence.title);
  });

  it("waits for the subcourts before showing the details", async () => {
    const callbacks = fixtureCallbacks(GNOSIS);
    const history = createMemoryHistory({ initialEntries: ["/100/cases/900001"] });
    const { subcourts, subcourtDetails } = await fixtures.getSubcourtData(GNOSIS);
    const render = subcourtsLoading =>
      act(async () => {
        ReactDOM.render(
          <Router history={history}>
            <Route
              path="/:chainId/cases/:id?"
              render={route => (
                <Interact route={route} network={GNOSIS} arbitratorAddress={KLEROS_LIQUID} subcourts={subcourtsLoading ? [] : subcourts} subcourtDetails={subcourtsLoading ? [] : subcourtDetails} subcourtsLoading={subcourtsLoading} exceptionalContractAddresses={[]} activeAddress="" isAuthenticated={false} isSigningIn={false} web3Provider={null} now={() => NOW} {...callbacks} />
              )}
            />
          </Router>,
          container
        );
      });

    await render(true);
    await waitFor(isSettled);
    expect(title()).toBe(handmadeGnosis.disputes["900001"].metaEvidence.title);
    expect(container.querySelector("#category")).toBeNull();
    expect(text()).not.toContain("Court unavailable");

    await render(false);
    expect(fieldText("court")).toBe("xDai General Court");
    expect(currentPeriod()).toContain("Appeal");
  });
});

describe("Failures", () => {
  it("shows a failed load as an error distinct from a missing dispute and lets the user retry", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const getArbitratorDisputeCallback = jest.fn().mockRejectedValueOnce(new Error("RPC unavailable")).mockImplementation(id => fixtures.getArbitratorDispute(GNOSIS, id));
    await renderCase("1005", { overrides: { getArbitratorDisputeCallback } });

    const alert = container.querySelector('[role="alert"]');
    expect(alert.textContent).toContain("Failed to load dispute with ID 1005.");
    expect(alert.textContent).toContain("RPC unavailable");
    expect(text()).not.toContain("does not exist");

    await act(async () => {
      Simulate.click(buttons("Try again")[0]);
    });
    await waitFor(() => container.querySelector('[role="alert"]') === null && isSettled());
    expect(title()).toBe(ongoingGnosis.metaEvidence["1005"].title);
  });

  it("degrades each section on its own when its read fails", async () => {
    const rejecting = message => jest.fn(() => Promise.reject(new Error(message)));
    await renderCase("900001", {
      signedIn: true,
      overrides: {
        getEvidencesCallback: rejecting("evidence"),
        getArbitratorDisputeDetailsCallback: rejecting("details"),
        getCurrentRulingCallback: rejecting("ruling"),
        getMultipliersCallback: rejecting("multipliers"),
      },
    });
    const record = handmadeGnosis.disputes["900001"];

    expect(title()).toBe(record.metaEvidence.title);
    expect(fieldText("court")).toBe("xDai General Court");
    expect(fieldText("initialNumberOfJurors")).toBe("Unavailable");
    expect(container.querySelector('[role="alert"]').textContent).toBe("Evidence could not be loaded.");
    expect(text()).toContain("Jury decision unavailable");
    expect(text()).not.toContain("Jury decision:");
    expect(text()).toContain("Appeal fees could not be calculated");
    expect(container.querySelectorAll(".crowdfundingCard")).toHaveLength(0);
    expect(text()).toContain(record.metaEvidence.question);
    expect(text()).not.toContain("% Funded");
  });

  it("does not show appeal amounts when the appeal cost or the appeal history cannot be read", async () => {
    await renderCase("900001", { overrides: { getAppealCostCallback: jest.fn(() => Promise.reject(new Error("cost"))) } });
    expect(text()).toContain("Appeal options unavailable");
    expect(container.querySelectorAll(".crowdfundingCard")).toHaveLength(0);
    expect(text()).toContain("Jury decision: Design / Frontend");

    ReactDOM.unmountComponentAtNode(container);
    await renderCase("900001", { overrides: { getAppealDecisionCallback: jest.fn(() => Promise.reject(new Error("history"))) } });
    expect(text()).toContain("Appeal options unavailable");
    expect(text()).toContain("Appeal history unavailable.");
    expect(container.querySelectorAll("#evidence-timeline .evidence")).toHaveLength(2);
  });

  it("keeps the summary when the dispute struct carries an unreadable period and an unknown court", async () => {
    await renderCase("1005", {
      overrides: {
        getArbitratorDisputeCallback: async id => ({ ...(await fixtures.getArbitratorDispute(GNOSIS, id)), period: "later", subcourtID: "9999", lastPeriodChange: "soon" }),
      },
    });

    expect(title()).toBe(ongoingGnosis.metaEvidence["1005"].title);
    expect(text()).toContain("Timeline unavailable");
    expect(fieldText("court")).toBe("Court unavailable");
    expect(fieldText("initialNumberOfJurors")).toBe("3");
    expect(text()).not.toContain("Jury decision");
    expect(container.querySelectorAll(".crowdfundingCard")).toHaveLength(0);
  });

  it("shows the details when only the meta-evidence read fails", async () => {
    await renderCase("1007", { overrides: { getMetaEvidenceCallback: jest.fn(() => Promise.reject(new Error("ipfs"))) } });

    expect(text()).toContain("Failed to load metaevidence, thus the dispute summary.");
    expect(fieldText("initialNumberOfJurors")).toBe("1");
    expect(fieldText("court")).toBe("Humanity Court");
    expect(text()).toContain("Jury decision: 2");
    expect(container.querySelectorAll("#evidence-timeline .evidence")).toHaveLength(3);
  });
});

describe("Navigation", () => {
  it("shows the case of the URL even when an earlier response arrives after a newer one", async () => {
    let resolveFirst;
    const getArbitratorDisputeCallback = jest
      .fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockImplementation(id => fixtures.getArbitratorDispute(GNOSIS, id));
    const history = createMemoryHistory({ initialEntries: ["/100/cases/1005"] });
    const callbacks = { ...fixtureCallbacks(GNOSIS), getArbitratorDisputeCallback };
    const { subcourts, subcourtDetails } = await fixtures.getSubcourtData(GNOSIS);

    await act(async () => {
      ReactDOM.render(
        <Router history={history}>
          <Route
            path="/:chainId/cases/:id?"
            render={route => (
              <Interact route={route} network={GNOSIS} arbitratorAddress={KLEROS_LIQUID} subcourts={subcourts} subcourtDetails={subcourtDetails} subcourtsLoading={false} exceptionalContractAddresses={[]} activeAddress="" isAuthenticated={false} isSigningIn={false} web3Provider={null} now={() => NOW} {...callbacks} />
            )}
          />
        </Router>,
        container
      );
    });
    expect(container.querySelector('[role="status"]').textContent).toContain("Fetching dispute #1005");

    await act(async () => {
      history.push("/100/cases/1007");
    });
    await waitFor(isSettled);
    expect(title()).toBe(ongoingGnosis.metaEvidence["1007"].title);

    await act(async () => {
      resolveFirst(await fixtures.getArbitratorDispute(GNOSIS, "1005"));
    });
    await sleep(50);
    expect(title()).toBe(ongoingGnosis.metaEvidence["1007"].title);
    expect(fieldText("category")).toBe("# 1007");

    await act(async () => {
      history.goBack();
    });
    await waitFor(() => isSettled() && fieldText("category") === "# 1005");
    expect(title()).toBe(ongoingGnosis.metaEvidence["1005"].title);
  });

  it("opens the typed dispute only on Enter, as a new history entry, so Back returns to the previous case", async () => {
    const { history } = await renderCase("1005");
    const input = () => container.querySelector("#arbitratorDisputeID");

    await act(async () => {
      Simulate.change(input(), { target: { value: "900002" } });
    });
    await sleep(100);
    expect(history.location.pathname).toBe("/100/cases/1005");
    expect(history.length).toBe(1);
    expect(title()).toBe(ongoingGnosis.metaEvidence["1005"].title);
    expect(input().value).toBe("900002");

    await act(async () => {
      Simulate.submit(input().closest("form"));
    });
    expect(history.location.pathname).toBe("/100/cases/900002");
    expect(history.length).toBe(2);
    await waitFor(() => isSettled() && fieldText("category") === "# 900002");
    expect(title()).toBe(handmadeGnosis.disputes["900002"].metaEvidence.title);

    await act(async () => {
      history.goBack();
    });
    await waitFor(() => isSettled() && fieldText("category") === "# 1005");
    expect(history.location.pathname).toBe("/100/cases/1005");
    expect(title()).toBe(ongoingGnosis.metaEvidence["1005"].title);
    expect(input().value).toBe("1005");
  });

  it("opens the typed dispute with the search button and ignores an empty or unchanged ID", async () => {
    const { history } = await renderCase("1005");
    const input = () => container.querySelector("#arbitratorDisputeID");
    const searchButton = () => container.querySelector('button[type="submit"]');

    await act(async () => {
      searchButton().click();
    });
    expect(history.length).toBe(1);

    await act(async () => {
      Simulate.change(input(), { target: { value: "" } });
    });
    await act(async () => {
      searchButton().click();
    });
    expect(history.length).toBe(1);
    expect(history.location.pathname).toBe("/100/cases/1005");

    await act(async () => {
      Simulate.change(input(), { target: { value: "900001" } });
    });
    await act(async () => {
      searchButton().click();
    });
    expect(history.length).toBe(2);
    expect(history.location.pathname).toBe("/100/cases/900001");
    await waitFor(() => isSettled() && fieldText("category") === "# 900001");
    expect(title()).toBe(handmadeGnosis.disputes["900001"].metaEvidence.title);
  });

  it("returns to case A from case B opened through the search box, then to the Ongoing page", async () => {
    //The history of a user who came from the Ongoing page and opened case A.
    const history = createMemoryHistory({ initialEntries: ["/100/ongoing", "/100/cases/1005"], initialIndex: 1 });
    await renderCase("1005", { history });
    expect(title()).toBe(ongoingGnosis.metaEvidence["1005"].title);

    await act(async () => {
      Simulate.change(container.querySelector("#arbitratorDisputeID"), { target: { value: "1007" } });
    });
    await act(async () => {
      Simulate.submit(container.querySelector("form"));
    });
    await waitFor(() => isSettled() && fieldText("category") === "# 1007");
    expect(title()).toBe(ongoingGnosis.metaEvidence["1007"].title);
    expect(history.length).toBe(3);

    await act(async () => {
      history.goBack();
    });
    await waitFor(() => isSettled() && fieldText("category") === "# 1005");
    expect(history.location.pathname).toBe("/100/cases/1005");
    expect(title()).toBe(ongoingGnosis.metaEvidence["1005"].title);

    await act(async () => {
      history.goBack();
    });
    expect(history.location.pathname).toBe("/100/ongoing");
    expect(container.querySelector("main")).toBeNull();
  });
});

describe("Write stubs", () => {
  const fillEvidenceForm = async () => {
    await act(async () => {
      Simulate.click(buttons("Submit New Evidence")[0]);
    });
    const titleInput = container.querySelector("#evidence-title");
    const descriptionInput = container.querySelector("#evidence-description");
    titleInput.value = "Late delivery notice";
    descriptionInput.value = "Sent on the day of the deadline.";
    await act(async () => {
      Simulate.change(titleInput);
      Simulate.change(descriptionInput);
    });
    await act(async () => {
      Simulate.click(buttons("Submit")[0]);
    });
  };

  it("submits evidence through the stub and reloads the case", async () => {
    const { callbacks } = await renderCase("900001", { signedIn: true });
    await fillEvidenceForm();

    await waitFor(() => callbacks.submitEvidenceCallback.mock.calls.length === 1);
    expect(callbacks.submitEvidenceCallback).toHaveBeenCalledWith(handmadeGnosis.disputes["900001"].arbitratorDispute.arbitrated, {
      disputeID: 41n,
      evidenceTitle: "Late delivery notice",
      evidenceDescription: "Sent on the day of the deadline.",
      evidenceDocument: undefined,
      supportingSide: 0,
    });
    await expect(callbacks.submitEvidenceCallback.mock.results[0].value).resolves.toMatchObject({ status: 1 });
    await waitFor(isSettled);
    expect(title()).toBe(handmadeGnosis.disputes["900001"].metaEvidence.title);
    expect(container.querySelectorAll("#evidence-timeline .evidence")).toHaveLength(2);
  });

  it("reports write failures per action without changing the case", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env.REACT_APP_FIXTURE_WRITES = "failure";
    const { callbacks } = await renderCase("900001", { signedIn: true });

    await fillEvidenceForm();
    await waitFor(() => callbacks.submitEvidenceCallback.mock.calls.length === 1);
    await expect(callbacks.submitEvidenceCallback.mock.results[0].value).rejects.toThrow("Forced failure");

    const fund = buttons("Fund").find(button => !button.disabled);
    await act(async () => {
      Simulate.click(fund);
    });
    await waitFor(() => callbacks.appealCallback.mock.calls.length === 1);
    await expect(callbacks.appealCallback.mock.results[0].value).resolves.toBeNull();

    await waitFor(isSettled);
    expect(title()).toBe(handmadeGnosis.disputes["900001"].metaEvidence.title);
    expect(container.querySelectorAll(".crowdfundingCard")).toHaveLength(17);
    expect(text()).toContain("50.00% Funded");
  });
});
