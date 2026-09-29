import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from "react-dom/test-utils";
import { ethers } from "ethers";
import App from './app';
import networkMap from "./ethereum/network-contract-mapping";
import { getContract, getSignableContract } from "./ethereum/interface";
import { uploadToIpfs } from "./utils/atlas-api";

jest.mock("./ethereum/interface", () => ({
  getContract: jest.fn(),
  getSignableContract: jest.fn(),
}));

jest.mock("./utils/atlas-api", () => ({
  uploadToIpfs: jest.fn(),
  getAuthToken: jest.fn(),
  isTokenValid: jest.fn(),
  isTokenForAccount: jest.fn(),
  authenticateUser: jest.fn(),
  clearAuthData: jest.fn(),
  Role: { EVIDENCE: "evidence", POLICY: "policy" },
}));

//react-blockies draws the avatar on a canvas, which jsdom does not implement.
jest.mock("react-blockies", () => () => null);

//The ethers providers are fakes, so mounting the app never reaches an RPC. A read provider remembers the URL it was built
//for, the wallet provider proxies the wallet the way ethers does (a signer needs an authorised account, and a refused
//prompt is rethrown as ACTION_REJECTED), and getDefaultProvider yields a fake as well.
jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");

  class FakeJsonRpcProvider {
    constructor(url) {
      this.url = url;
    }

    async getBlockNumber() {
      return 1_000_000;
    }

    async getCode() {
      return "0x";
    }
  }

  class FakeBrowserProvider extends FakeJsonRpcProvider {
    constructor(ethereum) {
      super("wallet");
      this.ethereum = ethereum;
    }

    async getSigner() {
      let accounts = await this.ethereum.request({ method: "eth_accounts" });
      if (accounts.length === 0) {
        try {
          accounts = await this.ethereum.request({ method: "eth_requestAccounts" });
        } catch (error) {
          throw Object.assign(new Error("user rejected action"), { code: "ACTION_REJECTED", info: { error } });
        }
      }
      return { getAddress: async () => accounts[0] };
    }

    async getNetwork() {
      return { chainId: BigInt(await this.ethereum.request({ method: "eth_chainId" })) };
    }
  }

  const providers = { BrowserProvider: FakeBrowserProvider, JsonRpcProvider: FakeJsonRpcProvider, getDefaultProvider: () => new FakeJsonRpcProvider("default") };
  return { ...actual, ...providers, ethers: { ...actual.ethers, ...providers } };
});

//Mainnet and Gnosis read through an RPC URL of their own whatever the environment, so a test can tell which chain a read provider serves.
jest.mock("./ethereum/network-contract-mapping", () => {
  const actual = jest.requireActual("./ethereum/network-contract-mapping");
  const withRpc = chainId => ({ ...actual.default[chainId], WEB3_PROVIDER: `http://chain-${chainId}.rpc.test` });
  return { __esModule: true, ...actual, default: { ...actual.default, 1: withRpc(1), 100: withRpc(100) } };
});

const ENV_KEYS = ["REACT_APP_USE_FIXTURES", "REACT_APP_FIXTURE_CHAIN_ID", "REACT_APP_FIXTURE_SIGNED_IN"];
let originalEnvironment;

beforeEach(() => {
  originalEnvironment = ENV_KEYS.map(key => process.env[key]);
  ENV_KEYS.forEach(key => delete process.env[key]);
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "debug").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  ENV_KEYS.forEach((key, index) => {
    if (originalEnvironment[index] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[index];
  });
  jest.restoreAllMocks();
});

it('renders without crashing', async () => {
  const div = document.createElement('div');
  await act(async () => {
    ReactDOM.render(<App />, div);
  });
  ReactDOM.unmountComponentAtNode(div);
});

//An App instance with the state the write handlers read; nothing is mounted, so no wallet or RPC is touched.
const createApp = ({ network, activeAddress = "0x00000000000000000000000000000000000000AA" } = {}) => {
  const app = new App({});
  app.state = { ...app.state, network, activeAddress, walletProvider: { name: "wallet" } };
  return app;
};

const RECEIPT = { status: 1, hash: "0xreceipt" };
const ARBITRABLE = "0x0000000000000000000000000000000000000ABC";
const ESCROW_V1_MAINNET = "0xE2Dd8CCe2c33a04215074ADb4B5820B765d8Ed9D";
const GOVERNOR_GNOSIS = "0xf7dE5537eCD69a94695fcF4BCdBDeE6329b63322";
const UNSLASHED_MAINNET = "0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38";

//A contract whose every function resolves a transaction, or rejects when it should fail.
const mockContract = (functionName, { fails = false } = {}) => {
  const contract = {
    [functionName]: jest.fn(() => (fails ? Promise.reject(new Error(`${functionName} reverted`)) : Promise.resolve({ wait: jest.fn().mockResolvedValue(RECEIPT) }))),
  };
  getSignableContract.mockResolvedValue(contract);
  return contract;
};

describe("App.appeal", () => {
  it("funds an appeal on IDisputeResolver with the ruling and the contribution in wei", async () => {
    const app = createApp({ network: "100" });
    const contract = mockContract("fundAppeal");

    expect(await app.appeal(ARBITRABLE, 41n, 4, "0.5")).toEqual(RECEIPT);
    expect(getSignableContract).toHaveBeenCalledWith("IDisputeResolver", ARBITRABLE, app.state.walletProvider);
    expect(contract.fundAppeal).toHaveBeenCalledWith(41n, 4, { value: ethers.parseEther("0.5") });
  });

  it("appeals an EscrowV1 dispute by paying the appeal cost", async () => {
    const app = createApp({ network: "1" });
    const contract = mockContract("appeal");

    expect(await app.appeal(ESCROW_V1_MAINNET, 7n, 0, "0.25")).toEqual(RECEIPT);
    expect(getSignableContract).toHaveBeenCalledWith("MultipleArbitrableTokenTransaction", ESCROW_V1_MAINNET, app.state.walletProvider);
    expect(contract.appeal).toHaveBeenCalledWith(7n, { value: ethers.parseEther("0.25") });
  });

  it("resolves null when the transaction fails", async () => {
    expect(await createApp({ network: "100" }).appeal(ARBITRABLE, 41n, 4, "0.5")).toBeNull();
    mockContract("fundAppeal", { fails: true });
    expect(await createApp({ network: "100" }).appeal(ARBITRABLE, 41n, 4, "0.5")).toBeNull();
    mockContract("appeal", { fails: true });
    expect(await createApp({ network: "1" }).appeal(ESCROW_V1_MAINNET, 7n, 0, "0.25")).toBeNull();
  });
});

describe("App.submitEvidence", () => {
  const evidence = { disputeID: 41n, evidenceTitle: "Receipt", evidenceDescription: "Paid in full.", evidenceDocument: "QmReceipt", supportingSide: 1 };

  beforeEach(() => {
    uploadToIpfs.mockResolvedValue("/ipfs/QmEvidence/evidence.json");
  });

  it("uploads the evidence JSON and submits its URI with the local dispute ID to the arbitrable", async () => {
    const app = createApp({ network: "100" });
    const contract = mockContract("submitEvidence");

    expect(await app.submitEvidence(ARBITRABLE, evidence)).toEqual(RECEIPT);

    const [filename, blob, role] = uploadToIpfs.mock.calls[0];
    expect(filename).toBe("evidence.json");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    expect(role).toBe("policy");
    expect(getSignableContract).toHaveBeenCalledWith("ArbitrableProxy", ARBITRABLE, app.state.walletProvider);
    expect(contract.submitEvidence).toHaveBeenCalledWith(41n, "/ipfs/QmEvidence/evidence.json", { value: 0n });
  });

  it("submits only the URI to a governor contract, which has no local dispute IDs", async () => {
    const app = createApp({ network: "100" });
    const contract = mockContract("submitEvidence");

    expect(await app.submitEvidence(GOVERNOR_GNOSIS, { ...evidence, disputeID: null })).toEqual(RECEIPT);
    expect(getSignableContract).toHaveBeenCalledWith("KlerosGovernor", GOVERNOR_GNOSIS, app.state.walletProvider);
    expect(contract.submitEvidence).toHaveBeenCalledWith("/ipfs/QmEvidence/evidence.json");
  });

  it("rejects without a local dispute ID on a non-governor arbitrable", async () => {
    const app = createApp({ network: "100" });
    const contract = mockContract("submitEvidence");

    await expect(app.submitEvidence(ARBITRABLE, { ...evidence, disputeID: null })).rejects.toThrow("does not support evidence submission");
    expect(contract.submitEvidence).not.toHaveBeenCalled();
  });

  it("rejects when the transaction fails", async () => {
    mockContract("submitEvidence", { fails: true });
    await expect(createApp({ network: "100" }).submitEvidence(ARBITRABLE, evidence)).rejects.toThrow("submitEvidence reverted");
  });
});

describe("App.withdrawFeesAndRewardsForAllRounds", () => {
  it("withdraws for the connected account and the ruling contributed to", async () => {
    const app = createApp({ network: "100" });
    const contract = mockContract("withdrawFeesAndRewardsForAllRounds");

    expect(await app.withdrawFeesAndRewardsForAllRounds(ARBITRABLE, 41n, "4", ARBITRABLE)).toEqual(RECEIPT);
    expect(getSignableContract).toHaveBeenCalledWith("IDisputeResolver", ARBITRABLE, app.state.walletProvider);
    expect(contract.withdrawFeesAndRewardsForAllRounds).toHaveBeenCalledWith(41n, app.state.activeAddress, "4", { value: 0n });
  });

  it("uses the v1 interface for the exceptional contracts", async () => {
    const app = createApp({ network: "1" });
    const contract = mockContract("withdrawFeesAndRewardsForAllRounds");

    expect(await app.withdrawFeesAndRewardsForAllRounds(UNSLASHED_MAINNET, 3n, ["1", "2"], UNSLASHED_MAINNET)).toEqual(RECEIPT);
    expect(getSignableContract).toHaveBeenCalledWith("IDisputeResolver_v1", UNSLASHED_MAINNET, app.state.walletProvider);
    expect(contract.withdrawFeesAndRewardsForAllRounds).toHaveBeenCalledWith(3n, app.state.activeAddress, ["1", "2"], { value: 0n });
  });

  it("resolves null when the transaction fails", async () => {
    mockContract("withdrawFeesAndRewardsForAllRounds", { fails: true });
    expect(await createApp({ network: "100" }).withdrawFeesAndRewardsForAllRounds(ARBITRABLE, 41n, "4", ARBITRABLE)).toBeNull();
  });
});

describe("fixture mode", () => {
  let container;

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

  const renderApp = async path => {
    window.history.pushState({}, "", path);
    container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      ReactDOM.render(<App />, container);
    });
    await waitFor(() => container.querySelector("main") !== null && container.querySelector('[aria-busy="true"]') === null);
  };

  afterEach(() => {
    if (container) {
      ReactDOM.unmountComponentAtNode(container);
      container.remove();
      container = null;
    }
    window.history.pushState({}, "", "/");
  });

  it("opens a case through the real read callbacks and shows the signed-in UI with the flag", async () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    process.env.REACT_APP_FIXTURE_SIGNED_IN = "true";
    await renderApp("/100/cases/900001");

    expect(container.querySelector("h1").textContent).toBe("Which deliverables of the website contract were completed?");
    expect(container.textContent).not.toContain("Read-only mode");
    const submit = Array.from(container.querySelectorAll("button")).find(button => button.textContent.trim() === "Submit New Evidence");
    expect(submit.disabled).toBe(false);
    expect(container.querySelectorAll(".crowdfundingCard")).toHaveLength(17);
    expect(container.textContent).toContain("03d 09h 59m");
    expect(getSignableContract).not.toHaveBeenCalled();
  });

  it("shows the view-only UI without the flag and never touches a contract", async () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    await renderApp("/100/cases/1005");

    expect(container.querySelector("h1").textContent).toBe("Add a module to Address Tags Query (ATQ) Registry");
    expect(container.textContent).toContain("Read-only mode");
    expect(container.textContent).toContain("You can only browse disputes.");
    expect(container.textContent).toContain("Jury decision: No, Don't Add It");
    expect(getSignableContract).not.toHaveBeenCalled();

    await act(async () => {
      Simulate.click(Array.from(container.querySelectorAll("button")).find(button => button.textContent.trim() === "Fund"));
    });
    expect(getSignableContract).not.toHaveBeenCalled();
  });

  //The header and footer render from the wallet status the adapter builds out of the fixture settings.
  const navLabels = () => Array.from(container.querySelectorAll("header nav a.nav-link")).map(link => link.textContent.trim());

  it("shows the fixture account in the header, with the Create link and no banner, with the signed-in flag", async () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    process.env.REACT_APP_FIXTURE_SIGNED_IN = "true";
    await renderApp("/100/ongoing");

    const header = container.querySelector("header");
    expect(header.querySelector('[title="0x1111111111111111111111111111111111111111"]').textContent).toBe("0x1111…1111");
    expect(header.querySelector('[role="status"]')).toBeNull();
    expect(header.querySelector('[role="alert"]')).toBeNull();
    expect(navLabels()).toEqual(["Ongoing Disputes", "Create", "Case Lookup"]);
    expect(container.querySelector("footer").textContent).toContain("Gnosis Network");
  });

  const switcherToggle = () => container.querySelector("header .switcher button.dropdown-toggle");
  const switchTo = async chainName => {
    await act(async () => {
      Simulate.click(switcherToggle());
    });
    const item = Array.from(container.querySelectorAll("header .switcher .dropdown-item")).find(node => node.textContent === chainName);
    await act(async () => {
      Simulate.click(item);
    });
    await waitFor(() => !switcherToggle().disabled && container.querySelector('[aria-busy="true"]') === null);
  };
  const disputeIDs = () => Array.from(container.querySelectorAll(".disputeID")).map(node => node.textContent);

  it("switches between the fixture chains on the Ongoing page", async () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    await renderApp("/100/ongoing");
    expect(disputeIDs()).toHaveLength(8);
    expect(Array.from(container.querySelectorAll("header .switcher .dropdown-item")).map(node => node.textContent)).toEqual([]);

    await switchTo("Ethereum Mainnet");
    await waitFor(() => disputeIDs().length === 0);

    expect(container.querySelector("footer").textContent).toContain("Ethereum Mainnet");
    expect(switcherToggle().textContent).toBe("Ethereum Mainnet");
    expect(window.location.pathname).toBe("/1/ongoing");
    expect(container.querySelector("header nav a.nav-link").getAttribute("href")).toBe("/1/ongoing/");

    await switchTo("Gnosis Network");
    await waitFor(() => disputeIDs().length === 8);
    expect(window.location.pathname).toBe("/100/ongoing");
  });

  it("keeps the case id when switching: the case loads on a chain that has it and says so on one that does not", async () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    await renderApp("/100/cases/1005");
    expect(container.querySelector("h1").textContent).toBe("Add a module to Address Tags Query (ATQ) Registry");

    await switchTo("Ethereum Mainnet");
    await waitFor(() => container.textContent.includes("does not exist on this network"));

    expect(container.textContent).toContain("Dispute with ID 1005 does not exist on this network.");
    expect(container.querySelector("footer").textContent).toContain("Ethereum Mainnet");
    expect(window.location.pathname).toBe("/1/cases/1005");
    //jsdom reports a page reload as a "Not implemented: navigation" error: the case must follow the chain without one.
    expect(console.error.mock.calls.flat().some(argument => String(argument?.message ?? argument).includes("Not implemented: navigation"))).toBe(false);

    await switchTo("Gnosis Network");
    await waitFor(() => container.querySelector("h1")?.textContent === "Add a module to Address Tags Query (ATQ) Registry");
    expect(window.location.pathname).toBe("/100/cases/1005");
  });

  it("shows the read-only banner without any action, no Create link and the chain in the footer without the flag", async () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    await renderApp("/100/ongoing");

    const banner = container.querySelector('header [role="status"]');
    expect(banner.textContent).toBe("Read-only modeYou can only browse disputes.");
    expect(banner.querySelector("a, button")).toBeNull();
    expect(navLabels()).toEqual(["Ongoing Disputes", "Case Lookup"]);
    const footer = container.querySelector("footer");
    expect(footer.textContent).toContain("Gnosis Network");
    expect(footer.querySelector('a[href="https://gnosisscan.io/address/0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c#code"]')).not.toBeNull();
  });
});

describe("real mode with a wallet", () => {
  const ACCOUNT = "0x00000000000000000000000000000000000000AA";
  const CONNECT_LABEL = "Connect wallet";
  const GNOSIS_ARBITRATOR = networkMap[100].KLEROS_LIQUID;
  const MAINNET_ARBITRATOR = networkMap[1].KLEROS_LIQUID;
  let container;
  let wallet;

  //Polls until the condition holds, letting the wallet, the fake providers and the React updates settle in between.
  const waitFor = async (condition, timeoutMs = 5000) => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for the app to settle.");
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    }
  };

  //A minimal EIP-1193 wallet. It answers on a later task, like the extension does, so the app's own timers run in between.
  //A switch request moves the wallet and, when it reports chains, emits chainChanged on a later task; `switchError` makes it throw instead.
  const installWallet = ({ chainId, accounts = [], approveConnection = true, reportsChain = true, switchError = null }) => {
    const listeners = {};
    wallet = {
      chainId,
      accounts,
      approveConnection,
      reportsChain,
      switchError,
      selectedAddress: accounts[0] ?? null,
      request: jest.fn(async ({ method, params }) => {
        await new Promise(resolve => setTimeout(resolve, 0));
        switch (method) {
          case "eth_chainId":
            return wallet.chainId;
          case "eth_accounts":
            return wallet.accounts;
          case "eth_requestAccounts":
            if (!wallet.approveConnection) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
            wallet.accounts = [ACCOUNT];
            return wallet.accounts;
          case "wallet_switchEthereumChain": {
            if (wallet.switchError) throw wallet.switchError;
            wallet.chainId = params[0].chainId;
            if (wallet.reportsChain) setTimeout(() => wallet.emit("chainChanged", wallet.chainId), 0);
            return null;
          }
          default:
            throw new Error(`Unexpected wallet request: ${method}`);
        }
      }),
      on: jest.fn((event, listener) => {
        listeners[event] = [...(listeners[event] ?? []), listener];
      }),
      removeAllListeners: jest.fn(event => {
        delete listeners[event];
      }),
      emit: (event, payload) => (listeners[event] ?? []).forEach(listener => listener(payload)),
    };
    window.ethereum = wallet;
  };

  //The court of a chain lists the given disputes, but only when read through that chain's own RPC. Dispute details and
  //courts are unreadable, so a card is rendered from its ID alone and the court enumeration ends at once. With
  //`readableDisputes`, the dispute structs can be read instead, so the meta-evidence of each dispute is requested.
  const mockCourts = (disputesByRpc, { readableDisputes = false } = {}) => {
    const filters = { NewPeriod: () => "NewPeriod", DisputeCreation: () => "DisputeCreation" };
    const unreadable = () => Promise.reject(Object.assign(new Error("call reverted"), { code: "CALL_EXCEPTION" }));
    const readable = async () => ({ arbitrated: ARBITRABLE, subcourtID: 0n, period: 0n, lastPeriodChange: 0n, ruled: false });
    getContract.mockImplementation((name, address, provider) => ({
      filters,
      queryFilter: async filter => (filter === "DisputeCreation" ? (disputesByRpc[address]?.[provider.url] ?? []).map(id => ({ args: { _disputeID: BigInt(id) } })) : []),
      disputes: readableDisputes ? readable : unreadable,
      getSubcourt: { estimateGas: unreadable },
    }));
  };

  const renderApp = async path => {
    window.history.pushState({}, "", path);
    container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      ReactDOM.render(<App />, container);
    });
    await waitFor(() => container.querySelector("main") !== null && container.querySelector('[aria-busy="true"]') === null);
  };

  const header = () => container.querySelector("header");
  const banner = () => header().querySelector('.notice[role="status"]');
  //The labels of the header's buttons apart from the chain switcher; the responsive toggle has no text and is left out.
  const headerButtons = () =>
    Array.from(header().querySelectorAll("button"))
      .filter(button => !button.closest(".switcher"))
      .map(button => button.textContent.trim())
      .filter(Boolean);
  const walletButton = () => header().querySelector(".wallet button:not(.dropdown-toggle)");
  const switcherToggle = () => header().querySelector(".switcher button.dropdown-toggle");
  const switchError = () => header().querySelector('.wallet [role="alert"]');
  const navHrefs = () => Array.from(header().querySelectorAll("nav a.nav-link")).map(link => link.getAttribute("href"));
  const disputeIDs = () => Array.from(container.querySelectorAll(".disputeID")).map(node => node.textContent);
  const courtReads = arbitrator => getContract.mock.calls.filter(([name, address]) => name === "KlerosLiquid" && address === arbitrator);
  const switchRequests = () => wallet.request.mock.calls.filter(([{ method }]) => method === "wallet_switchEthereumChain").map(([{ params }]) => params[0].chainId);

  //Picks a chain in the header's switcher and waits for the switch request to be answered.
  const switchTo = async chainName => {
    await act(async () => {
      Simulate.click(switcherToggle());
    });
    const item = Array.from(header().querySelectorAll(".switcher .dropdown-item")).find(node => node.textContent === chainName);
    await act(async () => {
      Simulate.click(item);
    });
    await waitFor(() => !switcherToggle().disabled);
  };
  const settled = () => container.querySelector("main") !== null && container.querySelector('[aria-busy="true"]') === null;

  afterEach(() => {
    if (container) {
      ReactDOM.unmountComponentAtNode(container);
      container.remove();
      container = null;
    }
    delete window.ethereum;
    getContract.mockReset();
    localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("offers Connect wallet in the header, and no action in the banner, after the connection request is rejected", async () => {
    installWallet({ chainId: "0x64", approveConnection: false });
    mockCourts({});
    await renderApp("/100/ongoing");

    expect(wallet.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    expect(headerButtons()).toEqual([CONNECT_LABEL]);
    expect(walletButton().disabled).toBe(false);
    expect(header().textContent).not.toMatch(/rejected|Retry|Could not connect|went wrong/);
    expect(banner().textContent).toBe("Read-only modeYou can only browse disputes.");
    expect(banner().querySelector("a, button")).toBeNull();
    expect(container.querySelector("footer").textContent).toContain("Gnosis Network");

    //Rejecting the prompt again changes nothing.
    wallet.request.mockClear();
    await act(async () => {
      Simulate.click(walletButton());
    });
    await waitFor(() => headerButtons().every(label => label === CONNECT_LABEL) && !walletButton().disabled);
    expect(wallet.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    expect(headerButtons()).toEqual([CONNECT_LABEL]);
    expect(banner().querySelector("a, button")).toBeNull();
    expect(header().textContent).not.toMatch(/rejected|Retry|Could not connect|went wrong/);

    //Approving it connects the account.
    wallet.approveConnection = true;
    await act(async () => {
      Simulate.click(walletButton());
    });
    await waitFor(() => header().querySelector(`[title="${ACCOUNT}"]`) !== null);
    expect(banner()).toBeNull();
    expect(headerButtons()).toEqual([]);
    expect(header().textContent).toContain("Gnosis Network");
  });

  it("lists the disputes of the chain the wallet switched to, read through that chain's own RPC", async () => {
    installWallet({ chainId: "0x64", accounts: [ACCOUNT] });
    mockCourts({
      [GNOSIS_ARBITRATOR]: { [networkMap[100].WEB3_PROVIDER]: ["1013"] },
      [MAINNET_ARBITRATOR]: { [networkMap[1].WEB3_PROVIDER]: ["7"] },
    });
    await renderApp("/100/ongoing");
    expect(disputeIDs()).toEqual(["1013"]);
    expect(container.querySelector("footer").textContent).toContain("Gnosis Network");

    await act(async () => {
      wallet.chainId = "0x1";
      wallet.emit("chainChanged", "0x1");
    });
    await waitFor(() => courtReads(MAINNET_ARBITRATOR).length > 0 && container.querySelector('[aria-busy="true"]') === null);

    const mainnetReadUrls = new Set(courtReads(MAINNET_ARBITRATOR).map(([, , provider]) => provider.url));
    expect(mainnetReadUrls).toEqual(new Set([networkMap[1].WEB3_PROVIDER]));
    expect(disputeIDs()).toEqual(["7"]);
    expect(container.querySelector("footer").textContent).toContain("Ethereum Mainnet");
    expect(header().querySelector(`[title="${ACCOUNT}"]`)).not.toBeNull();
    expect(window.location.pathname).toBe("/1/ongoing");
    expect(navHrefs()).toEqual(["/1/ongoing/", "/1/create/", "/1/cases/"]);
    expect(switcherToggle().textContent).toBe("Ethereum Mainnet");
  });

  describe("courts on the Create page", () => {
    const GNOSIS_POLICY_REGISTRY = networkMap[100].POLICY_REGISTRY;
    let originalFetch;

    //Court 0 is the only court; its policy read on the registry, and the policy fetch, behave as the flags say.
    const mockCourtWithPolicy = ({ policyReadFails = false }) => {
      const getSubcourt = jest.fn(async () => [0n, false, 1n, 1000n, 1n, [60n, 60n, 60n, 60n], 1n]);
      getSubcourt.estimateGas = async id => {
        if (Number(id) === 0) return 1n;
        throw Object.assign(new Error("out of range"), { code: "CALL_EXCEPTION" });
      };
      getContract.mockImplementation((name, address) => {
        if (name === "PolicyRegistry" && address === GNOSIS_POLICY_REGISTRY) {
          return { policies: jest.fn(() => (policyReadFails ? Promise.reject(new Error("registry unreachable")) : Promise.resolve("/ipfs/QmPolicy"))) };
        }
        if (name === "IArbitrator") return { arbitrationCost: async () => 1000000000000000000n };
        return { getSubcourt, filters: {}, queryFilter: async () => [] };
      });
    };

    beforeEach(() => {
      originalFetch = global.fetch;
      global.fetch = jest.fn(async () => ({ json: async () => ({ name: "General Court" }) }));
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    const courtToggle = () => container.querySelector("#subcourt-dropdown");
    const costBox = () => container.querySelector("#arbitrationCost");
    const tryAgain = () => Array.from(costBox().querySelectorAll("button")).find(button => button.textContent.trim() === "Try again");

    it("ends in a failure with a retry when a court policy read rejects, and loads the courts on retry", async () => {
      delete window.ethereum;
      mockCourtWithPolicy({ policyReadFails: true });
      await renderApp("/100/create");

      expect(courtToggle().textContent).toContain("No courts loaded");
      expect(courtToggle().disabled).toBe(true);
      expect(costBox().textContent).toContain("The courts could not be loaded, so the cost is unknown.");
      expect(costBox().textContent).not.toContain("Reload the page");
      expect(tryAgain()).toBeDefined();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to load the subcourts of network 100"), expect.any(Error));

      mockCourtWithPolicy({ policyReadFails: false });
      await act(async () => {
        Simulate.click(tryAgain());
      });
      await waitFor(() => courtToggle().textContent.includes("General Court") && settled());

      expect(courtToggle().disabled).toBe(false);
      expect(costBox().textContent).not.toContain("could not be loaded");
    });

    it("keeps the courts whose policy fetch failed, without a name, instead of failing the whole list", async () => {
      delete window.ethereum;
      mockCourtWithPolicy({ policyReadFails: false });
      global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
      await renderApp("/100/create");

      expect(courtToggle().disabled).toBe(false);
      expect(courtToggle().textContent).toContain("Select a court");
      expect(costBox().textContent).not.toContain("could not be loaded");
    });
  });

  describe("chain switcher", () => {
    const bothCourts = () =>
      mockCourts({
        [GNOSIS_ARBITRATOR]: { [networkMap[100].WEB3_PROVIDER]: ["1013"] },
        [MAINNET_ARBITRATOR]: { [networkMap[1].WEB3_PROVIDER]: ["7"] },
      });

    const expectOnGnosis = () => {
      expect(disputeIDs()).toEqual(["1013"]);
      expect(container.querySelector("footer").textContent).toContain("Gnosis Network");
      expect(switcherToggle().textContent).toBe("Gnosis Network");
      expect(window.location.pathname).toBe("/100/ongoing");
    };

    const expectOnMainnet = () => {
      expect(disputeIDs()).toEqual(["7"]);
      expect(new Set(courtReads(MAINNET_ARBITRATOR).map(([, , provider]) => provider.url))).toEqual(new Set([networkMap[1].WEB3_PROVIDER]));
      expect(container.querySelector("footer").textContent).toContain("Ethereum Mainnet");
      expect(switcherToggle().textContent).toBe("Ethereum Mainnet");
      expect(window.location.pathname).toBe("/1/ongoing");
      expect(navHrefs()[0]).toBe("/1/ongoing/");
      expect(switchError()).toBeNull();
    };

    it("asks the connected wallet to switch and follows once the wallet reports the new chain", async () => {
      installWallet({ chainId: "0x64", accounts: [ACCOUNT], reportsChain: false });
      bothCourts();
      await renderApp("/100/ongoing");
      expectOnGnosis();

      await switchTo("Ethereum Mainnet");

      //The wallet has accepted the request but not reported the chain yet: the app stays where it is.
      expect(switchRequests()).toEqual(["0x1"]);
      expectOnGnosis();
      expect(switchError()).toBeNull();

      await act(async () => {
        wallet.emit("chainChanged", "0x1");
      });
      await waitFor(() => courtReads(MAINNET_ARBITRATOR).length > 0 && settled());

      expectOnMainnet();
      expect(header().querySelector(`[title="${ACCOUNT}"]`)).not.toBeNull();
      expect(headerButtons()).toEqual([]);
    });

    it("switches the chain it reads from, without asking the wallet, when the wallet is not connected", async () => {
      installWallet({ chainId: "0x64", approveConnection: false });
      bothCourts();
      await renderApp("/100/ongoing");
      expectOnGnosis();
      expect(headerButtons()).toEqual([CONNECT_LABEL]);
      wallet.request.mockClear();

      await switchTo("Ethereum Mainnet");
      await waitFor(() => courtReads(MAINNET_ARBITRATOR).length > 0 && settled());

      expect(wallet.request).not.toHaveBeenCalled();
      expectOnMainnet();
      expect(headerButtons()).toEqual([CONNECT_LABEL]);
      expect(banner().textContent).toBe("Read-only modeYou can only browse disputes.");
    });

    it("switches the chain it reads from when there is no wallet at all", async () => {
      delete window.ethereum;
      bothCourts();
      await renderApp("/100/ongoing");
      expect(disputeIDs()).toEqual(["1013"]);
      expect(switcherToggle().textContent).toBe("Gnosis Network");

      await switchTo("Ethereum Mainnet");
      await waitFor(() => courtReads(MAINNET_ARBITRATOR).length > 0 && settled());

      expectOnMainnet();
      expect(headerButtons()).toEqual([]);
      expect(banner()).not.toBeNull();
    });

    it("stays on the chain, without a message, when the user rejects the switch", async () => {
      installWallet({ chainId: "0x64", accounts: [ACCOUNT], switchError: Object.assign(new Error("User rejected the request."), { code: 4001 }) });
      bothCourts();
      await renderApp("/100/ongoing");

      await switchTo("Ethereum Mainnet");
      await waitFor(settled);

      expect(switchRequests()).toEqual(["0x1"]);
      expectOnGnosis();
      expect(switchError()).toBeNull();
      expect(header().textContent).not.toMatch(/rejected|Could not switch|went wrong/);
      expect(courtReads(MAINNET_ARBITRATOR)).toHaveLength(0);
    });

    it("stays on the chain and says so when the wallet cannot switch, until the next switch succeeds", async () => {
      installWallet({ chainId: "0x64", accounts: [ACCOUNT], switchError: new Error("Internal JSON-RPC error.") });
      bothCourts();
      await renderApp("/100/ongoing");

      await switchTo("Ethereum Mainnet");
      await waitFor(() => switchError() !== null);

      expectOnGnosis();
      expect(switchError().textContent).toBe("Could not switch the network.");
      expect(header().textContent).not.toContain("Internal JSON-RPC error.");
      expect(header().querySelector(`[title="${ACCOUNT}"]`)).not.toBeNull();
      expect(courtReads(MAINNET_ARBITRATOR)).toHaveLength(0);

      wallet.switchError = null;
      await switchTo("Ethereum Mainnet");
      await waitFor(() => courtReads(MAINNET_ARBITRATOR).length > 0 && settled());

      expectOnMainnet();
    });

    it("stops the previous chain's meta-evidence requests on a switch: none of them carries on or retries", async () => {
      const originalFetch = global.fetch;
      const metaEvidenceUrls = chainId => global.fetch.mock.calls.map(([url]) => String(url)).filter(url => url.includes(`chainId=${chainId}&`));
      jest.spyOn(console, "warn").mockImplementation(() => {});
      global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
      try {
        delete window.ethereum;
        mockCourts(
          {
            [GNOSIS_ARBITRATOR]: { [networkMap[100].WEB3_PROVIDER]: ["1013"] },
            [MAINNET_ARBITRATOR]: { [networkMap[1].WEB3_PROVIDER]: ["7"] },
          },
          { readableDisputes: true }
        );

        //Mount without waiting for the page to settle: the Gnosis meta-evidence requests are failing and about to retry.
        window.history.pushState({}, "", "/100/ongoing");
        container = document.createElement("div");
        document.body.appendChild(container);
        await act(async () => {
          ReactDOM.render(<App />, container);
        });
        await waitFor(() => switcherToggle() !== null && metaEvidenceUrls(100).some(url => url.includes("disputeId=1013")));

        await switchTo("Ethereum Mainnet");
        const gnosisRequests = metaEvidenceUrls(100).length;
        await waitFor(() => metaEvidenceUrls(1).length >= 1);

        //Longer than the retry delay: no Gnosis attempt is repeated, while the Mainnet ones go on.
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 2600));
        });
        expect(metaEvidenceUrls(100)).toHaveLength(gnosisRequests);
        expect(global.fetch.mock.calls.filter(([url]) => String(url).includes("chainId=100&")).every(([, options]) => options.signal.aborted)).toBe(true);
        expect(metaEvidenceUrls(1).length).toBeGreaterThanOrEqual(2);
        expect(window.location.pathname).toBe("/1/ongoing");
      } finally {
        global.fetch = originalFetch;
      }
    }, 15000);

    //The wallet's chainChanged starts the provider rebuild; state.network only changes once the signer has been resolved.
    //A read of the old chain that begins in that window must be cancelled, not given the new chain's signal.
    it("cancels a read of the previous chain that starts after the switch began but before the chain state changed", async () => {
      const originalFetch = global.fetch;
      jest.spyOn(console, "warn").mockImplementation(() => {});
      global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
      try {
        installWallet({ chainId: "0x64", accounts: [ACCOUNT] });
        mockCourts({ [GNOSIS_ARBITRATOR]: { [networkMap[100].WEB3_PROVIDER]: ["1013"] } });
        window.history.pushState({}, "", "/100/ongoing");
        container = document.createElement("div");
        document.body.appendChild(container);
        let app;
        await act(async () => {
          app = ReactDOM.render(<App />, container);
        });
        await waitFor(settled);
        expect(app.state.network).toBe("100");
        global.fetch.mockClear();

        let lateGnosisRead;
        await act(async () => {
          wallet.chainId = "0x1";
          wallet.emit("chainChanged", "0x1");
          //Still inside the window: the switch has begun, the chain state has not changed yet.
          expect(app.state.network).toBe("100");
          lateGnosisRead = app.getMetaEvidence(ARBITRABLE, "1013");
        });

        await expect(lateGnosisRead).resolves.toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
        await waitFor(() => app.state.network === "1" && settled());

        //The chain entered has a live signal of its own.
        expect(app.getChainSignal("1").aborted).toBe(false);
        expect(app.getChainSignal("100").aborted).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("offers Mainnet and Gnosis on a testnet too, and switching there reads the new chain", async () => {
      installWallet({ chainId: "0xaa36a7", accounts: [ACCOUNT] });
      bothCourts();
      await renderApp("/11155111/ongoing");
      expect(switcherToggle().textContent).toBe("Ethereum Testnet Sepolia");

      await switchTo("Gnosis Network");
      await waitFor(() => courtReads(GNOSIS_ARBITRATOR).length > 0 && settled());

      expect(switchRequests()).toEqual(["0x64"]);
      expectOnGnosis();
    });
  });
});

const readBlob = blob =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });

describe("App.getArbitratorDispute", () => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const dispute = arbitrated => ({ arbitrated, subcourtID: 0n, period: 0n, lastPeriodChange: 0n, ruled: false });

  it("resolves the dispute struct the arbitrator returns", async () => {
    getContract.mockReturnValue({ disputes: jest.fn().mockResolvedValue(dispute(ARBITRABLE)) });
    await expect(createApp({ network: "100" }).getArbitratorDispute("1013")).resolves.toEqual(dispute(ARBITRABLE));
  });

  it("resolves null when the arbitrator answers an all-zero struct, as some RPCs do for an ID that does not exist", async () => {
    getContract.mockReturnValue({ disputes: jest.fn().mockResolvedValue(dispute(ZERO_ADDRESS)) });
    await expect(createApp({ network: "100" }).getArbitratorDispute("1678")).resolves.toBeNull();
  });

  it("resolves null when the call reverts, and rethrows any other failure", async () => {
    getContract.mockReturnValue({ disputes: jest.fn().mockRejectedValue(Object.assign(new Error("missing revert data"), { code: "CALL_EXCEPTION" })) });
    await expect(createApp({ network: "100" }).getArbitratorDispute("1678")).resolves.toBeNull();

    getContract.mockReturnValue({ disputes: jest.fn().mockRejectedValue(Object.assign(new Error("timeout"), { code: "TIMEOUT" })) });
    await expect(createApp({ network: "100" }).getArbitratorDispute("1678")).rejects.toThrow("timeout");
  });

  it("resolves null on a chain without a court, without any call", async () => {
    getContract.mockReset();
    await expect(createApp({ network: "137" }).getArbitratorDispute("1")).resolves.toBeNull();
    expect(getContract).not.toHaveBeenCalled();
  });
});

describe("App.getMetaEvidence", () => {
  const metaEvidenceUrls = () => global.fetch.mock.calls.map(([url]) => String(url)).filter(url => url.includes("get-dispute-metaevidence") && url.includes("disputeId=1013"));
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("gives up after a bounded number of failed attempts and resolves null, so the page can show the meta-evidence as unavailable", async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const app = createApp({ network: "100" });

    const started = Date.now();
    await expect(app.getMetaEvidence(ARBITRABLE, "1013")).resolves.toBeNull();

    expect(metaEvidenceUrls()).toHaveLength(3);
    expect(metaEvidenceUrls().every(url => url.includes("chainId=100&disputeId=1013"))).toBe(true);
    expect(Date.now() - started).toBeLessThan(8000);
  }, 10000);

  it("stops at once, without another attempt, when the chain changes meanwhile", async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const app = createApp({ network: "100" });

    const pending = app.getMetaEvidence(ARBITRABLE, "1013");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(metaEvidenceUrls()).toHaveLength(1);

    //What handleNetworkChange does first on a chain change.
    app.abortChainRequests("100");
    const started = Date.now();
    await expect(pending).resolves.toBeNull();

    expect(Date.now() - started).toBeLessThan(500);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2500));
    });
    expect(metaEvidenceUrls()).toHaveLength(1);
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  }, 10000);

  it("resolves null without retrying when the service has no meta-evidence for the dispute", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ json: async () => ({ metaEvidenceUri: null }) }));
    await expect(createApp({ network: "100" }).getMetaEvidence(ARBITRABLE, "1013")).resolves.toBeNull();
    expect(metaEvidenceUrls()).toHaveLength(1);
  });
});

describe("App.getArbitrationCostWithCourtAndNoOfJurors", () => {
  it("asks the arbitrator for the cost of the court and the votes, encoded as extra data, and formats it in ether", async () => {
    const app = createApp({ network: "100" });
    app.state.provider = { name: "provider" };
    const contract = { arbitrationCost: jest.fn().mockResolvedValue(36000000000000000000n) };
    getContract.mockReturnValue(contract);

    expect(await app.getArbitrationCostWithCourtAndNoOfJurors("0", "3")).toBe("36.0");
    expect(getContract).toHaveBeenCalledWith("IArbitrator", "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002", app.state.provider);
    expect(contract.arbitrationCost).toHaveBeenCalledWith("0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003");
  });

  it("resolves null when the read fails", async () => {
    getContract.mockReturnValue({ arbitrationCost: jest.fn().mockRejectedValue(new Error("RPC down")) });
    expect(await createApp({ network: "100" }).getArbitrationCostWithCourtAndNoOfJurors("0", "3")).toBeNull();
  });

  it("reads the fixture in fixture mode without touching a contract", async () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    expect(await createApp({ network: "100" }).getArbitrationCostWithCourtAndNoOfJurors("1", 4)).toBe("28.8");
    expect(getContract).not.toHaveBeenCalled();
  });
});

describe("App.createDispute", () => {
  //The options the review step builds for the form filled in create.test.js, with an uploaded primary document.
  const options = {
    selectedSubcourt: "1",
    initialNumberOfJurors: "4",
    title: "Late delivery of the website",
    category: "Escrow",
    description: "The site was delivered two weeks after the deadline.",
    aliases: { "0x00000000000000000000000000000000000000a1": "Alice" },
    question: "Was the website delivered on time?",
    primaryDocument: "/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/contract.pdf",
    numberOfRulingOptions: 2,
    rulingOptions: { type: "single-select", titles: ["Yes", "No"], descriptions: ["Delivered by the agreed date.", "Delivered after the agreed date."] },
  };
  const DISPUTE_CREATION_TOPIC = ethers.id("DisputeCreation(uint256,address)");
  //Dispute 1013 (0x3f5) created by the Gnosis arbitrable proxy.
  const receiptWithDispute = {
    status: 1,
    hash: "0xcreated",
    logs: [{ topics: [DISPUTE_CREATION_TOPIC, "0x00000000000000000000000000000000000000000000000000000000000003f5", "0x000000000000000000000000c7add3c961f7935cb4914e37da991d2f1cd7986c"] }],
  };

  const arrange = ({ receipt = receiptWithDispute, fails = false } = {}) => {
    const app = createApp({ network: "100" });
    app.state.provider = { name: "provider" };
    getContract.mockReturnValue({ arbitrationCost: jest.fn().mockResolvedValue(28800000000000000000n) });
    uploadToIpfs.mockResolvedValue("/ipfs/QmMeta/metaEvidence.json");
    const contract = {
      createDispute: jest.fn(() => (fails ? Promise.reject(new Error("createDispute reverted")) : Promise.resolve({ wait: jest.fn().mockResolvedValue(receipt) }))),
    };
    getSignableContract.mockResolvedValue(contract);
    return { app, contract };
  };

  it("publishes the meta-evidence and calls createDispute on the arbitrable proxy with the extra data, the URI, the number of rulings and the cost", async () => {
    const { app, contract } = arrange();

    expect(await app.createDispute(options)).toEqual({ receipt: receiptWithDispute, disputeID: "1013" });

    expect(uploadToIpfs).toHaveBeenCalledTimes(1);
    const [filename, blob, role] = uploadToIpfs.mock.calls[0];
    expect(filename).toBe("metaEvidence.json");
    expect(role).toBe("policy");
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await readBlob(blob))).toEqual({
      title: "Late delivery of the website",
      category: "Escrow",
      description: "The site was delivered two weeks after the deadline.",
      aliases: { "0x00000000000000000000000000000000000000a1": "Alice" },
      question: "Was the website delivered on time?",
      rulingOptions: { type: "single-select", titles: ["Yes", "No"], descriptions: ["Delivered by the agreed date.", "Delivered after the agreed date."] },
      fileURI: "/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/contract.pdf",
      dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
    });
    expect(getContract).toHaveBeenCalledWith("IArbitrator", "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002", app.state.provider);
    expect(getSignableContract).toHaveBeenCalledWith("ArbitrableProxy", "0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c", app.state.walletProvider);
    expect(contract.createDispute).toHaveBeenCalledTimes(1);
    expect(contract.createDispute).toHaveBeenCalledWith(
      "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000004",
      "/ipfs/QmMeta/metaEvidence.json",
      2,
      { value: 28800000000000000000n }
    );
  });

  it("resolves null when the transaction fails", async () => {
    const { app } = arrange({ fails: true });
    expect(await app.createDispute(options)).toBeNull();
  });

  it("resolves the receipt without an ID when the DisputeCreation event is missing", async () => {
    const receipt = { status: 1, hash: "0xcreated", logs: [] };
    const { app } = arrange({ receipt });
    expect(await app.createDispute(options)).toEqual({ receipt, disputeID: null });
  });
});
