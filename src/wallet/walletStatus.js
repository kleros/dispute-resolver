/**
 * Shared data contract between the wallet adapter and the header/footer UI.
 *
 * The adapter (built on top of App state: `activeAddress`, `network`, `walletProvider`, `provider`, fixture
 * helpers) produces a WalletStatus. The header, footer, view-only banner and navigation render from a
 * WalletStatus alone and never touch `window.ethereum`, ethers or the network map directly.
 *
 * Two axes are kept separate on purpose because the app treats them separately today:
 *  - `connection` says whether an account is available (today: `activeAddress`).
 *  - `chain` says which chain the app is on and whether it is in the network map (today: `network`).
 * An unsupported chain can be reached with or without a wallet (the chain id comes from the URL when there
 * is no wallet), so "unsupported" is a chain attribute, not a connection state.
 *
 * Route-based links (`/:chainId/ongoing`, `/:chainId/cases`) keep using the router's `chainId` param as
 * they do now; `chain` is for display and for deciding which chrome to show.
 *
 * Chain switching: `chains` lists the chains the header offers and `WalletActions.switchChain` moves the app to one
 * of them. With a connected wallet the wallet is asked to switch and the app follows once the wallet reports the new
 * chain; without one the app switches the chain it reads from. `switchError` says why the last attempt failed.
 */

/**
 * @typedef {"none" | "connecting" | "connected" | "error"} WalletConnection
 * - "none": no account is available. Either no wallet is installed (`walletDetected` false) or the wallet
 *   has not authorised an account (`walletDetected` true), including after the user rejected the connection
 *   request. The app runs read-only on `chain`.
 * - "connecting": the adapter is still resolving the provider, signer or chain. `chain` and `address` may be null.
 * - "connected": an account is available. `address` is set. Check `chain.supported` before offering writes.
 * - "error": resolving the wallet failed. `error` is set. The adapter falls back to a read-only `chain` when it can.
 *   A rejected connection request is not a failure: it leaves the connection at "none".
 */

/**
 * @typedef {Object} ChainStatus
 * @property {string} id Chain id as a decimal string (e.g. "1", "100"), matching the network map keys and the URL segment.
 * @property {boolean} supported True when the id exists in the network map. False means "Unsupported Network" chrome.
 * @property {string | null} name Display name from the network map (`NAME`); null when unsupported.
 * @property {boolean} testnet True for the chain ids listed in `isTestnet`; false when unsupported.
 * @property {string | null} currency Native currency ticker from the network map (`CURRENCY_SHORT`); null when unsupported.
 * @property {string | null} contractExplorerUrl Block-explorer link to the chain's ArbitrableProxy code; null when there is no explorer or no proxy.
 */

/**
 * @typedef {Object} WalletError
 * @property {"init-failed" | "switch-failed" | "unknown"} code Stable identifier for the failure; the UI may branch on it.
 * @property {string} message Short, user-facing sentence. Already safe to render; the UI does not need to interpret it.
 */

/**
 * @typedef {Object} WalletStatus
 * @property {WalletConnection} connection Connection state; see WalletConnection for what each value means.
 * @property {boolean} walletDetected True when an injected provider (`window.ethereum`) exists, regardless of whether it is connected.
 * @property {string | null} address Active account (hex string) when connected; null otherwise. In fixture mode it is the fixture address.
 * @property {ChainStatus | null} chain Chain the app is reading from; null only while connecting.
 * @property {boolean} viewOnly True whenever `address` is null. Drives the view-only banner and hides the Create link. Chain support does not affect it.
 * @property {boolean | null} isSmartContractWallet True when `address` holds contract code that is not an EIP-7702 delegation; false when it is an EOA; null while unknown or when there is no address.
 * @property {WalletError | null} error Set only when `connection` is "error".
 * @property {ChainStatus[]} chains Chains the header offers to switch to, all supported, in display order. Empty when the app cannot switch.
 *   `chain` need not be one of them: a testnet or an unsupported chain is still shown as the current chain, with these as the way out.
 * @property {WalletError | null} switchError Why the last chain switch failed (code "switch-failed"); null once the next attempt starts or the chain changes.
 *   A switch the user rejected in the wallet is not a failure and leaves this null.
 */

/**
 * Callbacks the UI needs alongside the status. Kept separate so the status stays plain data.
 * @typedef {Object} WalletActions
 * @property {() => Promise<void>} connect Ask the wallet for an account. Only meaningful when `walletDetected` is true and `connection` is "none" or "error".
 *   A rejected request changes nothing: the status stays as it was and the UI keeps offering to connect.
 * @property {(chainId: string) => Promise<void>} switchChain Move the app to a chain of `chains` (decimal id). With a connected wallet
 *   the wallet is asked to switch (and, for Gnosis only, to add the chain first when it does not have it); the status follows once the wallet reports the
 *   new chain. Without a connected wallet the app switches the chain it reads from at once. Always resolves: a rejected prompt changes
 *   nothing, a failure shows up as `switchError`.
 */

export const CONNECTION = Object.freeze({
  NONE: "none",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
});

const MAINNET = Object.freeze({
  id: "1",
  supported: true,
  name: "Ethereum Mainnet",
  testnet: false,
  currency: "ETH",
  contractExplorerUrl: "https://etherscan.io/address/0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf#code",
});

const GNOSIS = Object.freeze({
  id: "100",
  supported: true,
  name: "Gnosis Network",
  testnet: false,
  currency: "xDai",
  contractExplorerUrl: "https://gnosisscan.io/address/0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c#code",
});

const SEPOLIA = Object.freeze({
  id: "11155111",
  supported: true,
  name: "Ethereum Testnet Sepolia",
  testnet: true,
  currency: "sETH",
  contractExplorerUrl: "https://sepolia.etherscan.io/address/0x009cA5A0B816156F91B29A93d7688c52480BaB24#code",
});

const UNSUPPORTED = Object.freeze({
  id: "999",
  supported: false,
  name: null,
  testnet: false,
  currency: null,
  contractExplorerUrl: null,
});

const EOA = "0x1111111111111111111111111111111111111111";

/** The chains the header offers, in display order. */
const SWITCHABLE = Object.freeze([MAINNET, GNOSIS]);

/**
 * One example per state the UI must render. Use these in stories, tests and fixture mode.
 * @type {Readonly<Record<string, WalletStatus>>}
 */
export const EXAMPLES = Object.freeze({
  /** No injected wallet. The app reads mainnet (or the URL chain) and shows the view-only banner; the banner never carries an action. */
  NO_WALLET: {
    connection: CONNECTION.NONE,
    walletDetected: false,
    address: null,
    chain: MAINNET,
    viewOnly: true,
    isSmartContractWallet: null,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Wallet installed but no account authorised yet, or the connection request was rejected. Same chrome as NO_WALLET, plus a "Connect" button in the header's wallet area. */
  WALLET_NOT_CONNECTED: {
    connection: CONNECTION.NONE,
    walletDetected: true,
    address: null,
    chain: MAINNET,
    viewOnly: true,
    isSmartContractWallet: null,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Connected on a supported chain. Full navigation, no banner. */
  CONNECTED_SUPPORTED: {
    connection: CONNECTION.CONNECTED,
    walletDetected: true,
    address: EOA,
    chain: MAINNET,
    viewOnly: false,
    isSmartContractWallet: false,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Connected on Gnosis, the chain fixture mode runs on. Same chrome as CONNECTED_SUPPORTED with Gnosis chain data. */
  CONNECTED_GNOSIS: {
    connection: CONNECTION.CONNECTED,
    walletDetected: true,
    address: EOA,
    chain: GNOSIS,
    viewOnly: false,
    isSmartContractWallet: false,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Connected on a supported testnet. Footer may flag the testnet; everything else as CONNECTED_SUPPORTED. */
  CONNECTED_TESTNET: {
    connection: CONNECTION.CONNECTED,
    walletDetected: true,
    address: EOA,
    chain: SEPOLIA,
    viewOnly: false,
    isSmartContractWallet: false,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Connected, but the account is a smart contract wallet. Header shows the dismissible warning. */
  CONNECTED_SMART_CONTRACT_WALLET: {
    connection: CONNECTION.CONNECTED,
    walletDetected: true,
    address: "0x2222222222222222222222222222222222222222",
    chain: MAINNET,
    viewOnly: false,
    isSmartContractWallet: true,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Connected on a chain that is not in the network map. Footer shows "Unsupported Network"; pages show the unsupported view. */
  CONNECTED_UNSUPPORTED: {
    connection: CONNECTION.CONNECTED,
    walletDetected: true,
    address: EOA,
    chain: UNSUPPORTED,
    viewOnly: false,
    isSmartContractWallet: false,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Provider, signer or chain still resolving. Chain-dependent chrome (network name, explorer link) is not available yet. */
  CONNECTING: {
    connection: CONNECTION.CONNECTING,
    walletDetected: true,
    address: null,
    chain: null,
    viewOnly: true,
    isSmartContractWallet: null,
    error: null,
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Wallet resolution failed. The adapter fell back to read-only mainnet so the app stays browsable. */
  ERROR: {
    connection: CONNECTION.ERROR,
    walletDetected: true,
    address: null,
    chain: MAINNET,
    viewOnly: true,
    isSmartContractWallet: null,
    error: {
      code: "init-failed",
      message: "Could not connect to your wallet. Check the extension and reload the page.",
    },
    chains: SWITCHABLE,
    switchError: null,
  },

  /** Connected, but the last chain switch failed (the wallet could not switch or add the chain). The header shows the message next to the switcher. */
  SWITCH_FAILED: {
    connection: CONNECTION.CONNECTED,
    walletDetected: true,
    address: EOA,
    chain: MAINNET,
    viewOnly: false,
    isSmartContractWallet: false,
    error: null,
    chains: SWITCHABLE,
    switchError: {
      code: "switch-failed",
      message: "Could not switch the network.",
    },
  },
});
