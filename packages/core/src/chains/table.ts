import type { Address } from "../types";
import type { ChainCapabilities, ChainConfig, ChainTable } from "./types";

/** The target of chain-less redirects. */
export const DEFAULT_CHAIN_ID = 1;

const MAINNET_LOOKBACK = 1_000_000;
/** Testnet RPCs cap `eth_getLogs` ranges. */
const TESTNET_LOOKBACK = 50_000;

const MAINNET_POLICY_REGISTRY: Address = "0xcf1f07713d5193fae5c1653c9f61953d048bece4";
const SEPOLIA_POLICY_REGISTRY: Address = "0x88fb25d399310c07d35cb9091b8346d8b1893aa5";

/** Chains without an arbitrator copy chain 1's or Sepolia's deploy block. */
const MAINNET_DEPLOY_BLOCK = 7303699;
const SEPOLIA_DEPLOY_BLOCK = 3635742;

const MIRRORS_MAINNET = { maxLookback: MAINNET_LOOKBACK, arbitratorDeployedAtBlock: MAINNET_DEPLOY_BLOCK, policyRegistry: MAINNET_POLICY_REGISTRY } as const;
const MIRRORS_SEPOLIA = { maxLookback: TESTNET_LOOKBACK, arbitratorDeployedAtBlock: SEPOLIA_DEPLOY_BLOCK, policyRegistry: SEPOLIA_POLICY_REGISTRY } as const;

const CONFIGS: readonly Omit<ChainConfig, "publicRpcEnv">[] = [
  {
    id: 1,
    name: "Ethereum Mainnet",
    currency: "ETH",
    isTestnet: false,
    klerosLiquid: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
    arbitrableProxy: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
    ...MIRRORS_MAINNET,
    readRpcEnv: "REACT_APP_WEB3_PROVIDER_URL",
    explorerBaseUrl: "https://etherscan.io",
  },
  {
    id: 100,
    name: "Gnosis Network",
    currency: "xDai",
    isTestnet: false,
    klerosLiquid: "0x9c1da9a04925bdfdedf0f6421bc7eea8305f9002",
    arbitrableProxy: "0xc7add3c961f7935cb4914e37da991d2f1cd7986c",
    policyRegistry: "0x9d494768936b6bdaabc46733b8d53a937a6c6d7e",
    arbitratorDeployedAtBlock: 16895601,
    maxLookback: MAINNET_LOOKBACK,
    readRpcEnv: "REACT_APP_WEB3_XDAI_PROVIDER_URL",
    explorerBaseUrl: "https://gnosisscan.io",
  },
  {
    id: 10200,
    name: "Gnosis Testnet Chiado",
    currency: "xDai",
    isTestnet: true,
    klerosLiquid: "0xd8798dfae8194d6b4cd6e2da6187ae4209d06f27",
    arbitrableProxy: "0x4bef0321bd7fa943f85ae55e07f790c6becbd177",
    policyRegistry: "0x53fc70fe1ec3a60f8939a62abcc61bf1a57938d7",
    arbitratorDeployedAtBlock: 1165867,
    maxLookback: TESTNET_LOOKBACK,
    readRpcEnv: "REACT_APP_WEB3_CHIADO_PROVIDER_URL",
    explorerBaseUrl: "https://gnosis-chiado.blockscout.com",
  },
  {
    id: 11155111,
    name: "Ethereum Testnet Sepolia",
    currency: "sETH",
    isTestnet: true,
    klerosLiquid: "0x90992fb4e15ce0c59aeffb376460fda4ee19c879",
    arbitrableProxy: "0x009ca5a0b816156f91b29a93d7688c52480bab24",
    ...MIRRORS_SEPOLIA,
    readRpcEnv: "REACT_APP_WEB3_SEPOLIA_PROVIDER_URL",
    explorerBaseUrl: "https://sepolia.etherscan.io",
  },
  {
    id: 130,
    name: "Unichain Mainnet",
    currency: "ETH",
    isTestnet: false,
    ...MIRRORS_MAINNET,
    readRpcEnv: "REACT_APP_UNICHAIN",
    explorerBaseUrl: "https://uniscan.xyz",
  },
  {
    id: 1301,
    name: "Unichain Testnet",
    currency: "ETH",
    isTestnet: true,
    ...MIRRORS_SEPOLIA,
    readRpcEnv: "REACT_APP_UNICHAIN_SEPOLIA",
    explorerBaseUrl: "https://sepolia.uniscan.xyz",
  },
  {
    id: 137,
    name: "Polygon Mainnet",
    currency: "MATIC",
    isTestnet: false,
    arbitratorDeployedAtBlock: MAINNET_DEPLOY_BLOCK,
    maxLookback: MAINNET_LOOKBACK,
    readRpcEnv: "REACT_APP_WEB3_POLYGON_PROVIDER_URL",
    explorerBaseUrl: "https://polygonscan.com",
  },
  {
    id: 300,
    name: "zkSync Era Testnet Sepolia",
    currency: "sETH",
    isTestnet: true,
    ...MIRRORS_SEPOLIA,
    defaultRpcUrl: "https://sepolia.era.zksync.dev/",
    explorerBaseUrl: "https://sepolia.explorer.zksync.io",
  },
  {
    id: 324,
    name: "zkSync Era Mainnet",
    currency: "ETH",
    isTestnet: false,
    ...MIRRORS_MAINNET,
    defaultRpcUrl: "https://mainnet.era.zksync.io",
    explorerBaseUrl: "https://explorer.zksync.io",
  },
  {
    id: 42161,
    name: "Arbitrum One",
    currency: "ETH",
    isTestnet: false,
    ...MIRRORS_MAINNET,
    readRpcEnv: "REACT_APP_ARBITRUM_ONE",
    explorerBaseUrl: "https://arbiscan.io",
  },
  {
    id: 421614,
    name: "Arbitrum Testnet Sepolia",
    currency: "ETH",
    isTestnet: true,
    ...MIRRORS_SEPOLIA,
    readRpcEnv: "REACT_APP_ARBITRUM_SEPOLIA",
    explorerBaseUrl: "https://sepolia.arbiscan.io",
  },
  {
    id: 11155420,
    name: "Optimism Testnet Sepolia",
    currency: "ETH",
    isTestnet: true,
    ...MIRRORS_SEPOLIA,
    readRpcEnv: "REACT_APP_OPTIMISM_SEPOLIA",
    explorerBaseUrl: "https://optimism-sepolia.blockscout.com",
  },
  {
    id: 8453,
    name: "Base Mainnet",
    currency: "ETH",
    isTestnet: false,
    ...MIRRORS_MAINNET,
    readRpcEnv: "REACT_APP_BASE",
    explorerBaseUrl: "https://basescan.org",
  },
  {
    id: 84532,
    name: "Base Sepolia",
    currency: "ETH",
    isTestnet: true,
    ...MIRRORS_SEPOLIA,
    readRpcEnv: "REACT_APP_BASE_SEPOLIA",
    explorerBaseUrl: "https://sepolia.basescan.org",
  },
];

/** Frozen, so no caller can reconfigure a chain. */
export const CHAINS: ChainTable = Object.freeze(
  Object.fromEntries(CONFIGS.map((chain) => [chain.id, Object.freeze({ ...chain, publicRpcEnv: `REACT_APP_PUBLIC_RPC_${String(chain.id)}` })])),
);

/** `undefined` for an unsupported chain; never throws. */
export function getChain(chainId: number): ChainConfig | undefined {
  return Object.hasOwn(CHAINS, chainId) ? CHAINS[chainId] : undefined;
}

/** The Ongoing list and cases need an arbitrator, Create needs the proxy. */
export function chainCapabilities(chain: ChainConfig): ChainCapabilities {
  return { hasArbitrator: chain.klerosLiquid !== undefined, canCreate: chain.arbitrableProxy !== undefined };
}

/** First block of the Ongoing list window: the later of the deploy block and `head − maxLookback`, never below 0. */
export function ongoingScanStart(chain: ChainConfig, head: bigint): bigint {
  const windowStart = head - BigInt(chain.maxLookback);
  const deployed = BigInt(chain.arbitratorDeployedAtBlock ?? 0);
  const floor = windowStart > deployed ? windowStart : deployed;
  return floor > 0n ? floor : 0n;
}
