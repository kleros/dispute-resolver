/**
 * Blockchain Constants
 * Centralized configuration for blockchain operations
 */

// Hex formatting
export const HEX_PADDING_WIDTH = 64;

// Block search configuration
export const BLOCK_SEARCH_RANGE = 10000;
export const BLOCK_SEARCH_WINDOW = 10000;

// Dispute periods (from Kleros contracts)
export const DISPUTE_PERIODS = {
  EVIDENCE: 0,
  COMMIT: 1,
  VOTE: 2,
  APPEAL: 3,
  EXECUTION: 4
};

// Network timeouts (in milliseconds)
export const NETWORK_TIMEOUTS = {
  TRANSACTION: 300000, // 5 minutes
  BLOCK_CONFIRMATION: 60000, // 1 minute
  CONTRACT_CALL: 30000, // 30 seconds
  IPFS_UPLOAD: 120000, // 2 minutes
  METADATA_FETCH: 60000 // 1 minute
};

// Cache configuration
export const CACHE_TTL = {
  METADATA: 24 * 60 * 60 * 1000, // 24 hours
  DISPUTE_DETAILS: 5 * 60 * 1000, // 5 minutes
  SUBCOURT_INFO: 60 * 60 * 1000, // 1 hour
  NETWORK_CONFIG: 60 * 60 * 1000 // 1 hour
};

// IPFS configuration
export const IPFS_GATEWAY = "https://ipfs.kleros.io";
export const IPFS_TIMEOUT = 30000; // 30 seconds

// Scaling factors for BigInt operations
export const SCALING_FACTORS = {
  PERCENTAGE_MULTIPLIER: 10000n, // For percentage calculations (basis points)
  WEI_TO_ETH: 1000000000000000000n, // 10^18
  GWEI_TO_WEI: 1000000000n, // 10^9
  PRECISION_MULTIPLIER: 1000000n // For precise calculations
};

// Gas limits
export const GAS_LIMITS = {
  CREATE_DISPUTE: 500000,
  SUBMIT_EVIDENCE: 200000,
  FUND_APPEAL: 300000,
  WITHDRAW_REWARDS: 400000,
  ESTIMATE_BUFFER: 1.2 // 20% buffer for gas estimation
};

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000, // 1 second
  MAX_DELAY: 10000, // 10 seconds
  BACKOFF_FACTOR: 2
};

// Exceptional contract addresses that require special handling
export const EXCEPTIONAL_CONTRACT_ADDRESSES = [
  "0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069", // Legacy contract
  "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002"  // Another legacy contract
];

// Court configuration
export const COURT_CONFIG = {
  DEFAULT_SUBCOURT: 0,
  MIN_JURORS: 3,
  MAX_JURORS: 15,
  DEFAULT_JURORS: 3
};

// Transaction types for error handling
export const TRANSACTION_TYPES = {
  CREATE_DISPUTE: 'create-dispute',
  SUBMIT_EVIDENCE: 'submit-evidence',
  FUND_APPEAL: 'fund-appeal',
  WITHDRAW_REWARDS: 'withdraw-rewards',
  GENERAL_CONTRACT_CALL: 'contract-call'
};

// Error codes
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONTRACT_ERROR: 'CONTRACT_ERROR',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  USER_REJECTED: 'USER_REJECTED',
  TIMEOUT: 'TIMEOUT',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// Common contract addresses (will be overridden by network-specific configs)
export const DEFAULT_ADDRESSES = {
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
  BURN_ADDRESS: '0x000000000000000000000000000000000000dEaD'
};

// File upload limits
export const FILE_LIMITS = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
};

// Validation constants
export const VALIDATION = {
  MIN_DISPUTE_TITLE_LENGTH: 10,
  MAX_DISPUTE_TITLE_LENGTH: 100,
  MIN_DESCRIPTION_LENGTH: 50,
  MAX_DESCRIPTION_LENGTH: 5000,
  MIN_QUESTION_LENGTH: 10,
  MAX_QUESTION_LENGTH: 500,
  MIN_RULING_OPTIONS: 2,
  MAX_RULING_OPTIONS: 10,
  ADDRESS_LENGTH: 42, // Including 0x prefix
  HASH_LENGTH: 66 // Including 0x prefix
};