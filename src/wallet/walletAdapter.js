/**
 * Builds the WalletStatus and WalletActions of ./walletStatus.js from plain App state.
 *
 * Everything here is data in, data out: no React, and the only window access is in isWalletDetected and in the
 * connect action. App keeps owning window.ethereum, the ethers providers and its listeners; it calls buildWalletStatus
 * from render and buildWalletActions / detectSmartContractWallet from its handlers.
 *
 * Fixture mode (see ../fixtures) has no wallet behind it: the signed-in fixture account plays the part of a connected
 * EOA, so a signed-in fixture on Gnosis yields EXAMPLES.CONNECTED_GNOSIS, and a fixture that is not signed in reports
 * no wallet at all. The walletDetected and isSmartContractWallet inputs are ignored in that mode.
 *
 * @typedef {import("./walletStatus").WalletStatus} WalletStatus
 * @typedef {import("./walletStatus").ChainStatus} ChainStatus
 * @typedef {import("./walletStatus").WalletError} WalletError
 * @typedef {import("./walletStatus").WalletActions} WalletActions
 */
import networkMap, { isTestnet } from "../ethereum/network-contract-mapping";
import * as fixtures from "../fixtures";
import { CONNECTION } from "./walletStatus";
import { getContractCodeUrl, getExplorerBaseUrl } from "./explorers";

//Chain the app reads when the wallet failed before a chain was known, so it stays browsable (see EXAMPLES.ERROR).
const FALLBACK_CHAIN_ID = "1";
const DECIMAL_CHAIN_ID = /^\d+$/;
const HEX_CHAIN_ID = /^0x[0-9a-f]+$/i;

//getCode of an EOA. An EIP-7702 delegated EOA holds "0xef0100" followed by the delegate address instead.
const EMPTY_CODE = "0x";
const EIP7702_PREFIX = "0xef0100";

//A closed or refused wallet prompt: the EIP-1193 code wallets send, and the name ethers v6 wraps it under.
const EIP1193_USER_REJECTED = 4001;
const ETHERS_ACTION_REJECTED = "ACTION_REJECTED";
const USER_REJECTION_CODES = [EIP1193_USER_REJECTED, ETHERS_ACTION_REJECTED];
//wallet_switchEthereumChain to a chain the wallet does not have (EIP-3085 / MetaMask): the chain is added first, then switched to.
const EIP1193_CHAIN_NOT_ADDED = 4902;
const NATIVE_CURRENCY_DECIMALS = 18;

//The only chain the app adds to a wallet, through Gnosis's official public RPC. No RPC URL of the network map or of the
//environment ever reaches a wallet: those are the app's own read endpoints. Mainnet is never added: every wallet has it,
//so a "chain not added" answer for it is a failure like any other.
const GNOSIS_CHAIN_ID = "100";
const GNOSIS_PUBLIC_RPC_URL = "https://rpc.gnosischain.com";
const ADDABLE_CHAIN_RPC_URLS = Object.freeze({ [GNOSIS_CHAIN_ID]: Object.freeze([GNOSIS_PUBLIC_RPC_URL]) });

/**
 * The chains the header offers to switch to, in display order: the ones with a Kleros court and fixtures. Any other
 * chain of the network map is still supported for browsing, and switchChain accepts it too.
 * @type {ReadonlyArray<string>}
 */
export const SWITCHABLE_CHAIN_IDS = Object.freeze(["1", "100"]);

/**
 * The WalletError codes of the contract. A rejected wallet prompt has no code: it is not an error (see toWalletError).
 * @type {Readonly<{ INIT_FAILED: "init-failed", SWITCH_FAILED: "switch-failed", UNKNOWN: "unknown" }>}
 */
export const ERROR_CODES = Object.freeze({
  INIT_FAILED: "init-failed",
  SWITCH_FAILED: "switch-failed",
  UNKNOWN: "unknown",
});

//User-facing sentences, one per code. They never include the raw error.
const ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.INIT_FAILED]: "Could not connect to your wallet. Check the extension and reload the page.",
  [ERROR_CODES.SWITCH_FAILED]: "Could not switch the network.",
  [ERROR_CODES.UNKNOWN]: "Something went wrong with your wallet. Reload the page and try again.",
});

const BASE_STATUS = Object.freeze({
  connection: CONNECTION.NONE,
  walletDetected: false,
  address: null,
  chain: null,
  viewOnly: true,
  isSmartContractWallet: null,
  error: null,
  chains: [],
  switchError: null,
});

//Own-property lookup so ids like "constructor" do not resolve to Object.prototype members.
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const getInjectedProvider = () => globalThis.window?.ethereum;

const toText = (value) => {
  try {
    return String(value).trim();
  } catch {
    //Values whose toString throws cannot name a chain.
    return "";
  }
};

//The chain id as the decimal string the network map and the URL use, or null when there is none (null, undefined, "").
//Numbers, bigints, hex strings ("0x64") and zero-padded strings are normalised; any other text stays as it is and ends up unsupported.
const normalizeChainId = (network) => {
  if (network === null || network === undefined) return null;
  const text = toText(network);
  if (text === "") return null;
  if (DECIMAL_CHAIN_ID.test(text) || HEX_CHAIN_ID.test(text)) return BigInt(text).toString();
  return text;
};

const toAddress = (activeAddress) => {
  const trimmed = typeof activeAddress === "string" ? activeAddress.trim() : "";
  return trimmed === "" ? null : trimmed;
};

const toOptionalBoolean = (value) => (typeof value === "boolean" ? value : null);

const isWalletError = (error) =>
  Boolean(error) && typeof error === "object" && !(error instanceof Error) && hasOwn(ERROR_MESSAGES, error.code) && typeof error.message === "string";

const hasCode = (error, codes) => Boolean(error) && typeof error === "object" && codes.includes(error.code);

//Wallets put the code on the error itself; ethers v6 wraps it and keeps the original under error.error or error.info.error.
const hasErrorCode = (error, codes) => hasCode(error, codes) || hasCode(error?.error, codes) || hasCode(error?.info?.error, codes);

const isUserRejection = (error) => hasErrorCode(error, USER_REJECTION_CODES);

const isChainNotAdded = (error) => hasErrorCode(error, [EIP1193_CHAIN_NOT_ADDED]);

const toHexChainId = (id) => `0x${BigInt(id).toString(16)}`;

const call = (callback, ...args) => (typeof callback === "function" ? callback(...args) : undefined);

/**
 * Maps whatever a wallet call threw to a WalletError with a user-facing message, or to null when the user rejected the
 * request: closing or refusing the wallet's prompt is a choice, not a failure, and leaves the connection as it was.
 * @param {unknown} error A thrown value, an EIP-1193 or ethers error, or an existing WalletError (copied as is).
 * @param {WalletError["code"]} [fallbackCode="unknown"] Code used for anything that is not a user rejection.
 * @returns {WalletError | null}
 */
export const toWalletError = (error, fallbackCode = ERROR_CODES.UNKNOWN) => {
  if (isWalletError(error)) return { code: error.code, message: error.message };
  if (isUserRejection(error)) return null;
  const code = hasOwn(ERROR_MESSAGES, fallbackCode) ? fallbackCode : ERROR_CODES.UNKNOWN;
  return { code, message: ERROR_MESSAGES[code] };
};

/**
 * @returns {boolean} Whether an injected provider (window.ethereum) exists. App passes this as the walletDetected input.
 */
export const isWalletDetected = () => Boolean(getInjectedProvider());

/**
 * @param {unknown} network App state `network`: a decimal chain id string such as "100" ("" until App has initialised).
 * @returns {ChainStatus | null} null when the chain is not known yet. An id that is not in the network map yields an unsupported chain.
 */
export const buildChainStatus = (network) => {
  const id = normalizeChainId(network);
  if (id === null) return null;

  const entry = hasOwn(networkMap, id) ? networkMap[id] : null;
  return {
    id,
    supported: Boolean(entry),
    name: entry?.NAME ?? null,
    testnet: Boolean(entry) && isTestnet(id),
    currency: entry?.CURRENCY_SHORT ?? null,
    contractExplorerUrl: getContractCodeUrl(id, entry?.ARBITRABLE_PROXY),
  };
};

//The chains the header offers: the switchable ones that are in the network map and, in fixture mode, have fixtures.
const buildSwitchableChains = (fixtureMode) =>
  SWITCHABLE_CHAIN_IDS.filter((id) => hasOwn(networkMap, id) && (!fixtureMode || fixtures.hasFixtures(id))).map(buildChainStatus);

/**
 * @typedef {Object} WalletStatusInput Plain data drawn from App state.
 * @property {string | null | undefined} [activeAddress] App state `activeAddress`; "" or null when no account is available.
 * @property {unknown} [network] App state `network`; "" until initialised.
 * @property {boolean} [walletDetected] Whether window.ethereum exists (App passes isWalletDetected()). Defaults to false.
 * @property {boolean} [initializing] True while App is still resolving the provider, signer or chain.
 * @property {unknown} [error] What the wallet initialisation threw, or a WalletError. Anything truthy puts the status in "error", except a user rejection, which counts as no error.
 * @property {boolean | null} [isSmartContractWallet] Result of detectSmartContractWallet for `activeAddress`; null while unknown.
 * @property {unknown} [switchError] What the last chain switch reported through onSwitchError, or null. Carried as is when it is a WalletError, mapped otherwise.
 */

/**
 * Builds the status the header and footer render from. Precedence: initializing, then error, then address, then none.
 * Never throws: odd input falls back to a sane status, and viewOnly is true exactly when address is null.
 * @param {WalletStatusInput} [input]
 * @returns {WalletStatus}
 */
export const buildWalletStatus = (input) => {
  const { activeAddress, network, walletDetected, initializing, error, isSmartContractWallet, switchError } = input ?? {};
  const fixtureMode = fixtures.isFixtureMode();
  const fixtureSignedIn = fixtures.isSignedIn();
  const detected = fixtureMode ? fixtureSignedIn : Boolean(walletDetected);
  const chain = buildChainStatus(network);
  //A rejected prompt maps to null and the status carries on as if nothing had been thrown.
  const walletError = error ? toWalletError(error, ERROR_CODES.INIT_FAILED) : null;
  const base = { ...BASE_STATUS, walletDetected: detected, chains: buildSwitchableChains(fixtureMode) };

  if (Boolean(initializing) || (chain === null && !walletError)) return { ...base, connection: CONNECTION.CONNECTING };

  //A failed switch is reported wherever the app is, so the switcher can say so while still offering the chains.
  const switchFailure = switchError ? toWalletError(switchError, ERROR_CODES.SWITCH_FAILED) : null;

  if (walletError) {
    return {
      ...base,
      connection: CONNECTION.ERROR,
      chain: chain ?? buildChainStatus(FALLBACK_CHAIN_ID),
      error: walletError,
      switchError: switchFailure,
    };
  }

  const address = toAddress(activeAddress) ?? (fixtureSignedIn ? fixtures.getSignedInAddress() : null);
  if (address === null) return { ...base, chain, switchError: switchFailure };

  return {
    ...base,
    connection: CONNECTION.CONNECTED,
    address,
    chain,
    viewOnly: false,
    isSmartContractWallet: fixtureMode ? false : toOptionalBoolean(isSmartContractWallet),
    switchError: switchFailure,
  };
};

const reportConnectFailure = (error, onError) => {
  const walletError = toWalletError(error);
  //A rejected prompt is the user's choice: nothing to report, the UI keeps offering to connect.
  if (walletError === null) return;
  console.error("Wallet connection request failed:", error);
  if (typeof onError === "function") onError(walletError);
};

const reportSwitchFailure = (error, onSwitchError) => {
  const walletError = toWalletError(error, ERROR_CODES.SWITCH_FAILED);
  //A rejected prompt is the user's choice: the app stays on its chain and nothing is reported.
  if (walletError === null) return;
  console.error("Chain switch request failed:", error);
  call(onSwitchError, walletError);
};

//The EIP-3085 description of a chain the app may add: its name, currency and explorer from the app's own lists, its RPC
//from the public constants above. Null for every other chain.
const toAddChainParameters = (id) => {
  const rpcUrls = hasOwn(ADDABLE_CHAIN_RPC_URLS, id) ? ADDABLE_CHAIN_RPC_URLS[id] : null;
  const entry = networkMap[id];
  if (!rpcUrls || !entry) return null;
  const explorer = getExplorerBaseUrl(id);
  return {
    chainId: toHexChainId(id),
    chainName: entry.NAME,
    rpcUrls: [...rpcUrls],
    nativeCurrency: { name: entry.CURRENCY_SHORT, symbol: entry.CURRENCY_SHORT, decimals: NATIVE_CURRENCY_DECIMALS },
    ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
  };
};

//Asks the wallet to switch; a wallet that does not have the chain yet is asked to add it first (when the app may), then to switch again.
const requestWalletChain = async (provider, id) => {
  const params = [{ chainId: toHexChainId(id) }];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params });
  } catch (error) {
    if (!isChainNotAdded(error)) throw error;
    const chain = toAddChainParameters(id);
    if (chain === null) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [chain] });
    await provider.request({ method: "wallet_switchEthereumChain", params });
  }
};

/**
 * @param {Object} [options]
 * @param {{ request: (args: { method: string, params?: unknown[] }) => Promise<unknown> } | null} [options.ethereum] EIP-1193 provider. Defaults to
 *   window.ethereum at call time; null (or no injected provider) makes connect a no-op, the UI shows an install link instead.
 * @param {(accounts: string[]) => void} [options.onAccounts] Receives the authorised accounts; App sets activeAddress from accounts[0].
 * @param {(error: WalletError) => void} [options.onError] Receives the mapped error when the request fails. A rejected prompt is not an error and is not reported.
 * @param {() => boolean} [options.isConnected] Whether an account is connected right now. Only then is the wallet asked to switch; otherwise the
 *   app switches the chain it reads from. Defaults to not connected.
 * @param {(chainId: string) => void} [options.onSwitchStart] Called with the target chain whenever a switch attempt starts; App clears the previous switchError.
 * @param {(chainId: string) => void} [options.onReadOnlyChain] The app should now read the given chain: there is no connected wallet to ask.
 * @param {(chainId: string) => void} [options.onWalletChain] The connected wallet is already on the given chain, so no switch request was needed
 *   and no chainChanged event will follow: the app should follow it now. After an actual switch request the app follows the wallet's chainChanged event.
 * @param {(error: WalletError) => void} [options.onSwitchError] Receives the mapped "switch-failed" error when the wallet could not switch or add the chain,
 *   including a "chain not added" answer for a chain the app never adds (any but Gnosis).
 *   A rejected prompt is not reported.
 * @returns {WalletActions} connect and switchChain always resolve; request failures go to onError / onSwitchError and are never rethrown.
 */
export const buildWalletActions = (options) => {
  const { ethereum, onAccounts, onError, isConnected, onSwitchStart, onReadOnlyChain, onWalletChain, onSwitchError } = options ?? {};

  const getProvider = () => {
    const provider = ethereum === undefined ? getInjectedProvider() : ethereum;
    return provider && typeof provider.request === "function" ? provider : null;
  };

  const connect = async () => {
    const provider = getProvider();
    if (!provider) return;

    let accounts;
    try {
      accounts = await provider.request({ method: "eth_requestAccounts" });
    } catch (error) {
      reportConnectFailure(error, onError);
      return;
    }
    if (typeof onAccounts === "function") onAccounts(Array.isArray(accounts) ? accounts : []);
  };

  const switchChain = async (chainId) => {
    const id = normalizeChainId(chainId);
    //Only a chain of the network map can be switched to; anything else is ignored rather than sent to the wallet.
    if (id === null || !hasOwn(networkMap, id)) return;
    call(onSwitchStart, id);

    const provider = getProvider();
    if (!provider || call(isConnected) !== true) {
      call(onReadOnlyChain, id);
      return;
    }

    try {
      const current = normalizeChainId(await provider.request({ method: "eth_chainId" }));
      if (current === id) {
        call(onWalletChain, id);
        return;
      }
      await requestWalletChain(provider, id);
    } catch (error) {
      reportSwitchFailure(error, onSwitchError);
    }
  };

  return { connect, switchChain };
};

//EIP-7702 delegated EOAs are still EOAs, so their designator does not count as contract code.
const isContractCode = (code) => {
  if (typeof code !== "string") return null;
  const formattedCode = code.toLowerCase();
  return formattedCode !== "" && formattedCode !== EMPTY_CODE && !formattedCode.startsWith(EIP7702_PREFIX);
};

/**
 * @param {{ getCode: (address: string) => Promise<string> } | null | undefined} provider An ethers provider (App state `provider`).
 * @param {string | null | undefined} address The account to check.
 * @returns {Promise<boolean | null>} true for a smart contract wallet, false for an EOA (EIP-7702 delegations included),
 *   null when the provider or the address is missing or the call failed. Never rejects.
 */
export const detectSmartContractWallet = async (provider, address) => {
  if (!provider || typeof provider.getCode !== "function" || !address) return null;
  try {
    return isContractCode(await provider.getCode(address));
  } catch (error) {
    console.error("Error getting code at wallet address", error);
    return null;
  }
};
