import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import Create from "./create";
import { buildCreateDisputeOptions } from "../components/createSummary";
import { QuestionTypes } from "../components/createForm";
import * as fixtures from "../fixtures";
import ongoingGnosis from "../fixtures/ongoing/100.json";

const GNOSIS = "100";
const ENV_KEYS = ["REACT_APP_FIXTURE_CHAIN_ID", "REACT_APP_FIXTURE_WRITES", "REACT_APP_FIXTURE_FAIL_READS"];

//What the tests type into the form, and what the review step and the creation call must show for it.
const FILLED = {
  court: "xDai Curation",
  votes: "4",
  category: "Escrow",
  title: "Late delivery of the website",
  description: "The site was delivered two weeks after the deadline.",
  question: "Was the website delivered on time?",
  options: [
    ["Yes", "Delivered by the agreed date."],
    ["No", "Delivered after the agreed date."],
  ],
  alias: "Alice",
  address: "0x00000000000000000000000000000000000000a1",
};
const EXPECTED_CREATE_OPTIONS = {
  selectedSubcourt: "1",
  initialNumberOfJurors: "4",
  title: "Late delivery of the website",
  category: "Escrow",
  description: "The site was delivered two weeks after the deadline.",
  aliases: { "0x00000000000000000000000000000000000000a1": "Alice" },
  question: "Was the website delivered on time?",
  primaryDocument: "",
  numberOfRulingOptions: 2,
  rulingOptions: {
    type: "single-select",
    titles: ["Yes", "No"],
    descriptions: ["Delivered by the agreed date.", "Delivered after the agreed date."],
  },
};

let container;
let originalEnvironment;

beforeEach(() => {
  originalEnvironment = ENV_KEYS.map(key => process.env[key]);
  ENV_KEYS.forEach(key => delete process.env[key]);
  container = document.createElement("div");
  document.body.appendChild(container);
  jest.spyOn(console, "debug").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  //jsdom does not implement scrolling.
  window.scrollTo = jest.fn();
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  jest.restoreAllMocks();
  ENV_KEYS.forEach((key, index) => {
    if (originalEnvironment[index] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[index];
  });
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
  getArbitrationCostCallback: jest.fn((subcourtID, noOfJurors) => fixtures.getArbitrationCost(chainId, subcourtID, noOfJurors)),
  publishCallback: jest.fn(fixtures.publish),
  createDisputeCallback: jest.fn(fixtures.createDispute),
  onSignIn: jest.fn(fixtures.signIn),
});

const isSettled = () => container.querySelector('[aria-busy="true"]') === null;

//Renders the Create page inside a router at /<chain>/create without waiting for the cost.
const mountCreate = async ({ chainId = GNOSIS, signedIn = false, overrides = {}, subcourtsLoading = false, subcourtDetails, history } = {}) => {
  const callbacks = { ...fixtureCallbacks(chainId), ...overrides };
  const memoryHistory = history ?? createMemoryHistory({ initialEntries: [`/${chainId}/create`] });
  const courts = subcourtDetails ?? (await fixtures.getSubcourtData(chainId)).subcourtDetails;

  const render = (props = {}) =>
    act(async () => {
      ReactDOM.render(
        <Router history={memoryHistory}>
          <Route
            path="/:chainId/create"
            render={route => (
              <Create
                route={route}
                network={chainId}
                subcourtDetails={courts}
                subcourtsLoading={subcourtsLoading}
                isAuthenticated={signedIn}
                isSigningIn={false}
                {...callbacks}
                {...props}
              />
            )}
          />
        </Router>,
        container
      );
    });
  await render();

  return { callbacks, history: memoryHistory, rerender: render };
};

//Mounts the Create page and resolves once the arbitration cost has been read (or has failed).
const renderCreate = async options => {
  const mounted = await mountCreate(options);
  await waitFor(isSettled);
  return mounted;
};

const text = () => container.textContent;
const element = id => container.querySelector(`#${id}`);
const buttons = label => Array.from(container.querySelectorAll("button")).filter(button => button.textContent.trim() === label);
const click = target =>
  act(async () => {
    Simulate.click(target);
  });
const setValue = async (id, value) => {
  const input = element(id);
  input.value = value;
  await act(async () => {
    Simulate.change(input);
  });
};
const dropdownItems = () => Array.from(container.querySelectorAll(".dropdown-item")).map(node => node.textContent.trim());
const selectItem = async (toggleId, label) => {
  await click(element(toggleId));
  await click(Array.from(container.querySelectorAll(".dropdown-item")).find(node => node.textContent.trim() === label));
};
const costValue = () => element("arbitrationCost").querySelector("strong")?.textContent.trim();
const costAlert = () => element("arbitrationCost").querySelector('[role="alert"]');
const currentStep = () => container.querySelector('[aria-current="step"]')?.textContent.trim();
const feedback = id => element(id).parentElement.querySelector(".invalid-feedback")?.textContent.trim();
const submitForm = () =>
  act(async () => {
    Simulate.submit(container.querySelector("form"));
  });
const dropFile = file =>
  act(async () => {
    Simulate.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  });

const fillForm = async () => {
  await selectItem("subcourt-dropdown", FILLED.court);
  await setValue("initialNumberOfJurors", FILLED.votes);
  await setValue("category", FILLED.category);
  await setValue("title", FILLED.title);
  await setValue("description", FILLED.description);
  await setValue("question", FILLED.question);
  for (const [index, [title, description]] of FILLED.options.entries()) {
    await setValue(`rulingOption${index}Title`, title);
    await setValue(`rulingOption${index}Description`, description);
  }
  await setValue("name0", FILLED.alias);
  await setValue("address0", FILLED.address);
  await waitFor(() => costValue() === "28.8 xDai");
};

const goToReview = async () => {
  await submitForm();
  await waitFor(() => currentStep() === "2Review");
};

describe("Create form in fixture mode", () => {
  it("lists the courts of the fixture and reads the cost of the General Court with 3 votes without a chain request", async () => {
    const { callbacks } = await renderCreate();

    expect(element("subcourt-dropdown").textContent).toContain("xDai General Court");
    await click(element("subcourt-dropdown"));
    expect(dropdownItems()).toEqual(ongoingGnosis.subcourtDetails.map(court => court.name));
    expect(dropdownItems()).toHaveLength(20);
    expect(costValue()).toBe("36.0 xDai");
    expect(callbacks.getArbitrationCostCallback).toHaveBeenCalledTimes(1);
    expect(callbacks.getArbitrationCostCallback).toHaveBeenCalledWith("0", "3");
  });

  it("recalculates the cost only when the court or the number of votes changes", async () => {
    const { callbacks } = await renderCreate();

    await selectItem("subcourt-dropdown", "xDai Curation");
    await waitFor(() => costValue() === "21.6 xDai");
    expect(callbacks.getArbitrationCostCallback).toHaveBeenLastCalledWith("1", "3");

    await setValue("initialNumberOfJurors", "5");
    await waitFor(() => costValue() === "36.0 xDai");
    expect(callbacks.getArbitrationCostCallback).toHaveBeenLastCalledWith("1", "5");

    await setValue("initialNumberOfJurors", "0");
    await waitFor(isSettled);
    expect(costValue()).toBeUndefined();
    expect(element("arbitrationCost").textContent).toContain("Enter at least 1 vote to see the cost.");

    await setValue("title", "Typing a title reads nothing");
    expect(callbacks.getArbitrationCostCallback).toHaveBeenCalledTimes(3);
  });

  it("shows a placeholder while the cost loads and never says unavailable", async () => {
    let resolveCost;
    const getArbitrationCostCallback = jest.fn(() => new Promise(resolve => { resolveCost = resolve; }));
    await mountCreate({ overrides: { getArbitrationCostCallback } });

    expect(element("arbitrationCost").getAttribute("aria-busy")).toBe("true");
    expect(element("arbitrationCost").querySelector(".skeleton")).not.toBeNull();
    expect(text().toLowerCase()).not.toContain("unavailable");

    await act(async () => {
      resolveCost("36.0");
    });
    await waitFor(isSettled);
    expect(costValue()).toBe("36.0 xDai");
  });

  it("shows an error with a retry when the cost cannot be read, for a failed fixture read and for the null the App handler resolves", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env.REACT_APP_FIXTURE_FAIL_READS = "arbitrationCost";
    const { callbacks } = await renderCreate();

    expect(costAlert().textContent).toContain("The arbitration cost could not be read.");
    expect(text().toLowerCase()).not.toContain("unavailable");

    delete process.env.REACT_APP_FIXTURE_FAIL_READS;
    await click(buttons("Try again")[0]);
    await waitFor(() => costValue() === "36.0 xDai");
    expect(callbacks.getArbitrationCostCallback).toHaveBeenCalledTimes(2);
    expect(costAlert()).toBeNull();

    callbacks.getArbitrationCostCallback.mockResolvedValueOnce(null);
    await setValue("initialNumberOfJurors", "2");
    await waitFor(() => costAlert() !== null);
    expect(buttons("Try again")).toHaveLength(1);
  });

  it("waits for the courts before showing a court and the cost", async () => {
    const { callbacks, rerender } = await mountCreate({ subcourtsLoading: true, subcourtDetails: [] });

    expect(element("subcourt-dropdown").textContent).toContain("Loading courts…");
    expect(element("subcourt-dropdown").disabled).toBe(true);
    expect(element("arbitrationCost").querySelector(".skeleton")).not.toBeNull();
    expect(callbacks.getArbitrationCostCallback).not.toHaveBeenCalled();

    const { subcourtDetails } = await fixtures.getSubcourtData(GNOSIS);
    await rerender({ subcourtsLoading: false, subcourtDetails });
    await waitFor(isSettled);
    expect(element("subcourt-dropdown").textContent).toContain("xDai General Court");
    expect(costValue()).toBe("36.0 xDai");
  });

  it("says that the courts could not be loaded when there are none", async () => {
    await renderCreate({ subcourtDetails: [] });

    expect(element("subcourt-dropdown").textContent).toContain("No courts loaded");
    expect(costAlert().textContent).toContain("The courts could not be loaded, so the cost is unknown.");
  });

  it("keeps every field and option of the form", async () => {
    await renderCreate();

    const ids = [
      "subcourt-dropdown",
      "initialNumberOfJurors",
      "category",
      "arbitrationCost",
      "title",
      "description",
      "questionType",
      "numberOfRulingOptions",
      "question",
      "rulingOption0Title",
      "rulingOption0Description",
      "rulingOption1Title",
      "rulingOption1Description",
      "name0",
      "address0",
    ];
    ids.forEach(id => expect(element(id)).not.toBeNull());
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(buttons("Add another party")).toHaveLength(1);
    expect(element("numberOfRulingOptions").getAttribute("min")).toBe("2");
    expect(element("numberOfRulingOptions").getAttribute("max")).toBe("32");

    await click(element("questionType"));
    expect(dropdownItems()).toEqual(["Multiple choice: single select", "Multiple choice: multiple select", "Non-negative number", "Date"]);
    await click(Array.from(container.querySelectorAll(".dropdown-item")).find(node => node.textContent.trim() === "Non-negative number"));
    expect(element("numberOfRulingOptions")).toBeNull();
    expect(element("rulingOption0Title")).toBeNull();

    await selectItem("questionType", "Date");
    expect(element("rulingOption0Title")).toBeNull();

    await selectItem("questionType", "Multiple choice: multiple select");
    await setValue("numberOfRulingOptions", "3");
    expect(container.querySelectorAll('[id^="rulingOption"][id$="Title"]')).toHaveLength(3);
  });

  it("validates every required field before the review step and focuses the first invalid one", async () => {
    await renderCreate();
    await setValue("initialNumberOfJurors", "0");
    await setValue("numberOfRulingOptions", "1");
    await setValue("address0", "not-an-address");

    await submitForm();

    expect(currentStep()).toBe("1Details");
    expect(container.querySelector("form").classList.contains("was-validated")).toBe(true);
    ["initialNumberOfJurors", "title", "numberOfRulingOptions", "question", "rulingOption0Title", "name0", "address0"].forEach(id => expect(element(id).checkValidity()).toBe(false));
    ["category", "description"].forEach(id => expect(element(id).checkValidity()).toBe(true));
    expect(document.activeElement).toBe(element("initialNumberOfJurors"));
    expect(feedback("initialNumberOfJurors")).toBe("Enter a whole number of votes, at least 1.");
    expect(feedback("title")).toBe("Enter a title that sums up the dispute.");
    expect(feedback("numberOfRulingOptions")).toBe("Enter a whole number between 2 and 32.");
    expect(feedback("question")).toBe("Enter the question the jurors will answer.");
    expect(feedback("rulingOption0Title")).toBe('Enter ruling option 1, for example "Yes".');
    expect(feedback("name0")).toBe("Enter an alias for this address.");
    expect(feedback("address0")).toBe("Enter the address of this party: 0x followed by 40 hexadecimal characters.");

    await setValue("address0", "");
    await setValue("name0", "Alice");
    expect(element("name0").checkValidity()).toBe(true);
    expect(element("address0").checkValidity()).toBe(false);
  });

  it("shows in the review step exactly what will be submitted and keeps every value when going back", async () => {
    await renderCreate();
    await fillForm();
    await goToReview();

    expect(element("summary-title").textContent).toBe(FILLED.title);
    expect(text()).toContain(FILLED.description);
    expect(element("summary-court").textContent).toContain("xDai Curation");
    expect(element("summary-votes").textContent).toBe("4");
    expect(element("summary-category").textContent).toBe("Escrow");
    expect(element("summary-cost").textContent).toBe("28.8 xDai");
    expect(text()).toContain("Multiple choice: single select");
    expect(element("summary-question").textContent).toBe(FILLED.question);
    expect(Array.from(container.querySelectorAll(".options li")).map(option => option.textContent)).toEqual([
      "Option 1YesDelivered by the agreed date.",
      "Option 2NoDelivered after the agreed date.",
    ]);
    expect(element("summary-rulings").textContent).toBe("Rulings registered with the court: 2 ruling options.");
    expect(text()).toContain("Alice");
    expect(text()).toContain(FILLED.address);
    expect(buttons("Create dispute")).toHaveLength(1);

    await click(buttons("Back")[0]);
    await waitFor(isSettled);
    expect(currentStep()).toBe("1Details");
    expect(element("subcourt-dropdown").textContent).toContain("xDai Curation");
    expect(element("initialNumberOfJurors").value).toBe("4");
    expect(element("category").value).toBe("Escrow");
    expect(element("title").value).toBe(FILLED.title);
    expect(element("description").value).toBe(FILLED.description);
    expect(element("question").value).toBe(FILLED.question);
    expect(element("rulingOption1Title").value).toBe("No");
    expect(element("rulingOption1Description").value).toBe("Delivered after the agreed date.");
    expect(element("name0").value).toBe("Alice");
    expect(element("address0").value).toBe(FILLED.address);
    expect(costValue()).toBe("28.8 xDai");
  });

  it("describes the rulings of multiple-select, number and date questions in the review step", async () => {
    await renderCreate();
    await fillForm();
    await selectItem("questionType", "Multiple choice: multiple select");
    await setValue("rulingOption0Title", "Yes");
    await setValue("rulingOption1Title", "No");
    await goToReview();
    expect(element("summary-rulings").textContent).toBe("Rulings registered with the court: 4 rulings: any combination of the 2 options.");

    await click(buttons("Back")[0]);
    await selectItem("questionType", "Non-negative number");
    await goToReview();
    expect(container.querySelector(".options")).toBeNull();
    expect(element("summary-rulings").textContent).toBe("Rulings registered with the court: Any non-negative number.");
  });

  it("asks the user to sign in before uploading a document or creating the dispute", async () => {
    await renderCreate();

    expect(container.querySelector(".dropzone").style.cursor).toBe("not-allowed");
    expect(buttons("Sign in")).toHaveLength(1);

    await fillForm();
    await goToReview();
    expect(buttons("Create dispute")[0].disabled).toBe(true);
    expect(text()).toContain("Sign in with Ethereum to publish the dispute data to IPFS and create the dispute.");
    expect(buttons("Sign in")).toHaveLength(1);
  });

  it("explains when the network has no arbitrable contract instead of showing the form", async () => {
    await renderCreate({ chainId: "130", subcourtDetails: [] });

    expect(text()).toContain("There is no arbitrable contract deployed on this network, so a dispute cannot be created here.");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="https://github.com/kleros/dispute-resolver/issues"]')).not.toBeNull();
  });
});

describe("Primary document", () => {
  const file = () => new File(["contract"], "contract.pdf", { type: "application/pdf" });

  it("uploads the document through the stub, shows its name and links it in the review step", async () => {
    const { callbacks } = await renderCreate({ signedIn: true });

    await dropFile(file());
    await waitFor(() => text().includes("Selected file: contract.pdf"));
    expect(callbacks.publishCallback).toHaveBeenCalledTimes(1);
    expect(callbacks.publishCallback.mock.calls[0][0]).toBe("contract.pdf");

    await fillForm();
    await goToReview();
    const link = container.querySelector('a[href$="/contract.pdf"]');
    expect(link.textContent).toContain("contract.pdf");
    expect(link.getAttribute("href")).toBe("https://cdn.kleros.link/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/contract.pdf");

    await click(buttons("Create dispute")[0]);
    await waitFor(() => callbacks.createDisputeCallback.mock.calls.length === 1);
    expect(callbacks.createDisputeCallback).toHaveBeenCalledWith({ ...EXPECTED_CREATE_OPTIONS, primaryDocument: "/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/contract.pdf" });
  });

  it("reports an upload failure from the stub and keeps the form without a document", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env.REACT_APP_FIXTURE_WRITES = "failure";
    const { callbacks } = await renderCreate({ signedIn: true });

    await dropFile(file());
    await waitFor(() => text().includes("An error occurred while uploading the file. Please try again."));
    await expect(callbacks.publishCallback.mock.results[0].value).rejects.toThrow("Forced failure");
    expect(text()).not.toContain("Selected file");
  });

  it("refuses a file over 20MB without uploading it", async () => {
    const { callbacks } = await renderCreate({ signedIn: true });
    const large = new File(["x"], "large.bin");
    Object.defineProperty(large, "size", { value: 20 * 1024 * 1024 + 1 });

    await dropFile(large);
    await waitFor(() => text().includes("File is too large. Maximum size is 20MB."));
    expect(callbacks.publishCallback).not.toHaveBeenCalled();
  });
});

describe("Creating the dispute", () => {
  it("creates the dispute through the stub with the values of the form and opens the new case", async () => {
    process.env.REACT_APP_FIXTURE_CHAIN_ID = GNOSIS;
    const { callbacks, history } = await renderCreate({ signedIn: true });
    await fillForm();
    await goToReview();

    await click(buttons("Create dispute")[0]);
    await waitFor(() => text().includes("Dispute 1013 created"));
    expect(callbacks.createDisputeCallback).toHaveBeenCalledTimes(1);
    expect(callbacks.createDisputeCallback).toHaveBeenCalledWith(EXPECTED_CREATE_OPTIONS);
    expect(container.querySelector('[role="status"]').textContent).toContain("Opening the case…");
    expect(buttons("Create dispute")[0].disabled).toBe(true);
    expect(history.location.pathname).toBe("/100/create");

    await waitFor(() => history.location.pathname === "/100/cases/1013");
  });

  it("shows the pending state until the handler settles and reports a rejected transaction with its reason", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    let reject;
    const createDisputeCallback = jest.fn(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    await renderCreate({ signedIn: true, overrides: { createDisputeCallback } });
    await fillForm();
    await goToReview();

    await click(buttons("Create dispute")[0]);
    expect(container.querySelector('[role="status"]').textContent).toContain("Creating the dispute");
    expect(buttons("Creating…")[0].disabled).toBe(true);
    expect(buttons("Back")[0].disabled).toBe(true);

    await act(async () => {
      reject(new Error("User rejected the transaction"));
    });
    await waitFor(() => container.querySelector('[role="alert"]') !== null);
    expect(container.querySelector('[role="alert"]').textContent).toContain("Dispute creation failed");
    expect(container.querySelector('[role="alert"]').textContent).toContain("User rejected the transaction");
    expect(buttons("Create dispute")[0].disabled).toBe(false);
  });

  it("reports the stub failure, keeps the details and lets the user go back", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env.REACT_APP_FIXTURE_WRITES = "failure";
    const { callbacks, history } = await renderCreate({ signedIn: true });
    await fillForm();
    await goToReview();

    await click(buttons("Create dispute")[0]);
    await waitFor(() => container.querySelector('[role="alert"]') !== null);
    expect(container.querySelector('[role="alert"]').textContent).toContain("Dispute creation failed");
    expect(container.querySelector('[role="alert"]').textContent).toContain("Check you have the necessary funds and try again. If the error persists, contact support.");
    await expect(callbacks.createDisputeCallback.mock.results[0].value).resolves.toBeNull();
    expect(element("summary-title").textContent).toBe(FILLED.title);
    expect(history.location.pathname).toBe("/100/create");

    await click(buttons("Dismiss")[0]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await click(buttons("Back")[0]);
    await waitFor(isSettled);
    expect(element("title").value).toBe(FILLED.title);
  });

  it("reports a created dispute whose ID could not be read without opening a case", async () => {
    const receipt = { status: 1, hash: "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd" };
    const createDisputeCallback = jest.fn(() => Promise.resolve({ receipt, disputeID: null }));
    const { history } = await renderCreate({ signedIn: true, overrides: { createDisputeCallback } });
    await fillForm();
    await goToReview();

    await click(buttons("Create dispute")[0]);
    await waitFor(() => text().includes("Dispute created"));
    expect(text()).toContain("The dispute ID could not be read from the transaction.");
    expect(text()).toContain("Transaction 0xabcdef01…6789abcd");

    await sleep(2200);
    expect(history.location.pathname).toBe("/100/create");
  });
});

describe("buildCreateDisputeOptions", () => {
  const base = { selectedSubcourt: "1", initialNumberOfJurors: "4", title: "Title", category: "", description: "", question: "Question", primaryDocument: "", names: [], addresses: [] };

  it("registers one ruling per option for a single-select question", () => {
    expect(buildCreateDisputeOptions({ ...base, questionType: QuestionTypes.SINGLE_SELECT, rulingTitles: ["Yes", "No", "Maybe"], rulingDescriptions: ["", "", ""] })).toEqual({
      selectedSubcourt: "1",
      initialNumberOfJurors: "4",
      title: "Title",
      category: "",
      description: "",
      aliases: {},
      question: "Question",
      primaryDocument: "",
      numberOfRulingOptions: 3,
      rulingOptions: { type: "single-select", titles: ["Yes", "No", "Maybe"], descriptions: ["", "", ""] },
    });
  });

  it("registers one ruling per combination of the options for a multiple-select question", () => {
    const options = buildCreateDisputeOptions({ ...base, questionType: QuestionTypes.MULTIPLE_SELECT, rulingTitles: ["A", "B", "C"], rulingDescriptions: [] });
    expect(options.numberOfRulingOptions).toBe(8);
    expect(options.rulingOptions).toEqual({ type: "multiple-select", titles: ["A", "B", "C"], descriptions: [] });
  });

  it("leaves the number of rulings to the court for a number or a date question", () => {
    expect(buildCreateDisputeOptions({ ...base, questionType: QuestionTypes.UINT, rulingTitles: [], rulingDescriptions: [] })).toMatchObject({ numberOfRulingOptions: 0, rulingOptions: { type: "uint", titles: [] } });
    expect(buildCreateDisputeOptions({ ...base, questionType: QuestionTypes.DATETIME, rulingTitles: [], rulingDescriptions: [] })).toMatchObject({ numberOfRulingOptions: 0, rulingOptions: { type: "datetime", titles: [] } });
  });

  it("maps each address to the alias typed next to it and skips blank aliases", () => {
    const options = buildCreateDisputeOptions({
      ...base,
      questionType: QuestionTypes.SINGLE_SELECT,
      rulingTitles: ["Yes", "No"],
      rulingDescriptions: [],
      names: ["Alice", " ", "Bob"],
      addresses: ["0x00000000000000000000000000000000000000a1", "0x00000000000000000000000000000000000000b2", "0x00000000000000000000000000000000000000c3"],
    });
    expect(options.aliases).toEqual({ "0x00000000000000000000000000000000000000a1": "Alice", "0x00000000000000000000000000000000000000c3": "Bob" });
  });
});

describe("Labels", () => {
  it("marks the required fields with * and never says optional", async () => {
    await renderCreate();

    const label = id => container.querySelector(`label[for="${id}"]`).textContent;
    ["subcourt-dropdown", "initialNumberOfJurors", "title", "questionType", "numberOfRulingOptions", "question", "rulingOption0Title", "rulingOption1Title"].forEach(id => expect(label(id)).toContain("*"));
    ["category", "description", "rulingOption0Description", "name0", "address0"].forEach(id => expect(label(id)).not.toContain("*"));
    expect(text()).toContain("Fields marked * are required.");
    expect(text().toLowerCase()).not.toContain("optional");
    expect(container.querySelector("h1").textContent).toBe("Create a custom dispute");
    expect(text()).not.toContain("New dispute");
  });
});

describe("Parties", () => {
  const BOB = ["Bob", "0x00000000000000000000000000000000000000b2"];

  it("adds and removes parties, keeps them through the review step and lists every alias there", async () => {
    await renderCreate();
    await fillForm();

    await click(buttons("Add another party")[0]);
    await setValue("name1", BOB[0]);
    await setValue("address1", BOB[1]);
    await click(buttons("Add another party")[0]);
    expect(element("name2")).not.toBeNull();
    await click(container.querySelector('button[aria-label="Remove party 3"]'));
    expect(element("name2")).toBeNull();
    expect(element("name1").value).toBe("Bob");

    await goToReview();
    const parties = Array.from(container.querySelectorAll("#summary-parties-heading ~ dl > div")).map(party => party.textContent);
    expect(parties).toEqual(["Alice0x00000000000000000000000000000000000000a1", "Bob0x00000000000000000000000000000000000000b2"]);

    await click(buttons("Back")[0]);
    await waitFor(isSettled);
    expect(element("name0").value).toBe("Alice");
    expect(element("address1").value).toBe(BOB[1]);

    await click(container.querySelector('button[aria-label="Remove party 1"]'));
    expect(element("name0").value).toBe("Bob");
    expect(element("address0").value).toBe(BOB[1]);
    expect(element("name1")).toBeNull();
    expect(container.querySelector('button[aria-label^="Remove party"]')).toBeNull();
  });

  it("submits every alias with its address and nothing else changes in the creation call", async () => {
    const { callbacks } = await renderCreate({ signedIn: true });
    await fillForm();
    await click(buttons("Add another party")[0]);
    await setValue("name1", BOB[0]);
    await setValue("address1", BOB[1]);
    await goToReview();

    await click(buttons("Create dispute")[0]);
    await waitFor(() => callbacks.createDisputeCallback.mock.calls.length === 1);
    expect(callbacks.createDisputeCallback).toHaveBeenCalledWith({
      ...EXPECTED_CREATE_OPTIONS,
      aliases: { "0x00000000000000000000000000000000000000a1": "Alice", "0x00000000000000000000000000000000000000b2": "Bob" },
    });
  });

  it("refuses a second party with the address of the first instead of dropping one of them in the review step", async () => {
    await renderCreate();
    await fillForm();
    await click(buttons("Add another party")[0]);
    await setValue("name1", "Bob");
    await setValue("address1", FILLED.address.toUpperCase().replace("0X", "0x"));

    await submitForm();
    expect(currentStep()).toBe("1Details");
    expect(element("address1").checkValidity()).toBe(false);
    expect(feedback("address1")).toBe("Party 1 already uses this address. Each party needs its own address.");
    expect(document.activeElement).toBe(element("address1"));

    await setValue("address1", "0x00000000000000000000000000000000000000b2");
    expect(element("address1").checkValidity()).toBe(true);
    await goToReview();
    expect(Array.from(container.querySelectorAll("#summary-parties-heading ~ dl > div")).map(party => party.textContent)).toEqual([
      "Alice0x00000000000000000000000000000000000000a1",
      "Bob0x00000000000000000000000000000000000000b2",
    ]);
  });

  it("requires the address of a second party once its alias is typed, and ignores a party left empty", async () => {
    await renderCreate();
    await fillForm();
    await click(buttons("Add another party")[0]);
    await setValue("name1", "Bob");

    await submitForm();
    expect(currentStep()).toBe("1Details");
    expect(element("address1").checkValidity()).toBe(false);
    expect(document.activeElement).toBe(element("address1"));

    await setValue("name1", "");
    await goToReview();
    expect(container.querySelectorAll("#summary-parties-heading ~ dl > div")).toHaveLength(1);
  });
});
