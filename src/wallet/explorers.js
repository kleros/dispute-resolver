/**
 * Block explorer base URLs of the chains in src/ethereum/network-contract-mapping.js, keyed by decimal chain id.
 *
 * The network map has no explorer field, so the adapter looks explorers up here. Chains whose explorer is not well
 * known, and retired testnets (Görli, Mumbai) whose explorers are gone, are left out and resolve to null.
 */
export const EXPLORER_BASE_URLS = Object.freeze({
  1: "https://etherscan.io",
  100: "https://gnosisscan.io",
  130: "https://uniscan.xyz",
  137: "https://polygonscan.com",
  300: "https://sepolia.explorer.zksync.io",
  324: "https://explorer.zksync.io",
  690: "https://explorer.redstone.xyz",
  1301: "https://sepolia.uniscan.xyz",
  8453: "https://basescan.org",
  10200: "https://gnosis-chiado.blockscout.com",
  42161: "https://arbiscan.io",
  84532: "https://sepolia.basescan.org",
  421614: "https://sepolia.arbiscan.io",
  11155111: "https://sepolia.etherscan.io",
  11155420: "https://sepolia-optimism.etherscan.io",
});

//Own-property lookup so ids like "constructor" do not resolve to Object.prototype members.
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/**
 * @param {string | number | bigint | null | undefined} chainId Decimal chain id, as a string or a number.
 * @returns {string | null} The explorer origin without a trailing slash, or null when the chain has no known explorer.
 */
export const getExplorerBaseUrl = (chainId) => (hasOwn(EXPLORER_BASE_URLS, chainId) ? EXPLORER_BASE_URLS[chainId] : null);

/**
 * Link to the verified source of a contract, e.g. https://etherscan.io/address/0x...#code.
 * @param {string | number | bigint | null | undefined} chainId Decimal chain id.
 * @param {string | null | undefined} address Contract address.
 * @returns {string | null} null when the chain has no known explorer or there is no address.
 */
export const getContractCodeUrl = (chainId, address) => {
  const base = getExplorerBaseUrl(chainId);
  if (!base || typeof address !== "string" || address === "") return null;
  return `${base}/address/${address}#code`;
};
