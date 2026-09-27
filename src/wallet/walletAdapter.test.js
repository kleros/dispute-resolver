import networkMap from "../ethereum/network-contract-mapping";
import * as fixtures from "../fixtures";
import { CONNECTION, EXAMPLES } from "./walletStatus";
import { ERROR_CODES, buildChainStatus, buildWalletActions, buildWalletStatus, detectSmartContractWallet, isWalletDetected, toWalletError } from "./walletAdapter";

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
};

const userRejection = () => Object.assign(new Error("User rejected the request."), { code: 4001 });

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

  it("maps a user rejection during initialisation to user-rejected", () => {
    const status = buildWalletStatus({ network: MAINNET.id, walletDetected: true, error: userRejection() });
    expect(status.connection).toBe(CONNECTION.ERROR);
    expect(status.error).toStrictEqual({ code: ERROR_CODES.USER_REJECTED, message: expect.any(String) });
    expectWalletStatusShape(status);
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
});

describe("toWalletError", () => {
  it("maps EIP-1193 and ethers user rejections, wherever the code sits", () => {
    const expected = { code: ERROR_CODES.USER_REJECTED, message: expect.any(String) };
    expect(toWalletError(userRejection())).toStrictEqual(expected);
    expect(toWalletError({ code: "ACTION_REJECTED" })).toStrictEqual(expected);
    expect(toWalletError({ code: "UNKNOWN_ERROR", error: { code: 4001 } })).toStrictEqual(expected);
    expect(toWalletError({ code: "UNKNOWN_ERROR", info: { error: { code: 4001 } } })).toStrictEqual(expected);
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

  it("maps a rejected prompt to user-rejected and resolves", async () => {
    const ethereum = { request: jest.fn().mockRejectedValue(userRejection()) };
    const onAccounts = jest.fn();
    const onError = jest.fn();

    await expect(buildWalletActions({ ethereum, onAccounts, onError }).connect()).resolves.toBeUndefined();

    expect(onAccounts).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({ code: ERROR_CODES.USER_REJECTED, message: expect.any(String) });
    expect(console.error).not.toHaveBeenCalled();
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
