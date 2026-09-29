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
const VIEW_ONLY_TITLE = "Read-only mode";
const VIEW_ONLY_COPY = "You can only browse disputes.";
const FAQ_URL = "https://docs.kleros.io/welcome/faq#can-i-use-a-smart-contract-account-to-stake-in-the-court";
const WARNING_STORAGE_KEY = "@kleros/dispute-resolver/alert/smart-contract-wallet-warning";
const DISMISS_SELECTOR = 'button[aria-label="Dismiss warning"]';
const SWITCHING_LABEL = "Switching…";
const SWITCHER_TITLE = "Switch network";

//What the header must show for each example of the contract. Every example needs a row here, so a new state cannot go untested.
//The banner is shown (true) or not (null); it never carries an action, the connect button belongs to the wallet area.
//The switcher is the chain pill: its label is the chain name, or the unsupported notice, and it is absent (null) only while the chain is unknown.
const CHROME = {
  NO_WALLET: { banner: true, create: false, wallet: "empty", switcher: "Ethereum Mainnet", warning: false, switchError: false },
  WALLET_NOT_CONNECTED: { banner: true, create: false, wallet: "connect", switcher: "Ethereum Mainnet", warning: false, switchError: false },
  CONNECTED_SUPPORTED: { banner: null, create: true, wallet: "account", switcher: "Ethereum Mainnet", warning: false, switchError: false },
  CONNECTED_GNOSIS: { banner: null, create: true, wallet: "account", switcher: "Gnosis Network", warning: false, switchError: false },
  CONNECTED_TESTNET: { banner: null, create: true, wallet: "account", switcher: "Ethereum Testnet Sepolia", warning: false, switchError: false },
  CONNECTED_SMART_CONTRACT_WALLET: { banner: null, create: true, wallet: "account", switcher: "Ethereum Mainnet", warning: true, switchError: false },
  CONNECTED_UNSUPPORTED: { banner: null, create: true, wallet: "account", switcher: UNSUPPORTED_NETWORK, warning: false, switchError: false },
  CONNECTING: { banner: true, create: false, wallet: "connecting", switcher: null, warning: false, switchError: false },
  ERROR: { banner: true, create: false, wallet: "error", switcher: "Ethereum Mainnet", warning: false, switchError: false },
  SWITCH_FAILED: { banner: null, create: true, wallet: "account", switcher: "Ethereum Mainnet", warning: false, switchError: true },
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

const banner = () => container.querySelector('.notice[role="status"]');
const warning = () => container.querySelector('.notice[role="alert"]');
const walletArea = () => container.querySelector(".wallet");
const switcher = () => container.querySelector(".switcher");
const switcherToggle = () => switcher()?.querySelector("button.dropdown-toggle") ?? null;
const switcherItems = () => Array.from(switcher()?.querySelectorAll(".dropdown-item") ?? []);
const switcherItem = (label) => switcherItems().find((item) => item.textContent === label);
const switchError = () => walletArea().querySelector('[role="alert"]');
//The wallet area without the switcher: the account, the connect button, the connecting or error text.
const walletContent = () => Array.from(walletArea().childNodes).filter((node) => !(node.classList && node.classList.contains("switcher")));
const walletText = () => walletContent().map((node) => node.textContent).join("");
const walletButtons = () => walletContent().flatMap((node) => (node.matches?.("button") ? [node] : Array.from(node.querySelectorAll?.("button") ?? [])));
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

//The banner is always the same title and sentence, with no link and no button.
const expectBanner = (shown) => {
  if (shown === null) {
    expect(banner()).toBeNull();
    return;
  }
  expect(banner()).not.toBeNull();
  expect(banner().textContent).toBe(`${VIEW_ONLY_TITLE}${VIEW_ONLY_COPY}`);
  expect(banner().querySelector(".cardTitle").textContent).toBe(VIEW_ONLY_TITLE);
  expect(banner().querySelector(".cardBody").textContent).toBe(VIEW_ONLY_COPY);
  expect(banner().querySelector("a")).toBeNull();
  expect(buttons(banner())).toHaveLength(0);
};

const expectWalletArea = (kind, status) => {
  const area = walletArea();
  expect(area).not.toBeNull();
  const content = walletText().replace(status.switchError?.message ?? "", "");
  const walletButton = (label) => walletButtons().find((node) => node.textContent.trim() === label);
  switch (kind) {
    case "empty":
      expect(content).toBe("");
      expect(walletButtons()).toHaveLength(0);
      break;
    case "connect":
      expect(walletButton(CONNECT_LABEL)).toBeDefined();
      expect(walletButton(CONNECT_LABEL).disabled).toBe(false);
      break;
    case "account": {
      const account = area.querySelector(`[title="${status.address}"]`);
      expect(account.textContent).toBe(shortened(status.address));
      expect(content).toBe(shortened(status.address));
      expect(walletButtons()).toHaveLength(0);
      break;
    }
    case "connecting":
      expect(content).toBe(CONNECTING_LABEL);
      expect(walletButtons()).toHaveLength(0);
      break;
    case "error":
      expect(content).toContain(status.error.message);
      expect(walletButton(RETRY_LABEL)).toBeDefined();
      break;
    default:
      throw new Error(`Unknown wallet area expectation: ${kind}`);
  }
};

//The switcher shows the current chain and offers every chain of the status, marking the current one.
const expectSwitcher = (label, status) => {
  if (label === null) {
    expect(switcher()).toBeNull();
    return;
  }
  expect(switcherToggle()).not.toBeNull();
  expect(switcherToggle().textContent).toBe(label);
  expect(switcherToggle().disabled).toBe(false);
  expect(switcherToggle().getAttribute("title")).toBe(SWITCHER_TITLE);
  expect(switcherToggle().getAttribute("aria-haspopup")).toBe("true");
  expect(switcherToggle().getAttribute("aria-expanded")).toBe("false");
  expect(switcherToggle().classList.contains("unsupported")).toBe(status.chain.supported === false);
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
    expectSwitcher(expected.switcher, status);
    expect(walletArea().textContent.includes(UNSUPPORTED_NETWORK)).toBe(expected.switcher === UNSUPPORTED_NETWORK);
    expect(warning() !== null).toBe(expected.warning);
    expect(switchError() !== null).toBe(expected.switchError);
    if (expected.switchError) expect(switchError().textContent).toBe(status.switchError.message);
  });

  it("keeps the banner to its title and one sentence, without an install link, when there is no wallet", async () => {
    await renderHeader({ status: EXAMPLES.NO_WALLET });
    expect(banner().textContent).toBe(`${VIEW_ONLY_TITLE}${VIEW_ONLY_COPY}`);
    expect(banner().querySelector("a")).toBeNull();
    expect(buttons(banner())).toHaveLength(0);
    expect(container.querySelector('a[href*="metamask"]')).toBeNull();
  });

  it("offers Connect wallet in the header only, without an error, when the wallet is not connected", async () => {
    await renderHeader({ status: EXAMPLES.WALLET_NOT_CONNECTED });
    expect(button(walletArea(), CONNECT_LABEL)).toBeDefined();
    expect(button(walletArea(), RETRY_LABEL)).toBeUndefined();
    expect(walletText()).toBe(CONNECT_LABEL);
    expect(buttons(banner())).toHaveLength(0);
    expect(banner().textContent).toBe(`${VIEW_ONLY_TITLE}${VIEW_ONLY_COPY}`);
    expect(buttons(container).filter((node) => node.textContent.trim() === CONNECT_LABEL)).toHaveLength(1);
  });

  it("offers the way back from an unsupported chain through the switcher alone", async () => {
    await renderHeader({ status: EXAMPLES.CONNECTED_UNSUPPORTED });
    expect(switcherToggle().textContent).toBe(UNSUPPORTED_NETWORK);
    expect(walletArea().querySelectorAll("button")).toHaveLength(1);
    expect(walletArea().querySelector("button")).toBe(switcherToggle());
    await click(switcherToggle());
    expect(switcherItems().map((item) => item.textContent)).toEqual(EXAMPLES.CONNECTED_UNSUPPORTED.chains.map((chain) => chain.name));
    expect(switcherItems().filter((item) => item.classList.contains("active"))).toHaveLength(0);
  });
});

describe("Header chain switcher", () => {
  const status = EXAMPLES.CONNECTED_GNOSIS;
  const chainNames = status.chains.map((chain) => chain.name);
  const keyDown = (node, key) =>
    act(async () => {
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

  it("lists the chains of the status when opened and marks the current one", async () => {
    await renderHeader({ status });
    expect(switcherItems()).toHaveLength(0);

    await click(switcherToggle());

    expect(switcherToggle().getAttribute("aria-expanded")).toBe("true");
    expect(switcherItems().map((item) => item.textContent)).toEqual(chainNames);
    switcherItems().forEach((item) => {
      expect(item.tagName).toBe("BUTTON");
      expect(item.getAttribute("type")).toBe("button");
    });
    const current = switcherItem(status.chain.name);
    expect(current.classList.contains("active")).toBe(true);
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(switcherItem("Ethereum Mainnet").classList.contains("active")).toBe(false);
    expect(switcherItem("Ethereum Mainnet").getAttribute("aria-current")).toBeNull();
    expect(switcher().querySelector(".dropdown-menu").getAttribute("aria-labelledby")).toBe(switcherToggle().id);
  });

  it("asks the adapter for the chosen chain and waits for the answer", async () => {
    let finishSwitching;
    const switchChain = jest.fn(
      () =>
        new Promise((resolve) => {
          finishSwitching = resolve;
        })
    );
    await renderHeader({ status, actions: { connect: jest.fn(), switchChain } });

    await click(switcherToggle());
    await click(switcherItem("Ethereum Mainnet"));

    expect(switchChain).toHaveBeenCalledTimes(1);
    expect(switchChain).toHaveBeenCalledWith(EXAMPLES.CONNECTED_SUPPORTED.chain.id);
    expect(switcherToggle().disabled).toBe(true);
    expect(switcherToggle().textContent).toBe(SWITCHING_LABEL);
    expect(switcherToggle().getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      finishSwitching();
    });
    await waitFor(() => !switcherToggle().disabled);
    expect(switcherToggle().textContent).toBe(status.chain.name);
  });

  it("does nothing when the current chain is chosen again", async () => {
    const switchChain = jest.fn().mockResolvedValue();
    await renderHeader({ status, actions: { connect: jest.fn(), switchChain } });
    await click(switcherToggle());
    await click(switcherItem(status.chain.name));
    expect(switchChain).not.toHaveBeenCalled();
    expect(switcherToggle().disabled).toBe(false);
  });

  it("shows the failure of the last switch next to the switcher and hides it while trying again", async () => {
    let finishSwitching;
    const switchChain = jest.fn(
      () =>
        new Promise((resolve) => {
          finishSwitching = resolve;
        })
    );
    await renderHeader({ status: EXAMPLES.SWITCH_FAILED, actions: { connect: jest.fn(), switchChain } });
    expect(switchError().textContent).toBe(EXAMPLES.SWITCH_FAILED.switchError.message);
    expect(switchError().querySelector("a, button")).toBeNull();

    await click(switcherToggle());
    await click(switcherItem("Gnosis Network"));
    expect(switchError()).toBeNull();

    await act(async () => {
      finishSwitching();
    });
    await waitFor(() => switchError() !== null);
  });

  it("survives a switch action that throws", async () => {
    const switchChain = jest.fn(() => Promise.reject(new Error("Wallet exploded.")));
    await renderHeader({ status, actions: { connect: jest.fn(), switchChain } });
    await click(switcherToggle());
    await click(switcherItem("Ethereum Mainnet"));
    await waitFor(() => !switcherToggle().disabled);
    expect(console.warn).toHaveBeenCalled();
    expect(switcherToggle().textContent).toBe(status.chain.name);
  });

  it("stays usable with actions that only know how to connect, or none at all", async () => {
    for (const actions of [{ connect: jest.fn() }, undefined]) {
      await renderHeader({ status, actions });
      await click(switcherToggle());
      await click(switcherItem("Ethereum Mainnet"));
      await waitFor(() => !switcherToggle().disabled);
      expect(switcherToggle().textContent).toBe(status.chain.name);
    }
  });

  it("opens with the keyboard, moves through the chains and closes with Escape", async () => {
    await renderHeader({ status, actions: { connect: jest.fn(), switchChain: jest.fn().mockResolvedValue() } });
    switcherToggle().focus();

    await keyDown(switcherToggle(), "ArrowDown");
    await waitFor(() => switcherItems().length === chainNames.length && document.activeElement === switcherItems()[0]);
    expect(switcherToggle().getAttribute("aria-expanded")).toBe("true");

    await keyDown(document.activeElement, "ArrowDown");
    expect(document.activeElement).toBe(switcherItems()[1]);
    await keyDown(document.activeElement, "ArrowUp");
    expect(document.activeElement).toBe(switcherItems()[0]);

    await keyDown(document.activeElement, "Escape");
    await waitFor(() => switcherToggle().getAttribute("aria-expanded") === "false");
    expect(document.activeElement).toBe(switcherToggle());
  });

  it("selects a chain with the keyboard", async () => {
    const switchChain = jest.fn().mockResolvedValue();
    await renderHeader({ status, actions: { connect: jest.fn(), switchChain } });
    switcherToggle().focus();
    await keyDown(switcherToggle(), "ArrowDown");
    await waitFor(() => document.activeElement === switcherItems()[0]);
    await click(document.activeElement);
    expect(switchChain).toHaveBeenCalledWith(EXAMPLES.CONNECTED_SUPPORTED.chain.id);
  });

  it("falls back to a plain pill when the status offers no chains", async () => {
    await renderHeader({ status: { ...status, chains: [] } });
    expect(switcher()).toBeNull();
    expect(walletArea().textContent).toContain(status.chain.name);
    expect(walletArea().querySelectorAll("button")).toHaveLength(0);

    await renderHeader({ status: { ...EXAMPLES.CONNECTED_UNSUPPORTED, chains: undefined } });
    expect(switcher()).toBeNull();
    expect(walletArea().textContent).toContain(UNSUPPORTED_NETWORK);
  });

  it("is absent while the chain is unknown", async () => {
    await renderHeader({ status: EXAMPLES.CONNECTING });
    expect(switcher()).toBeNull();
    await renderHeader({ status: { ...EXAMPLES.CONNECTING, chain: null, switchError: EXAMPLES.SWITCH_FAILED.switchError } });
    expect(switcher()).toBeNull();
    expect(switchError()).toBeNull();
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
    const pending = walletButtons();
    expect(pending).toHaveLength(1);
    expect(pending[0].disabled).toBe(true);
    expect(pending[0].textContent).toBe(CONNECTING_LABEL);
    expect(buttons(banner())).toHaveLength(0);

    await act(async () => {
      finishConnecting();
    });
    await waitFor(() => button(walletArea(), CONNECT_LABEL) !== undefined);
    expect(button(walletArea(), CONNECT_LABEL).disabled).toBe(false);
  });

  it("survives a connect action that throws and keeps offering to retry", async () => {
    const connect = jest.fn(() => Promise.reject(new Error("Wallet exploded.")));
    await renderHeader({ status: EXAMPLES.ERROR, actions: { connect } });

    await click(button(walletArea(), RETRY_LABEL));
    await waitFor(() => button(walletArea(), RETRY_LABEL) !== undefined);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(button(walletArea(), RETRY_LABEL).disabled).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("never offers to connect from the banner", async () => {
    for (const status of [EXAMPLES.WALLET_NOT_CONNECTED, EXAMPLES.ERROR, EXAMPLES.NO_WALLET, EXAMPLES.CONNECTING]) {
      await renderHeader({ status, actions: { connect: jest.fn().mockResolvedValue() } });
      expect(buttons(banner())).toHaveLength(0);
      expect(banner().querySelector("a")).toBeNull();
    }
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
    expect(switcher()).toBeNull();
    expect(warning()).toBeNull();
  });

  it("fills in what a partial status leaves out", async () => {
    await renderHeader({ status: { viewOnly: false, connection: "connected", address: EXAMPLES.CONNECTED_SUPPORTED.address } });
    expect(navLink(CREATE_LABEL)).toBeDefined();
    expect(banner()).toBeNull();
    expect(walletArea().textContent).toBe(shortened(EXAMPLES.CONNECTED_SUPPORTED.address));
    expect(switcher()).toBeNull();
  });
});
