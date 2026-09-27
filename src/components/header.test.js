import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import Header from "./header";
import { EXAMPLES } from "../wallet/walletStatus";

const CHAIN_ID = "100";
const CONNECT_LABEL = "Connect wallet";
const CONNECTING_LABEL = "Connecting…";
const RETRY_LABEL = "Retry";
const ONGOING_LABEL = "Ongoing Disputes";
const CREATE_LABEL = "Create";
const CASES_LABEL = "Case Lookup";
const UNSUPPORTED_NETWORK = "Unsupported Network";
const INSTALL_URL = "https://metamask.io";
const FAQ_URL = "https://docs.kleros.io/welcome/faq#can-i-use-a-smart-contract-account-to-stake-in-the-court";
const WARNING_STORAGE_KEY = "@kleros/dispute-resolver/alert/smart-contract-wallet-warning";
const DISMISS_SELECTOR = 'button[aria-label="Dismiss warning"]';

//What the header must show for each example of the contract. Every example needs a row here, so a new state cannot go untested.
const CHROME = {
  NO_WALLET: { banner: "install", create: false, wallet: "empty", unsupported: false, warning: false },
  WALLET_NOT_CONNECTED: { banner: "connect", create: false, wallet: "connect", unsupported: false, warning: false },
  CONNECTED_SUPPORTED: { banner: null, create: true, wallet: "account", unsupported: false, warning: false },
  CONNECTED_GNOSIS: { banner: null, create: true, wallet: "account", unsupported: false, warning: false },
  CONNECTED_TESTNET: { banner: null, create: true, wallet: "account", unsupported: false, warning: false },
  CONNECTED_SMART_CONTRACT_WALLET: { banner: null, create: true, wallet: "account", unsupported: false, warning: true },
  CONNECTED_UNSUPPORTED: { banner: null, create: true, wallet: "account", unsupported: true, warning: false },
  CONNECTING: { banner: "none", create: false, wallet: "connecting", unsupported: false, warning: false },
  ERROR: { banner: "connect", create: false, wallet: "error", unsupported: false, warning: false },
};

let container;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  localStorage.clear();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  jest.restoreAllMocks();
});

//Polls until the condition holds, letting the pending promises and the React updates settle in between.
const waitFor = async (condition, timeoutMs = 5000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for the header to settle.");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
};

const route = (chainId) => ({ match: { params: { chainId } } });

//Renders the header inside a router at the given path. `status` and `actions` are passed as given, so a missing one stays missing.
const renderHeader = async ({ status, actions, chainId = CHAIN_ID, path = `/${chainId}/ongoing/` } = {}) => {
  const history = createMemoryHistory({ initialEntries: [path] });
  await act(async () => {
    ReactDOM.render(
      <Router history={history}>
        <Header status={status} actions={actions} route={route(chainId)} />
      </Router>,
      container
    );
  });
  return history;
};

const banner = () => container.querySelector('[role="status"]');
const warning = () => container.querySelector('[role="alert"]');
const walletArea = () => container.querySelector(".wallet");
const brandLink = () => container.querySelector("nav a.navbar-brand");
const navLinks = () => Array.from(container.querySelectorAll("nav a.nav-link"));
const navLink = (label) => navLinks().find((link) => link.textContent === label);
const buttons = (root) => Array.from(root.querySelectorAll("button"));
const button = (root, label) => buttons(root).find((node) => node.textContent.trim() === label);
const shortened = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const click = (node) =>
  act(async () => {
    Simulate.click(node);
  });

const expectBanner = (kind) => {
  if (kind === null) {
    expect(banner()).toBeNull();
    return;
  }
  expect(banner()).not.toBeNull();
  const install = banner().querySelector(`a[href="${INSTALL_URL}"]`);
  const connect = button(banner(), CONNECT_LABEL);
  expect(install !== null).toBe(kind === "install");
  expect(connect !== undefined).toBe(kind === "connect");
  if (install) {
    expect(install.target).toBe("_blank");
    expect(install.rel.split(" ")).toEqual(expect.arrayContaining(["noreferrer", "noopener"]));
  }
};

const expectWalletArea = (kind, status) => {
  const area = walletArea();
  expect(area).not.toBeNull();
  const content = area.textContent.replace(UNSUPPORTED_NETWORK, "");
  switch (kind) {
    case "empty":
      expect(content).toBe("");
      expect(buttons(area)).toHaveLength(0);
      break;
    case "connect":
      expect(button(area, CONNECT_LABEL)).toBeDefined();
      expect(button(area, CONNECT_LABEL).disabled).toBe(false);
      break;
    case "account": {
      const account = area.querySelector(`[title="${status.address}"]`);
      expect(account.textContent).toBe(shortened(status.address));
      if (status.chain.supported) expect(content).toContain(status.chain.name);
      expect(buttons(area)).toHaveLength(0);
      break;
    }
    case "connecting":
      expect(content).toBe(CONNECTING_LABEL);
      expect(buttons(area)).toHaveLength(0);
      break;
    case "error":
      expect(content).toContain(status.error.message);
      expect(button(area, RETRY_LABEL)).toBeDefined();
      break;
    default:
      throw new Error(`Unknown wallet area expectation: ${kind}`);
  }
};

describe("Header chrome per wallet status", () => {
  it.each(Object.keys(EXAMPLES))("renders %s from the status alone", async (key) => {
    const expected = CHROME[key];
    expect(expected).toBeDefined();
    const status = EXAMPLES[key];
    await renderHeader({ status, actions: { connect: jest.fn().mockResolvedValue() } });

    expect(navLink(ONGOING_LABEL)).toBeDefined();
    expect(navLink(CASES_LABEL)).toBeDefined();
    expect(navLink(CREATE_LABEL) !== undefined).toBe(expected.create);
    expectBanner(expected.banner);
    expectWalletArea(expected.wallet, status);
    expect(walletArea().textContent.includes(UNSUPPORTED_NETWORK)).toBe(expected.unsupported);
    expect(warning() !== null).toBe(expected.warning);
  });

  it("offers no way to switch away from an unsupported chain", async () => {
    await renderHeader({ status: EXAMPLES.CONNECTED_UNSUPPORTED });
    expect(walletArea().textContent).toContain(UNSUPPORTED_NETWORK);
    expect(buttons(container)).toHaveLength(1);
    expect(buttons(container)[0].classList.contains("navbar-toggler")).toBe(true);
  });
});

describe("Header navigation", () => {
  it("links the brand and the pages to the chain of the route", async () => {
    await renderHeader({ status: EXAMPLES.CONNECTED_GNOSIS, chainId: "100" });
    expect(brandLink().getAttribute("href")).toBe("/100");
    expect(navLink(ONGOING_LABEL).getAttribute("href")).toBe("/100/ongoing/");
    expect(navLink(CREATE_LABEL).getAttribute("href")).toBe("/100/create/");
    expect(navLink(CASES_LABEL).getAttribute("href")).toBe("/100/cases/");
  });

  it("follows the chain of the route, not the chain of the wallet", async () => {
    await renderHeader({ status: EXAMPLES.CONNECTED_GNOSIS, chainId: "1" });
    expect(brandLink().getAttribute("href")).toBe("/1");
    expect(navLink(ONGOING_LABEL).getAttribute("href")).toBe("/1/ongoing/");
    expect(navLink(CREATE_LABEL).getAttribute("href")).toBe("/1/create/");
    expect(navLink(CASES_LABEL).getAttribute("href")).toBe("/1/cases/");
  });

  it("names the case page by what it does and drops the Interact label", async () => {
    await renderHeader({ status: EXAMPLES.NO_WALLET });
    expect(navLinks().map((link) => link.textContent)).toEqual([ONGOING_LABEL, CASES_LABEL]);
  });

  it("marks the current page as active", async () => {
    await renderHeader({ status: EXAMPLES.CONNECTED_SUPPORTED, path: "/100/cases/" });
    expect(navLink(CASES_LABEL).classList.contains("active")).toBe(true);
    expect(navLink(ONGOING_LABEL).classList.contains("active")).toBe(false);
    expect(navLink(CREATE_LABEL).classList.contains("active")).toBe(false);
  });

  it("keeps the responsive toggle and the brand accessible", async () => {
    await renderHeader({ status: EXAMPLES.NO_WALLET });
    const toggle = container.querySelector("button.navbar-toggler");
    expect(toggle.getAttribute("aria-controls")).toBe("responsive-navbar-nav");
    expect(toggle.getAttribute("aria-label")).toBeTruthy();
    expect(brandLink().getAttribute("aria-label")).toBeTruthy();
  });
});

describe("Header connect action", () => {
  it("asks the wallet for an account and waits for the answer", async () => {
    let finishConnecting;
    const connect = jest.fn(
      () =>
        new Promise((resolve) => {
          finishConnecting = resolve;
        })
    );
    await renderHeader({ status: EXAMPLES.WALLET_NOT_CONNECTED, actions: { connect } });

    await click(button(walletArea(), CONNECT_LABEL));

    expect(connect).toHaveBeenCalledTimes(1);
    const pending = [...buttons(walletArea()), ...buttons(banner())];
    expect(pending).toHaveLength(2);
    expect(pending.map((node) => node.disabled)).toEqual([true, true]);
    expect(pending.map((node) => node.textContent)).toEqual([CONNECTING_LABEL, CONNECTING_LABEL]);

    await act(async () => {
      finishConnecting();
    });
    await waitFor(() => button(walletArea(), CONNECT_LABEL) !== undefined);
    expect(button(walletArea(), CONNECT_LABEL).disabled).toBe(false);
    expect(button(banner(), CONNECT_LABEL).disabled).toBe(false);
  });

  it("survives a rejected connection and offers to retry", async () => {
    const connect = jest.fn(() => Promise.reject(new Error("User rejected the request.")));
    await renderHeader({ status: EXAMPLES.ERROR, actions: { connect } });

    await click(button(walletArea(), RETRY_LABEL));
    await waitFor(() => button(walletArea(), RETRY_LABEL) !== undefined);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(button(walletArea(), RETRY_LABEL).disabled).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("connects from the banner too", async () => {
    const connect = jest.fn().mockResolvedValue();
    await renderHeader({ status: EXAMPLES.ERROR, actions: { connect } });
    await click(button(banner(), CONNECT_LABEL));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("stays usable without actions", async () => {
    await renderHeader({ status: EXAMPLES.WALLET_NOT_CONNECTED });
    await click(button(walletArea(), CONNECT_LABEL));
    await waitFor(() => button(walletArea(), CONNECT_LABEL) !== undefined);
    expect(button(walletArea(), CONNECT_LABEL).disabled).toBe(false);
  });
});

describe("Header smart contract wallet warning", () => {
  const status = EXAMPLES.CONNECTED_SMART_CONTRACT_WALLET;
  const storageKey = `${WARNING_STORAGE_KEY}:${status.address}`;

  it("warns with a link to the FAQ", async () => {
    await renderHeader({ status });
    expect(warning().textContent).toContain("You are using a smart contract wallet.");
    const learnMore = warning().querySelector(`a[href="${FAQ_URL}"]`);
    expect(learnMore.target).toBe("_blank");
  });

  it("dismisses for the address and stays dismissed", async () => {
    await renderHeader({ status });
    await click(warning().querySelector(DISMISS_SELECTOR));
    expect(warning()).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe("false");

    ReactDOM.unmountComponentAtNode(container);
    await renderHeader({ status });
    expect(warning()).toBeNull();

    await renderHeader({ status: { ...status, address: EXAMPLES.CONNECTED_SUPPORTED.address } });
    expect(warning()).not.toBeNull();
  });

  it("honours a dismissal stored by the previous warning component", async () => {
    localStorage.setItem(storageKey, "false");
    await renderHeader({ status });
    expect(warning()).toBeNull();
  });

  it("still warns and dismisses when storage is unavailable", async () => {
    const blocked = () => {
      throw new Error("Storage is disabled.");
    };
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    await renderHeader({ status });
    expect(warning()).not.toBeNull();

    await click(warning().querySelector(DISMISS_SELECTOR));
    expect(warning()).toBeNull();
  });
});

describe("Header without a usable status", () => {
  it.each([undefined, null, {}])("renders the navigation with %p", async (status) => {
    await renderHeader({ status });
    expect(navLink(ONGOING_LABEL)).toBeDefined();
    expect(navLink(CASES_LABEL)).toBeDefined();
    expect(navLink(CREATE_LABEL)).toBeUndefined();
  });

  it("treats a missing status like a connecting wallet", async () => {
    await renderHeader({});
    expect(banner()).not.toBeNull();
    expect(buttons(banner())).toHaveLength(0);
    expect(banner().querySelector("a")).toBeNull();
    expect(walletArea().textContent).toBe(CONNECTING_LABEL);
    expect(warning()).toBeNull();
  });

  it("fills in what a partial status leaves out", async () => {
    await renderHeader({ status: { viewOnly: false, connection: "connected", address: EXAMPLES.CONNECTED_SUPPORTED.address } });
    expect(navLink(CREATE_LABEL)).toBeDefined();
    expect(banner()).toBeNull();
    expect(walletArea().textContent).toBe(shortened(EXAMPLES.CONNECTED_SUPPORTED.address));
  });
});
