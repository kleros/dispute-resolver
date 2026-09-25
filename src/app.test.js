import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from "react-dom/test-utils";
import { ethers } from "ethers";
import App from './app';
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
    expect(container.textContent).not.toContain("View mode only");
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
    expect(container.textContent).toContain("View mode only: Actions that require an Ethereum account are disabled.");
    expect(container.textContent).toContain("Jury decision: No, Don't Add It");
    expect(getSignableContract).not.toHaveBeenCalled();

    await act(async () => {
      Simulate.click(Array.from(container.querySelectorAll("button")).find(button => button.textContent.trim() === "Fund"));
    });
    expect(getSignableContract).not.toHaveBeenCalled();
  });
});

const readBlob = blob =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
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
