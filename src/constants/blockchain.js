/**
 * Blockchain-related constants
 * Centralizes magic numbers and configuration values used throughout the application
 */

// Hex processing constants
export const HEX_PADDING_WIDTH = 64;
export const HEX_PREFIX_LENGTH = 2; // "0x"

// Block search parameters
export const BLOCK_SEARCH_RANGE = 1_000_000;
export const BLOCK_SEARCH_WINDOW = 100_000;

// Dispute periods (from Kleros protocol)
export const DISPUTE_PERIODS = {
  EVIDENCE: 0,
  COMMIT: 1,
  VOTING: 2,
  APPEAL: 3,
  EXECUTION: 4
};

// Percentage calculations
export const PERCENTAGE_SCALING_FACTOR = 10000n;
export const PERCENTAGE_SCALING_DIVISOR = 100;

// Cache TTL values
export const CACHE_TTL = {
  SUBCOURTS: 3 * 60 * 60 * 1000, // 3 hours
  DISPUTES: 1 * 60 * 1000, // 1 minute
  METADATA: 5 * 60 * 1000 // 5 minutes
};

// IPFS configuration
export const IPFS_GATEWAY = "https://cdn.kleros.link";

// Known exceptional contract addresses (for special handling)
export const EXCEPTIONAL_CONTRACT_ADDRESSES = [
  '0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38',
  '0xb9f9B5eee2ad29098b9b3Ea0B401571F5dA4AD81'
];

// Network timeout values
export const NETWORK_TIMEOUTS = {
  TRANSACTION_TIMEOUT: 300000, // 5 minutes
  RPC_TIMEOUT: 30000, // 30 seconds
  RETRY_DELAY: 2000 // 2 seconds
};

// Gas estimation multipliers
export const GAS_MULTIPLIERS = {
  SAFETY_MARGIN: 1.2, // 20% extra gas
  PRIORITY_FEE: 1.1 // 10% extra for priority
};

// Scaling factors for calculations
export const SCALING_FACTORS = {
  PRECISION: 1000n,
  PERCENTAGE: 10000n,
  PERCENTAGE_DIVISOR: 100
};

// Contract interaction retries
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY: 1000,
  EXPONENTIAL_BACKOFF: true
};

// Gas estimation padding
export const GAS_PADDING = {
  MULTIPLIER: 1.2,
  MIN_PADDING: 10000
};

// Scaling divisors for display
export const SCALING_DIVISORS = {
  PRECISION: 1000,
  PERCENTAGE: 100
};

// Binary padding for multiple select calculations
export const BINARY_PADDING_WIDTH = 4;

// Network identifiers
export const NETWORK_IDS = {
  MAINNET: '1',
  GOERLI: '5',
  GNOSIS: '100',
  SEPOLIA: '11155111'
};

// Gas estimation and retry settings
export const GAS_SETTINGS = {
  ESTIMATION_RETRIES: 3,
  TRANSACTION_RETRIES: 2,
  RETRY_DELAY_MS: 1000
};