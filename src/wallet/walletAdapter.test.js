import networkMap from "../ethereum/network-contract-mapping";
import * as fixtures from "../fixtures";
import { CONNECTION, EXAMPLES } from "./walletStatus";
import { ERROR_CODES, SWITCHABLE_CHAIN_IDS, buildChainStatus, buildWalletActions, buildWalletStatus, detectSmartContractWallet, isWalletDetected, toWalletError } from "./walletAdapter";

const ENV_KEYS = ["REACT_APP_USE_FIXTURES", "REACT_APP_FIXTURE_SIGNED_IN"];
let originalEnvironment;
let originalEthereum;

beforeEach(() => {
  originalEnvironment = ENV_KEYS.map((key) => process.env[key]);
  ENV_KEYS.forEach((key) => delete process.env[key]);
  originalEthereum = window.ethereum;
  delete window.ethereum;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  ENV_KEYS.forEach((key, index) => {
    if (originalEnvironment[index] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[index];
  });
  if (originalEthereum === undefined) delete window.ethereum;
  else window.ethereum = originalEthereum;
  jest.restoreAllMocks();
});

//Everything below is read from the contract so the tests never hand-copy its values.
const EOA = EXAMPLES.CONNECTED_SUPPORTED.address;
const SMART_CONTRACT_WALLET = EXAMPLES.CONNECTED_SMART_CONTRACT_WALLET.address;
const MAINNET = EXAMPLES.NO_WALLET.chain;
const GNOSIS = EXAMPLES.CONNECTED_GNOSIS.chain;
const SEPOLIA = EXAMPLES.CONNECTED_TESTNET.chain;
const UNSUPPORTED = EXAMPLES.CONNECTED_UNSUPPORTED.chain;
const STATUS_KEYS = Object.keys(EXAMPLES.NO_WALLET).sort();
const CHAIN_KEYS = Object.keys(MAINNET).sort();
const ERROR_KEYS = Object.keys(EXAMPLES.ERROR.error).sort();
const CONNECTIONS = Object.values(CONNECTION);
const REQUEST_ACCOUNTS = { method: "eth_requestAccounts" };
const SWITCHABLE = EXAMPLES.NO_WALLET.chains;
const switchRequest = (chain) => ({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${BigInt(chain.id).toString(16)}` }] });
const CHAIN_ID_REQUEST = { method: "eth_chainId" };

const connected = (network, activeAddress = EOA, isSmartContractWallet = false) => ({ network, activeAddress, walletDetected: true, isSmartContractWallet });

//One App-state input per contract example.
const EXAMPLE_INPUTS = {
  NO_WALLET: { network: MAINNET.id, activeAddress: "", walletDetected: false },
  WALLET_NOT_CONNECTED: { network: MAINNET.id, activeAddress: null, walletDetected: true },
  CONNECTED_SUPPORTED: connected(MAINNET.id),
  CONNECTED_GNOSIS: connected(GNOSIS.id),
  CONNECTED_TESTNET: connected(SEPOLIA.id),
  CONNECTED_SMART_CONTRACT_WALLET: connected(MAINNET.id, SMART_CONTRACT_WALLET, true),
  CONNECTED_UNSUPPORTED: connected(UNSUPPORTED.id),
  CONNECTING: { network: "", activeAddress: "", walletDetected: true, initializing: true },
  ERROR: { network: "", activeAddress: "", walletDetected: true, error: new Error("provider exploded") },
  SWITCH_FAILED: { ...connected(MAINNET.id), switchError: new Error("wallet could not switch") },
};

const userRejection = () => Object.assign(new Error("User rejected the request."), { code: 4001 });
//How ethers v6 hands the same refusal to App: wrapped under ACTION_REJECTED, with the wallet's error kept under info.
const ethersRejection = () => Object.assign(new Error("user rejected action"), { code: "ACTION_REJECTED", info: { error: userRejection() } });

const expectChainStatusShape = (chain) => {
  expect(Object.keys(chain).sort()).toEqual(CHAIN_KEYS);
  expect(typeof chain.id).toBe("string");
  expect(chain.id).not.toBe("");
  expect(typeof chain.supported).toBe("boolean");
  expect(typeof chain.testnet).toBe("boolean");
  expect(chain.name === null || typeof chain.name === "string").toBe(true);
  expect(chain.currency === null || typeof chain.currency === "string").toBe(true);
  expect(chain.contractExplorerUrl === null || typeof chain.contractExplorerUrl === "string").toBe(true);
  if (!chain.supported) expect(chain).toStrictEqual({ ...UNSUPPORTED, id: chain.id });
};

//The invariants of the WalletStatus typedef, checked on every status the adapter produces.
const expectWalletStatusShape = (status) => {
  expect(Object.keys(status).sort()).toEqual(STATUS_KEYS);
  expect(CONNECTIONS).toContain(status.connection);
  expect(typeof status.walletDetected).toBe("boolean");
  expect(typeof status.viewOnly).toBe("boolean");
  expect(status.address === null || typeof status.address === "string").toBe(true);
  expect(status.viewOnly).toBe(status.address === null);
  expect(status.isSmartContractWallet === null || typeof status.isSmartContractWallet === "boolean").toBe(true);
  expect(Array.isArray(status.chains)).toBe(true);
  status.chains.forEach((chain) => {
    expectChainStatusShape(chain);
    expect(chain.supported).toBe(true);
  });
  expect(status.switchError === null || (status.switchError.code === ERROR_CODES.SWITCH_FAILED && typeof status.switchError.message === "string")).toBe(true);

  if (status.chain === null) expect(status.connection).toBe(CONNECTION.CONNECTING);
  else expectChainStatusShape(status.chain);

  if (status.connection === CONNECTION.ERROR) {
    expect(Object.keys(status.error).sort()).toEqual(ERROR_KEYS);
    expect(Object.values(ERROR_CODES)).toContain(status.error.code);
    expect(typeof status.error.message).toBe("string");
  } else {
    expect(status.error).toBeNull();
  }

  if (status.connection === CONNECTION.CONNECTED) {
    expect(status.address).not.toBeNull();
  } else {
    expect(status.address).toBeNull();
    expect(status.isSmartContractWallet).toBeNull();
  }
};

describe("buildChainStatus", () => {
  it("reproduces the chains of the contract examples", () => {
    expect(buildChainStatus("1")).toStrictEqual(MAINNET);
    expect(buildChainStatus("100")).toStrictEqual(GNOSIS);
    expect(buildChainStatus("11155111")).toStrictEqual(SEPOLIA);
    expect(buildChainStatus("999")).toStrictEqual(UNSUPPORTED);
  });

  it("is null while the chain is unknown", () => {
    expect(buildChainStatus("")).toBeNull();
    expect(buildChainStatus("   ")).toBeNull();
    expect(buildChainStatus(null)).toBeNull();
    expect(buildChainStatus(undefined)).toBeNull();
  });

  it("normalises numbers, bigints, hex and zero-padded ids to the decimal string", () => {
    expect(buildChainStatus(100)).toStrictEqual(GNOSIS);
    expect(buildChainStatus(BigInt(100))).toStrictEqual(GNOSIS);
    expect(buildChainStatus("0x64")).toStrictEqual(GNOSIS);
    expect(buildChainStatus("0100")).toStrictEqual(GNOSIS);
    expect(buildChainStatus(" 1 ")).toStrictEqual(MAINNET);
  });

  it("treats any other value as an unsupported chain instead of throwing", () => {
    expect(buildChainStatus("abc")).toStrictEqual({ ...UNSUPPORTED, id: "abc" });
    expect(buildChainStatus("constructor")).toStrictEqual({ ...UNSUPPORTED, id: "constructor" });
    expect(buildChainStatus(-1)).toStrictEqual({ ...UNSUPPORTED, id: "-1" });
    expect(buildChainStatus(Number.NaN)).toStrictEqual({ ...UNSUPPORTED, id: "NaN" });
    expect(buildChainStatus(true)).toStrictEqual({ ...UNSUPPORTED, id: "true" });
    expect(buildChainStatus({})).toStrictEqual({ ...UNSUPPORTED, id: "[object Object]" });
  });

  it("is null for a value that cannot be turned into text", () => {
    expect(buildChainStatus(Object.create(null))).toBeNull();
  });

  it("has no explorer link on supported chains without a known explorer or without an ArbitrableProxy", () => {
    const polygon = buildChainStatus("137");
    expect(polygon).toMatchObject({ id: "137", supported: true, name: networkMap[137].NAME, currency: networkMap[137].CURRENCY_SHORT, testnet: false, contractExplorerUrl: null });

    const goerli = buildChainStatus("5");
    expect(networkMap[5].ARBITRABLE_PROXY).toBeTruthy();
    expect(goerli).toMatchObject({ id: "5", supported: true, testnet: true, contractExplorerUrl: null });
  });

  it("flags testnets and links their proxy when the explorer is known", () => {
    expect(buildChainStatus("10200")).toStrictEqual({
      id: "10200",
      supported: true,
      name: networkMap[10200].NAME,
      testnet: true,
      currency: networkMap[10200].CURRENCY_SHORT,
      contractExplorerUrl: `https://gnosis-chiado.blockscout.com/address/${networkMap[10200].ARBITRABLE_PROXY}#code`,
    });
  });
});

describe("buildWalletStatus reproduces the contract examples", () => {
  it("has an input for every example", () => {
    expect(Object.keys(EXAMPLE_INPUTS).sort()).toEqual(Object.keys(EXAMPLES).sort());
  });

  Object.entries(EXAMPLE_INPUTS).forEach(([name, input]) => {
    it(`builds EXAMPLES.${name}`, () => {
      const status = buildWalletStatus(input);
      expect(status).toStrictEqual(EXAMPLES[name]);
      expectWalletStatusShape(status);
    });
  });
});

describe("buildWalletStatus precedence", () => {
  it("stays connecting while initializing, whatever else is set", () => {
    const status = buildWalletStatus({ ...connected(MAINNET.id), initializing: true, error: new Error("late") });
    expect(status).toStrictEqual(EXAMPLES.CONNECTING);
  });

  it("is connecting while the chain is unknown and nothing failed, even with an address", () => {
    expect(buildWalletStatus({ network: "", activeAddress: EOA, walletDetected: true })).toStrictEqual(EXAMPLES.CONNECTING);
    expect(buildWalletStatus({ network: undefined, walletDetected: false })).toStrictEqual({ ...EXAMPLES.CONNECTING, walletDetected: false });
  });

  it("drops the address in the error state and keeps the chain that was known", () => {
    const status = buildWalletStatus({ ...connected(UNSUPPORTED.id), error: new Error("boom") });
    expect(status).toStrictEqual({ ...EXAMPLES.ERROR, chain: UNSUPPORTED });
  });

  it("falls back to mainnet in the error state when the chain is unknown", () => {
    expect(buildWalletStatus({ network: null, walletDetected: true, error: "boom" })).toStrictEqual(EXAMPLES.ERROR);
  });

  it("leaves the connection at none, without an error, after the user rejected the initialisation prompt", () => {
    [userRejection(), ethersRejection()].forEach((error) => {
      const status = buildWalletStatus({ network: MAINNET.id, walletDetected: true, error });
      expect(status).toStrictEqual(EXAMPLES.WALLET_NOT_CONNECTED);
      expectWalletStatusShape(status);
    });
  });

  it("keeps connecting, not failing, while the chain is unknown after a rejected prompt", () => {
    expect(buildWalletStatus({ network: "", walletDetected: true, error: userRejection() })).toStrictEqual(EXAMPLES.CONNECTING);
  });

  it("still connects an account that was granted despite an earlier rejection", () => {
    expect(buildWalletStatus({ ...connected(GNOSIS.id), error: userRejection() })).toStrictEqual(EXAMPLES.CONNECTED_GNOSIS);
  });

  it("keeps a WalletError that was already mapped", () => {
    const error = { code: ERROR_CODES.UNKNOWN, message: "Custom sentence." };
    expect(buildWalletStatus({ network: MAINNET.id, walletDetected: true, error }).error).toStrictEqual(error);
  });

  it("reports an unknown smart contract wallet check as null", () => {
    expect(buildWalletStatus({ network: MAINNET.id, activeAddress: EOA, walletDetected: true }).isSmartContractWallet).toBeNull();
    expect(buildWalletStatus({ network: MAINNET.id, activeAddress: EOA, walletDetected: true, isSmartContractWallet: "yes" }).isSmartContractWallet).toBeNull();
  });

  it("ignores the smart contract wallet flag when there is no address", () => {
    expect(buildWalletStatus({ network: MAINNET.id, walletDetected: true, isSmartContractWallet: true })).toStrictEqual(EXAMPLES.WALLET_NOT_CONNECTED);
  });
});

describe("buildWalletStatus with odd input", () => {
  const ODD_INPUTS = [
    undefined,
    null,
    {},
    { network: NaN },
    { network: {} },
    { network: "abc", activeAddress: EOA },
    { network: 100, activeAddress: EOA },
    { network: BigInt(1), activeAddress: EOA },
    { network: MAINNET.id, activeAddress: 42 },
    { network: MAINNET.id, activeAddress: "   " },
    { network: MAINNET.id, activeAddress: { address: EOA } },
    { network: MAINNET.id, walletDetected: "yes" },
    { network: MAINNET.id, initializing: 1 },
    { network: MAINNET.id, error: 0 },
    { network: MAINNET.id, error: { code: "not-a-code", message: 7 } },
    { network: MAINNET.id, error: { error: { code: 4001 } } },
    { network: UNSUPPORTED.id, error: new TypeError("weird") },
  ];

  ODD_INPUTS.forEach((input, index) => {
    it(`never throws and keeps the shape (case ${index})`, () => {
      expect(() => buildWalletStatus(input)).not.toThrow();
      expectWalletStatusShape(buildWalletStatus(input));
    });
  });

  it("treats an empty or non-string address as no account", () => {
    expect(buildWalletStatus({ network: MAINNET.id, activeAddress: 42, walletDetected: true })).toStrictEqual(EXAMPLES.WALLET_NOT_CONNECTED);
    expect(buildWalletStatus({ network: MAINNET.id, activeAddress: "   ", walletDetected: true })).toStrictEqual(EXAMPLES.WALLET_NOT_CONNECTED);
  });

  it("accepts a numeric chain id and an unknown text id", () => {
    expect(buildWalletStatus(connected(100))).toStrictEqual(EXAMPLES.CONNECTED_GNOSIS);
    expect(buildWalletStatus(connected("abc"))).toStrictEqual({ ...EXAMPLES.CONNECTED_UNSUPPORTED, chain: { ...UNSUPPORTED, id: "abc" } });
  });

  it("does not report a wallet as detected on a non-boolean flag unless it is truthy", () => {
    expect(buildWalletStatus({ network: MAINNET.id, walletDetected: 0 }).walletDetected).toBe(false);
    expect(buildWalletStatus({ network: MAINNET.id, walletDetected: "yes" }).walletDetected).toBe(true);
  });
});

describe("buildWalletStatus in fixture mode", () => {
  beforeEach(() => {
    process.env.REACT_APP_USE_FIXTURES = "true";
  });

  it("yields CONNECTED_GNOSIS when the fixture is signed in on Gnosis, without any wallet", () => {
    process.env.REACT_APP_FIXTURE_SIGNED_IN = "true";
    const input = { network: GNOSIS.id, activeAddress: fixtures.getSignedInAddress(), walletDetected: false, isSmartContractWallet: null };
    expect(buildWalletStatus(input)).toStrictEqual(EXAMPLES.CONNECTED_GNOSIS);
  });

  it("fills in the signed-in address when App has not set it yet", () => {
    process.env.REACT_APP_FIXTURE_SIGNED_IN = "true";
    expect(buildWalletStatus({ network: GNOSIS.id, activeAddress: "" })).toStrictEqual(EXAMPLES.CONNECTED_GNOSIS);
  });

  it("reports no wallet when the fixture is not signed in, whatever the wallet input says", () => {
    const status = buildWalletStatus({ network: GNOSIS.id, activeAddress: "", walletDetected: true });
    expect(status).toStrictEqual({ ...EXAMPLES.NO_WALLET, chain: GNOSIS });
  });

  it("still goes through connecting while the chain is unknown", () => {
    process.env.REACT_APP_FIXTURE_SIGNED_IN = "true";
    expect(buildWalletStatus({ network: "", activeAddress: "" })).toStrictEqual(EXAMPLES.CONNECTING);
  });

  it("offers only the chains that have fixtures", () => {
    const { chains } = buildWalletStatus({ network: GNOSIS.id, activeAddress: "" });
    expect(chains.map((chain) => chain.id)).toEqual(SWITCHABLE_CHAIN_IDS.filter((id) => fixtures.hasFixtures(id)));
    expect(chains).toStrictEqual(SWITCHABLE);
  });
});

describe("buildWalletStatus chain switching", () => {
  it("offers Mainnet and Gnosis, in that order, whatever the current chain is", () => {
    expect(SWITCHABLE_CHAIN_IDS).toEqual([MAINNET.id, GNOSIS.id]);
    expect(SWITCHABLE.map((chain) => chain.id)).toEqual(SWITCHABLE_CHAIN_IDS);
    for (const input of Object.values(EXAMPLE_INPUTS)) expect(buildWalletStatus(input).chains).toStrictEqual(SWITCHABLE);
    expect(buildWalletStatus(connected(SEPOLIA.id)).chains).toStrictEqual(SWITCHABLE);
    expect(buildWalletStatus(connected(UNSUPPORTED.id)).chains).toStrictEqual(SWITCHABLE);
  });

  it("keeps the switch failure whether or not an account is connected, with the switch-failed code", () => {
    const failure = { code: ERROR_CODES.SWITCH_FAILED, message: expect.any(String) };
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.NO_WALLET, switchError: new Error("x") })).toStrictEqual({ ...EXAMPLES.NO_WALLET, switchError: failure });
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.WALLET_NOT_CONNECTED, switchError: "x" }).switchError).toStrictEqual(failure);
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.ERROR, switchError: "x" }).switchError).toStrictEqual(failure);
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.CONNECTED_UNSUPPORTED, switchError: "x" }).switchError).toStrictEqual(failure);
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.CONNECTED_GNOSIS, switchError: EXAMPLES.SWITCH_FAILED.switchError }).switchError).toStrictEqual(EXAMPLES.SWITCH_FAILED.switchError);
  });

  it("drops the switch failure while connecting and after a rejected switch", () => {
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.CONNECTING, switchError: "x" })).toStrictEqual(EXAMPLES.CONNECTING);
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.CONNECTED_SUPPORTED, switchError: userRejection() })).toStrictEqual(EXAMPLES.CONNECTED_SUPPORTED);
    expect(buildWalletStatus({ ...EXAMPLE_INPUTS.CONNECTED_SUPPORTED, switchError: null })).toStrictEqual(EXAMPLES.CONNECTED_SUPPORTED);
  });
});

describe("toWalletError", () => {
  it("is null for EIP-1193 and ethers user rejections, wherever the code sits, whatever the fallback", () => {
    expect(toWalletError(userRejection())).toBeNull();
    expect(toWalletError(ethersRejection(), ERROR_CODES.INIT_FAILED)).toBeNull();
    expect(toWalletError({ code: "ACTION_REJECTED" })).toBeNull();
    expect(toWalletError({ code: "UNKNOWN_ERROR", error: { code: 4001 } })).toBeNull();
    expect(toWalletError({ code: "UNKNOWN_ERROR", info: { error: { code: 4001 } } })).toBeNull();
  });

  it("has no code for a rejection: every code maps to a failure message", () => {
    expect(Object.values(ERROR_CODES)).toEqual(["init-failed", "switch-failed", "unknown"]);
    Object.values(ERROR_CODES).forEach((code) => expect(toWalletError("boom", code)).toStrictEqual({ code, message: expect.any(String) }));
  });

  it("uses the fallback code for everything else and guards against a bad fallback", () => {
    expect(toWalletError(new Error("boom"))).toStrictEqual({ code: ERROR_CODES.UNKNOWN, message: expect.any(String) });
    expect(toWalletError("boom", ERROR_CODES.INIT_FAILED)).toStrictEqual(EXAMPLES.ERROR.error);
    expect(toWalletError(undefined, "nonsense")).toStrictEqual({ code: ERROR_CODES.UNKNOWN, message: expect.any(String) });
  });

  it("never leaks the raw error message", () => {
    const raw = "internal: rpc endpoint 10.0.0.1 timed out";
    expect(toWalletError(new Error(raw)).message).not.toContain(raw);
    expect(toWalletError(Object.assign(new Error(raw), { code: ERROR_CODES.UNKNOWN })).message).not.toContain(raw);
  });

  it("copies an existing WalletError", () => {
    const error = EXAMPLES.ERROR.error;
    const mapped = toWalletError(error);
    expect(mapped).toStrictEqual(error);
    expect(mapped).not.toBe(error);
  });
});

describe("isWalletDetected", () => {
  it("reflects window.ethereum", () => {
    expect(isWalletDetected()).toBe(false);
    window.ethereum = { request: jest.fn() };
    expect(isWalletDetected()).toBe(true);
  });
});

describe("buildWalletActions", () => {
  it("requests accounts and hands them to onAccounts", async () => {
    const ethereum = { request: jest.fn().mockResolvedValue([EOA]) };
    const onAccounts = jest.fn();
    const onError = jest.fn();

    await expect(buildWalletActions({ ethereum, onAccounts, onError }).connect()).resolves.toBeUndefined();

    expect(ethereum.request).toHaveBeenCalledWith(REQUEST_ACCOUNTS);
    expect(onAccounts).toHaveBeenCalledWith([EOA]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports nothing for a rejected prompt and resolves, so the UI keeps offering to connect", async () => {
    for (const rejection of [userRejection(), ethersRejection()]) {
      const ethereum = { request: jest.fn().mockRejectedValue(rejection) };
      const onAccounts = jest.fn();
      const onError = jest.fn();

      await expect(buildWalletActions({ ethereum, onAccounts, onError }).connect()).resolves.toBeUndefined();

      expect(ethereum.request).toHaveBeenCalledWith(REQUEST_ACCOUNTS);
      expect(onAccounts).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    }
  });

  it("maps any other failure to unknown, logs it and resolves", async () => {
    const failure = new Error("wallet locked");
    const ethereum = { request: jest.fn().mockRejectedValue(failure) };
    const onError = jest.fn();

    await expect(buildWalletActions({ ethereum, onError }).connect()).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith({ code: ERROR_CODES.UNKNOWN, message: expect.any(String) });
    expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
  });

  it("does nothing when there is no provider", async () => {
    const onAccounts = jest.fn();
    const onError = jest.fn();

    await expect(buildWalletActions({ onAccounts, onError }).connect()).resolves.toBeUndefined();
    await expect(buildWalletActions({ ethereum: null, onAccounts, onError }).connect()).resolves.toBeUndefined();
    await expect(buildWalletActions({ ethereum: {}, onAccounts, onError }).connect()).resolves.toBeUndefined();
    await expect(buildWalletActions().connect()).resolves.toBeUndefined();
    await expect(buildWalletActions(null).connect()).resolves.toBeUndefined();

    expect(onAccounts).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("falls back to window.ethereum at call time", async () => {
    const onAccounts = jest.fn();
    const actions = buildWalletActions({ onAccounts });
    window.ethereum = { request: jest.fn().mockResolvedValue([EOA]) };

    await actions.connect();

    expect(window.ethereum.request).toHaveBeenCalledWith(REQUEST_ACCOUNTS);
    expect(onAccounts).toHaveBeenCalledWith([EOA]);
  });

  it("tolerates missing callbacks and a non-array response", async () => {
    const onAccounts = jest.fn();
    await expect(buildWalletActions({ ethereum: { request: jest.fn().mockResolvedValue([EOA]) } }).connect()).resolves.toBeUndefined();
    await expect(buildWalletActions({ ethereum: { request: jest.fn().mockRejectedValue(new Error("x")) } }).connect()).resolves.toBeUndefined();
    await buildWalletActions({ ethereum: { request: jest.fn().mockResolvedValue(undefined) }, onAccounts }).connect();
    expect(onAccounts).toHaveBeenCalledWith([]);
  });
});

describe("buildWalletActions switchChain", () => {
  const chainNotAdded = () => Object.assign(new Error("Unrecognized chain ID."), { code: 4902 });
  const callbacks = () => ({ isConnected: jest.fn(() => true), onSwitchStart: jest.fn(), onReadOnlyChain: jest.fn(), onWalletChain: jest.fn(), onSwitchError: jest.fn() });

  //A wallet on `chainId` that switches when asked, or throws what `switchError` says.
  const walletOn = (chainId, { switchError = null, addError = null } = {}) => {
    const wallet = {
      chainId,
      request: jest.fn(async ({ method, params }) => {
        switch (method) {
          case "eth_chainId":
            return wallet.chainId;
          case "wallet_switchEthereumChain":
            if (switchError) throw switchError;
            wallet.chainId = params[0].chainId;
            return null;
          case "wallet_addEthereumChain":
            if (addError) throw addError;
            switchError = null;
            return null;
          default:
            throw new Error(`Unexpected request: ${method}`);
        }
      }),
    };
    return wallet;
  };

  it("asks the connected wallet to switch and leaves following the chain to the wallet's chainChanged event", async () => {
    const ethereum = walletOn("0x64");
    const hooks = callbacks();

    await expect(buildWalletActions({ ethereum, ...hooks }).switchChain(MAINNET.id)).resolves.toBeUndefined();

    expect(hooks.onSwitchStart).toHaveBeenCalledWith(MAINNET.id);
    expect(ethereum.request.mock.calls.map(([args]) => args)).toEqual([CHAIN_ID_REQUEST, switchRequest(MAINNET)]);
    expect(hooks.onWalletChain).not.toHaveBeenCalled();
    expect(hooks.onReadOnlyChain).not.toHaveBeenCalled();
    expect(hooks.onSwitchError).not.toHaveBeenCalled();
  });

  it("accepts a hex or numeric target and sends the wallet the hex id", async () => {
    const ethereum = walletOn("0x1");
    const hooks = callbacks();
    await buildWalletActions({ ethereum, ...hooks }).switchChain(100);
    await buildWalletActions({ ethereum: walletOn("0x1"), ...hooks }).switchChain("0x64");
    expect(ethereum.request).toHaveBeenCalledWith(switchRequest(GNOSIS));
    expect(hooks.onSwitchStart).toHaveBeenCalledTimes(2);
    expect(hooks.onSwitchStart).toHaveBeenCalledWith(GNOSIS.id);
  });

  it("follows the wallet at once when it is already on the chain, without a switch request", async () => {
    const ethereum = walletOn("0x1");
    const hooks = callbacks();

    await buildWalletActions({ ethereum, ...hooks }).switchChain(MAINNET.id);

    expect(ethereum.request.mock.calls.map(([args]) => args)).toEqual([CHAIN_ID_REQUEST]);
    expect(hooks.onWalletChain).toHaveBeenCalledWith(MAINNET.id);
    expect(hooks.onSwitchError).not.toHaveBeenCalled();
  });

  it("switches the chain the app reads from, without asking the wallet, when no account is connected", async () => {
    const ethereum = walletOn("0x64");
    const hooks = { ...callbacks(), isConnected: jest.fn(() => false) };

    await buildWalletActions({ ethereum, ...hooks }).switchChain(MAINNET.id);

    expect(ethereum.request).not.toHaveBeenCalled();
    expect(hooks.onSwitchStart).toHaveBeenCalledWith(MAINNET.id);
    expect(hooks.onReadOnlyChain).toHaveBeenCalledWith(MAINNET.id);
    expect(hooks.onWalletChain).not.toHaveBeenCalled();
  });

  it("switches the chain the app reads from when there is no wallet at all", async () => {
    const hooks = callbacks();
    await buildWalletActions({ ...hooks }).switchChain(GNOSIS.id);
    await buildWalletActions({ ethereum: null, ...hooks }).switchChain(GNOSIS.id);
    await buildWalletActions({ ethereum: {}, ...hooks }).switchChain(GNOSIS.id);
    expect(hooks.onReadOnlyChain).toHaveBeenCalledTimes(3);
    expect(hooks.onReadOnlyChain).toHaveBeenCalledWith(GNOSIS.id);
    expect(hooks.isConnected).not.toHaveBeenCalled();
  });

  it("treats a missing isConnected as not connected", async () => {
    const ethereum = walletOn("0x64");
    const onReadOnlyChain = jest.fn();
    await buildWalletActions({ ethereum, onReadOnlyChain }).switchChain(MAINNET.id);
    expect(ethereum.request).not.toHaveBeenCalled();
    expect(onReadOnlyChain).toHaveBeenCalledWith(MAINNET.id);
  });

  it("reports nothing when the user rejects the switch, so the app stays where it is", async () => {
    for (const rejection of [userRejection(), ethersRejection()]) {
      const ethereum = walletOn("0x64", { switchError: rejection });
      const hooks = callbacks();

      await expect(buildWalletActions({ ethereum, ...hooks }).switchChain(MAINNET.id)).resolves.toBeUndefined();

      expect(hooks.onSwitchStart).toHaveBeenCalledWith(MAINNET.id);
      expect(hooks.onSwitchError).not.toHaveBeenCalled();
      expect(hooks.onWalletChain).not.toHaveBeenCalled();
      expect(hooks.onReadOnlyChain).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    }
  });

  it("reports any other failure as switch-failed, logs it and resolves", async () => {
    const failure = new Error("wallet locked");
    const ethereum = walletOn("0x64", { switchError: failure });
    const hooks = callbacks();

    await expect(buildWalletActions({ ethereum, ...hooks }).switchChain(MAINNET.id)).resolves.toBeUndefined();

    expect(hooks.onSwitchError).toHaveBeenCalledWith({ code: ERROR_CODES.SWITCH_FAILED, message: expect.any(String) });
    expect(hooks.onSwitchError.mock.calls[0][0].message).not.toContain("wallet locked");
    expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
    expect(hooks.onWalletChain).not.toHaveBeenCalled();
  });

  it("adds Gnosis through its public RPC when the wallet does not have it, then switches", async () => {
    const ethereum = walletOn("0x1", { switchError: chainNotAdded() });
    const hooks = callbacks();

    await buildWalletActions({ ethereum, ...hooks }).switchChain(GNOSIS.id);

    const entry = networkMap[GNOSIS.id];
    expect(ethereum.request.mock.calls.map(([args]) => args)).toEqual([
      CHAIN_ID_REQUEST,
      switchRequest(GNOSIS),
      {
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x64",
            chainName: entry.NAME,
            rpcUrls: ["https://rpc.gnosischain.com"],
            nativeCurrency: { name: entry.CURRENCY_SHORT, symbol: entry.CURRENCY_SHORT, decimals: 18 },
            blockExplorerUrls: ["https://gnosisscan.io"],
          },
        ],
      },
      switchRequest(GNOSIS),
    ]);
    expect(hooks.onSwitchError).not.toHaveBeenCalled();
  });

  //Every URL the app itself reads through: the network map's RPC endpoints and every REACT_APP_ environment variable.
  const projectUrls = () => {
    const fromMap = Object.values(networkMap).map((entry) => entry.WEB3_PROVIDER);
    const fromEnvironment = Object.entries(process.env)
      .filter(([key]) => key.startsWith("REACT_APP_"))
      .map(([, value]) => value);
    return [...fromMap, ...fromEnvironment].filter((value) => typeof value === "string" && value.trim() !== "");
  };

  const addRequests = (ethereum) => ethereum.request.mock.calls.map(([args]) => args).filter(({ method }) => method === "wallet_addEthereumChain");

  it("never hands a project RPC URL or environment value to wallet_addEthereumChain, for any chain", async () => {
    //Every map entry gets a distinctive RPC so a leak would be unmistakable, whatever the environment provides.
    const original = Object.fromEntries(Object.entries(networkMap).map(([id, entry]) => [id, entry.WEB3_PROVIDER]));
    Object.keys(networkMap).forEach((id) => {
      networkMap[id].WEB3_PROVIDER = `https://secret-${id}.rpc.test/key`;
    });
    process.env.REACT_APP_WEB3_XDAI_PROVIDER_URL = "https://secret-env.rpc.test/key";
    try {
      const urls = projectUrls();
      expect(urls.length).toBeGreaterThan(0);
      const adds = [];
      for (const id of Object.keys(networkMap)) {
        const ethereum = walletOn("0x2a", { switchError: chainNotAdded() });
        await buildWalletActions({ ethereum, ...callbacks() }).switchChain(id);
        adds.push(...addRequests(ethereum));
      }
      expect(adds).toHaveLength(1);
      expect(adds[0].params[0].chainId).toBe("0x64");
      const sent = JSON.stringify(adds);
      urls.forEach((url) => expect(sent).not.toContain(url));
      expect(sent).not.toContain("rpc.test");
    } finally {
      Object.entries(original).forEach(([id, url]) => {
        networkMap[id].WEB3_PROVIDER = url;
      });
      delete process.env.REACT_APP_WEB3_XDAI_PROVIDER_URL;
    }
  });

  it("never adds Mainnet: a chain-not-added answer for it is reported as a failure", async () => {
    const ethereum = walletOn("0x64", { switchError: chainNotAdded() });
    const hooks = callbacks();

    await buildWalletActions({ ethereum, ...hooks }).switchChain(MAINNET.id);

    expect(addRequests(ethereum)).toHaveLength(0);
    expect(ethereum.request.mock.calls.map(([args]) => args)).toEqual([CHAIN_ID_REQUEST, switchRequest(MAINNET)]);
    expect(hooks.onSwitchError).toHaveBeenCalledWith({ code: ERROR_CODES.SWITCH_FAILED, message: expect.any(String) });
    expect(hooks.onWalletChain).not.toHaveBeenCalled();
  });

  it("recognises the chain-not-added code wherever ethers puts it", async () => {
    const wrapped = Object.assign(new Error("could not coalesce error"), { code: "UNKNOWN_ERROR", info: { error: chainNotAdded() } });
    const ethereum = walletOn("0x1", { switchError: wrapped });
    const hooks = callbacks();
    await buildWalletActions({ ethereum, ...hooks }).switchChain(GNOSIS.id);
    expect(ethereum.request).toHaveBeenCalledWith(expect.objectContaining({ method: "wallet_addEthereumChain" }));
    expect(hooks.onSwitchError).not.toHaveBeenCalled();
  });

  it("stays silent when the user declines to add the chain, and reports a failed addition", async () => {
    const declined = walletOn("0x1", { switchError: chainNotAdded(), addError: userRejection() });
    const declinedHooks = callbacks();
    await buildWalletActions({ ethereum: declined, ...declinedHooks }).switchChain(GNOSIS.id);
    expect(declinedHooks.onSwitchError).not.toHaveBeenCalled();
    expect(declined.request).toHaveBeenCalledTimes(3);

    const broken = walletOn("0x1", { switchError: chainNotAdded(), addError: new Error("add failed") });
    const brokenHooks = callbacks();
    await buildWalletActions({ ethereum: broken, ...brokenHooks }).switchChain(GNOSIS.id);
    expect(brokenHooks.onSwitchError).toHaveBeenCalledWith({ code: ERROR_CODES.SWITCH_FAILED, message: expect.any(String) });
  });

  it("adds Gnosis whether or not the network map has an RPC endpoint for it", async () => {
    const entry = networkMap[GNOSIS.id];
    const rpc = entry.WEB3_PROVIDER;
    entry.WEB3_PROVIDER = undefined;
    try {
      const ethereum = walletOn("0x1", { switchError: chainNotAdded() });
      const hooks = callbacks();
      await buildWalletActions({ ethereum, ...hooks }).switchChain(GNOSIS.id);
      expect(addRequests(ethereum)).toHaveLength(1);
      expect(addRequests(ethereum)[0].params[0].rpcUrls).toEqual(["https://rpc.gnosischain.com"]);
      expect(hooks.onSwitchError).not.toHaveBeenCalled();
    } finally {
      entry.WEB3_PROVIDER = rpc;
    }
  });

  it("reports a failure when the wallet cannot even say which chain it is on", async () => {
    const ethereum = { request: jest.fn().mockRejectedValue(new Error("disconnected")) };
    const hooks = callbacks();
    await buildWalletActions({ ethereum, ...hooks }).switchChain(MAINNET.id);
    expect(hooks.onSwitchError).toHaveBeenCalledWith({ code: ERROR_CODES.SWITCH_FAILED, message: expect.any(String) });
  });

  it("ignores a chain that is not in the network map, or no chain, without touching the wallet", async () => {
    const ethereum = walletOn("0x64");
    const hooks = callbacks();
    const { switchChain } = buildWalletActions({ ethereum, ...hooks });
    for (const target of [UNSUPPORTED.id, "nonsense", "", null, undefined, "constructor"]) await expect(switchChain(target)).resolves.toBeUndefined();
    expect(ethereum.request).not.toHaveBeenCalled();
    expect(hooks.onSwitchStart).not.toHaveBeenCalled();
    expect(hooks.onReadOnlyChain).not.toHaveBeenCalled();
    expect(hooks.onSwitchError).not.toHaveBeenCalled();
  });

  it("tolerates missing callbacks", async () => {
    await expect(buildWalletActions({ ethereum: walletOn("0x64"), isConnected: () => true }).switchChain(MAINNET.id)).resolves.toBeUndefined();
    await expect(buildWalletActions({ ethereum: walletOn("0x1"), isConnected: () => true }).switchChain(MAINNET.id)).resolves.toBeUndefined();
    await expect(buildWalletActions({ ethereum: walletOn("0x64", { switchError: new Error("x") }), isConnected: () => true }).switchChain(MAINNET.id)).resolves.toBeUndefined();
    await expect(buildWalletActions().switchChain(MAINNET.id)).resolves.toBeUndefined();
  });
});

describe("detectSmartContractWallet", () => {
  const provider = (code) => ({ getCode: jest.fn().mockResolvedValue(code) });

  it("is false for an EOA", async () => {
    const eoa = provider("0x");
    await expect(detectSmartContractWallet(eoa, EOA)).resolves.toBe(false);
    expect(eoa.getCode).toHaveBeenCalledWith(EOA);
  });

  it("is true for a contract account", async () => {
    await expect(detectSmartContractWallet(provider("0x6080604052348015600f57600080fd5b50"), SMART_CONTRACT_WALLET)).resolves.toBe(true);
  });

  it("is false for an EIP-7702 delegated EOA, whatever the case of the code", async () => {
    await expect(detectSmartContractWallet(provider(`0xef0100${EOA.slice(2)}`), EOA)).resolves.toBe(false);
    await expect(detectSmartContractWallet(provider(`0xEF0100${EOA.slice(2).toUpperCase()}`), EOA)).resolves.toBe(false);
  });

  it("is null when the provider rejects, and logs the failure", async () => {
    const failure = new Error("network down");
    await expect(detectSmartContractWallet({ getCode: jest.fn().mockRejectedValue(failure) }, EOA)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
  });

  it("is null without a provider, an address or a usable getCode", async () => {
    const unused = provider("0x");
    await expect(detectSmartContractWallet(null, EOA)).resolves.toBeNull();
    await expect(detectSmartContractWallet(unused, "")).resolves.toBeNull();
    await expect(detectSmartContractWallet(unused, null)).resolves.toBeNull();
    await expect(detectSmartContractWallet({}, EOA)).resolves.toBeNull();
    await expect(detectSmartContractWallet(provider(undefined), EOA)).resolves.toBeNull();
    expect(unused.getCode).not.toHaveBeenCalled();
  });
});
