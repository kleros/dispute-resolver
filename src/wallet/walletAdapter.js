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
import { getContractCodeUrl } from "./explorers";

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

/**
 * The WalletError codes of the contract. A rejected wallet prompt has no code: it is not an error (see toWalletError).
 * @type {Readonly<{ INIT_FAILED: "init-failed", UNKNOWN: "unknown" }>}
 */
export const ERROR_CODES = Object.freeze({
  INIT_FAILED: "init-failed",
  UNKNOWN: "unknown",
});

//User-facing sentences, one per code. They never include the raw error.
const ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.INIT_FAILED]: "Could not connect to your wallet. Check the extension and reload the page.",
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

const hasUserRejectionCode = (error) => Boolean(error) && typeof error === "object" && USER_REJECTION_CODES.includes(error.code);

//Wallets put the 4001 on the error itself; ethers v6 wraps it and keeps the original under error.error or error.info.error.
const isUserRejection = (error) => hasUserRejectionCode(error) || hasUserRejectionCode(error?.error) || hasUserRejectionCode(error?.info?.error);

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

/**
 * @typedef {Object} WalletStatusInput Plain data drawn from App state.
 * @property {string | null | undefined} [activeAddress] App state `activeAddress`; "" or null when no account is available.
 * @property {unknown} [network] App state `network`; "" until initialised.
 * @property {boolean} [walletDetected] Whether window.ethereum exists (App passes isWalletDetected()). Defaults to false.
 * @property {boolean} [initializing] True while App is still resolving the provider, signer or chain.
 * @property {unknown} [error] What the wallet initialisation threw, or a WalletError. Anything truthy puts the status in "error", except a user rejection, which counts as no error.
 * @property {boolean | null} [isSmartContractWallet] Result of detectSmartContractWallet for `activeAddress`; null while unknown.
 */

/**
 * Builds the status the header and footer render from. Precedence: initializing, then error, then address, then none.
 * Never throws: odd input falls back to a sane status, and viewOnly is true exactly when address is null.
 * @param {WalletStatusInput} [input]
 * @returns {WalletStatus}
 */
export const buildWalletStatus = (input) => {
  const { activeAddress, network, walletDetected, initializing, error, isSmartContractWallet } = input ?? {};
  const fixtureMode = fixtures.isFixtureMode();
  const fixtureSignedIn = fixtures.isSignedIn();
  const detected = fixtureMode ? fixtureSignedIn : Boolean(walletDetected);
  const chain = buildChainStatus(network);
  //A rejected prompt maps to null and the status carries on as if nothing had been thrown.
  const walletError = error ? toWalletError(error, ERROR_CODES.INIT_FAILED) : null;

  if (Boolean(initializing) || (chain === null && !walletError)) return { ...BASE_STATUS, connection: CONNECTION.CONNECTING, walletDetected: detected };

  if (walletError) {
    return {
      ...BASE_STATUS,
      connection: CONNECTION.ERROR,
      walletDetected: detected,
      chain: chain ?? buildChainStatus(FALLBACK_CHAIN_ID),
      error: walletError,
    };
  }

  const address = toAddress(activeAddress) ?? (fixtureSignedIn ? fixtures.getSignedInAddress() : null);
  if (address === null) return { ...BASE_STATUS, walletDetected: detected, chain };

  return {
    ...BASE_STATUS,
    connection: CONNECTION.CONNECTED,
    walletDetected: detected,
    address,
    chain,
    viewOnly: false,
    isSmartContractWallet: fixtureMode ? false : toOptionalBoolean(isSmartContractWallet),
  };
};

const reportConnectFailure = (error, onError) => {
  const walletError = toWalletError(error);
  //A rejected prompt is the user's choice: nothing to report, the UI keeps offering to connect.
  if (walletError === null) return;
  console.error("Wallet connection request failed:", error);
  if (typeof onError === "function") onError(walletError);
};

/**
 * @param {Object} [options]
 * @param {{ request: (args: { method: string }) => Promise<unknown> } | null} [options.ethereum] EIP-1193 provider. Defaults to
 *   window.ethereum at call time; null (or no injected provider) makes connect a no-op, the UI shows an install link instead.
 * @param {(accounts: string[]) => void} [options.onAccounts] Receives the authorised accounts; App sets activeAddress from accounts[0].
 * @param {(error: WalletError) => void} [options.onError] Receives the mapped error when the request fails. A rejected prompt is not an error and is not reported.
 * @returns {WalletActions} connect always resolves; request failures go to onError and are never rethrown.
 */
export const buildWalletActions = (options) => {
  const { ethereum, onAccounts, onError } = options ?? {};

  const connect = async () => {
    const provider = ethereum === undefined ? getInjectedProvider() : ethereum;
    if (!provider || typeof provider.request !== "function") return;

    let accounts;
    try {
      accounts = await provider.request({ method: "eth_requestAccounts" });
    } catch (error) {
      reportConnectFailure(error, onError);
      return;
    }
    if (typeof onAccounts === "function") onAccounts(Array.isArray(accounts) ? accounts : []);
  };

  return { connect };
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
