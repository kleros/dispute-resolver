import { CHAINS, getChain, type ChainConfig } from "@dispute-resolver/core";
import { defineChain, type Chain } from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  gnosis,
  gnosisChiado,
  mainnet,
  optimismSepolia,
  polygon,
  redstone,
  sepolia,
  unichain,
  unichainSepolia,
  zksync,
  zksyncSepoliaTestnet,
} from "viem/chains";

/**
 * The viem definitions of the configured chains, imported one by one so the bundle carries only these. Their
 * `rpcUrls` are the public endpoints a wallet receives in `wallet_addEthereumChain` (P-03); the app never reads
 * through them (A13): reads use core's read clients, and wagmi's transports are built from the configured RPC only.
 */
const VIEM_CHAINS: readonly Chain[] = [
  mainnet,
  gnosis,
  gnosisChiado,
  sepolia,
  unichain,
  unichainSepolia,
  polygon,
  zksyncSepoliaTestnet,
  zksync,
  redstone,
  arbitrum,
  arbitrumSepolia,
  optimismSepolia,
  base,
  baseSepolia,
];

/**
 * The viem chain of a configured chain, named as the app names it. A chain viem does not know is defined from the core
 * table with no RPC URL, so nothing can read through it (D-56).
 */
export function toViemChain(config: ChainConfig): Chain {
  const known = VIEM_CHAINS.find((chain) => chain.id === config.id);
  if (known !== undefined) return { ...known, name: config.name };
  return defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: { name: config.currency, symbol: config.currency, decimals: 18 },
    rpcUrls: { default: { http: [] } },
    ...(config.explorerBaseUrl === undefined ? {} : { blockExplorers: { default: { name: config.name, url: config.explorerBaseUrl } } }),
    testnet: config.isTestnet,
  });
}

/** The configured chains in ascending ID order, as a non-empty tuple for wagmi and AppKit. */
export function configuredChains(): readonly [Chain, ...Chain[]] {
  const [first, ...rest] = Object.values(CHAINS)
    .slice()
    .sort((left, right) => left.id - right.id)
    .map(toViemChain);
  if (first === undefined) throw new Error("The chain table is empty.");
  return [first, ...rest];
}

/** The configured chain's display name, or a generic name for any other chain ID a wallet reports. */
export function chainName(chainId: number): string {
  return getChain(chainId)?.name ?? `chain ${String(chainId)}`;
}
