import { BLOCKCHAIN_CONSTANTS } from '../constants/blockchain.js';
import { UI_CONSTANTS } from '../constants/ui';
import { ErrorHandler } from './errorHandler.js';

/**
 * Blockchain utility functions
 * Consolidates common operations for BigInt handling, address formatting, and blockchain calculations
 */

import { 
  HEX_PADDING_WIDTH, 
  PERCENTAGE_SCALING_FACTOR, 
  PERCENTAGE_SCALING_DIVISOR,
  NETWORK_TIMEOUTS
} from '../constants/blockchain.js';
import { VALIDATION_RULES } from '../constants/ui.js';

/**
 * Safely handles BigInt conversions and formatting
 */
export const BigIntUtils = {
  /**
   * Safely converts any value to string, handling BigInt and ethers BigNumber
   * @param {any} value - Value to convert
   * @returns {string} String representation
   */
  toStringSafe(value) {
    try {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (value && typeof value === 'object' && value._isBigNumber) {
        return value.toString();
      }
      if (value && typeof value === 'object' && typeof value.toString === 'function') {
        if (value.type === 'BigNumber' || value._hex !== undefined) {
          return value.toString();
        }
      }
      return String(value);
    } catch (error) {
      console.warn('Failed to convert value to string:', { value, error });
      return '0';
    }
  },

  /**
   * Safely parses a value to BigInt
   * @param {any} value - Value to parse
   * @returns {bigint} BigInt value
   */
  parseSafe(value) {
    try {
      if (typeof value === 'bigint') {
        return value;
      }
      const str = this.toStringSafe(value);
      return BigInt(str);
    } catch (error) {
      console.warn('Failed to parse BigInt:', { value, error });
      return 0n;
    }
  },

  /**
   * Calculates percentage with specified precision
   * @param {bigint} numerator - Numerator value
   * @param {bigint} denominator - Denominator value  
   * @param {number} precision - Decimal places (default: 2)
   * @returns {string} Formatted percentage
   */
  calculatePercentage(numerator, denominator, precision = 2) {
    if (denominator === 0n) return '0.00';
    
    try {
      const scaled = (numerator * PERCENTAGE_SCALING_FACTOR) / denominator;
      return (Number(scaled) / PERCENTAGE_SCALING_DIVISOR).toFixed(precision);
    } catch (error) {
      console.warn('Failed to calculate percentage:', { numerator, denominator, error });
      return '0.00';
    }
  }
};

/**
 * Address validation and formatting utilities
 */
export const AddressUtils = {
  /**
   * Validates Ethereum address format
   * @param {string} address - Address to validate
   * @returns {boolean} True if valid
   */
  isValid(address) {
    if (!address || typeof address !== 'string') {
      return false;
    }
    return VALIDATION_RULES.ADDRESS_PATTERN.test(address);
  },

  /**
   * Formats address for display (truncated)
   * @param {string} address - Full address
   * @param {number} startChars - Characters to show at start (default: 6)
   * @param {number} endChars - Characters to show at end (default: 4)
   * @returns {string} Formatted address
   */
  format(address, startChars = 6, endChars = 4) {
    if (!this.isValid(address)) {
      return 'Invalid Address';
    }
    
    if (address.length <= startChars + endChars) {
      return address;
    }
    
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
  },

  /**
   * Normalizes address to lowercase
   * @param {string} address - Address to normalize
   * @returns {string} Normalized address
   */
  normalize(address) {
    return this.isValid(address) ? address.toLowerCase() : '';
  }
};

/**
 * Hex data processing utilities
 */
export const HexUtils = {
  /**
   * Generates arbitrator extra data for Kleros
   * @param {string|number} subcourtID - Subcourt identifier
   * @param {string|number} numberOfVotes - Number of jurors
   * @returns {string} Hex-encoded extra data
   */
  generateArbitratorExtraData(subcourtID, numberOfVotes) {
    try {
      const courtHex = parseInt(subcourtID, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0");
      const votesHex = parseInt(numberOfVotes, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0");
      return `0x${courtHex}${votesHex}`;
    } catch (error) {
      console.warn('Failed to generate extra data:', { subcourtID, numberOfVotes, error });
      return '0x';
    }
  },

  /**
   * Validates hex string format
   * @param {string} hexString - Hex string to validate
   * @returns {boolean} True if valid
   */
  isValid(hexString) {
    if (!hexString || typeof hexString !== 'string') {
      return false;
    }
    return /^0x[0-9a-fA-F]*$/.test(hexString);
  },

  /**
   * Processes hex value for Reality.eth compatibility
   * @param {string} hashValue - Hash value to process
   * @returns {string} Processed hex value
   */
  processRealityEthValue(hashValue) {
    try {
      const hexWithoutPrefix = hashValue.slice(2); // Remove '0x'
      
      if (!hexWithoutPrefix) {
        throw new Error('Invalid hex value: empty hex string');
      }
      
      if (!/^[0-9a-fA-F]+$/.test(hexWithoutPrefix)) {
        throw new Error(`Invalid hex value: contains non-hex characters: ${hashValue}`);
      }
      
      const numericValue = BigInt('0x' + hexWithoutPrefix);
      return (numericValue - 1n).toString(16);
    } catch (error) {
      console.warn('Failed to process Reality.eth value:', { hashValue, error });
      throw error;
    }
  }
};

/**
 * Network retry utilities
 */
export const RetryUtils = {
  /**
   * Retries an async operation with exponential backoff
   * @param {Function} operation - Async function to retry
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @param {number} baseDelay - Base delay in ms (default: 1000)
   * @returns {Promise} Result of operation
   */
  async withExponentialBackoff(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await Promise.race([
          operation(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), NETWORK_TIMEOUTS.RPC_TIMEOUT)
          )
        ]);
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`Operation failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
};

/**
 * Error formatting utilities
 */
export const ErrorUtils = {
  /**
   * Extracts readable error message from various error types
   * @param {Error|string|object} error - Error to process
   * @returns {string} Human-readable error message
   */
  extractMessage(error) {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error?.message) {
      return error.message;
    }
    
    if (error?.reason) {
      return error.reason;
    }
    
    if (error?.data?.message) {
      return error.data.message;
    }
    
    return 'An unknown error occurred';
  },

  /**
   * Determines if error is network-related
   * @param {Error} error - Error to check
   * @returns {boolean} True if network error
   */
  isNetworkError(error) {
    const message = this.extractMessage(error).toLowerCase();
    return message.includes('network') || 
           message.includes('timeout') || 
           message.includes('connection') ||
           error?.code === 'NETWORK_ERROR';
  }
};

/**
 * Blockchain utility functions
 * Centralizes blockchain-related operations and eliminates code duplication
 */
export const BlockchainUtils = {
  /**
   * Validates Ethereum address format
   */
  validateAddress(address) {
    if (!address || typeof address !== 'string') {
      return false;
    }
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },

  /**
   * Calculates percentage with precision handling
   * Uses BigInt arithmetic to avoid precision loss
   */
  calculatePercentageWithPrecision(numerator, denominator, precision = 2) {
    try {
      if (!denominator || denominator === 0n) {
        return '0.00';
      }

      const bigNumerator = BigInt(numerator);
      const bigDenominator = BigInt(denominator);

      if (bigDenominator === 0n) {
        return '0.00';
      }

      // Scale up for precision
      const scaledResult = (bigNumerator * BLOCKCHAIN_CONSTANTS.SCALING_FACTORS.PERCENTAGE) / bigDenominator;
      const percentage = Number(scaledResult) / BLOCKCHAIN_CONSTANTS.SCALING_FACTORS.PERCENTAGE_DIVISOR;

      return percentage.toFixed(precision);
    } catch (error) {
      ErrorHandler.logError(error, 'percentage-calculation', { numerator, denominator, precision });
      return '0.00';
    }
  },

  /**
   * Truncates address for display
   */
  truncateAddress(address, startLength = 6, endLength = 4) {
    if (!this.validateAddress(address)) {
      return address;
    }
    return `${address.substring(0, startLength)}...${address.substring(address.length - endLength)}`;
  },

  /**
   * Generates arbitrator extra data
   * Combines subcourt ID and number of jurors into hex format
   */
  generateArbitratorExtraData(subcourtID, numberOfJurors) {
    try {
      const paddedSubcourt = parseInt(subcourtID, 10)
        .toString(16)
        .padStart(BLOCKCHAIN_CONSTANTS.HEX_PADDING_WIDTH, "0");
      
      const paddedJurors = parseInt(numberOfJurors, 10)
        .toString(16)
        .padStart(BLOCKCHAIN_CONSTANTS.HEX_PADDING_WIDTH, "0");

      return `0x${paddedSubcourt}${paddedJurors}`;
    } catch (error) {
      ErrorHandler.logError(error, 'generate-extra-data', { subcourtID, numberOfJurors });
      return '0x';
    }
  },

  /**
   * Retry wrapper for blockchain operations
   */
  async retryOperation(operation, maxRetries = BLOCKCHAIN_CONSTANTS.RETRY_CONFIG.MAX_RETRIES) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }

        const delay = BLOCKCHAIN_CONSTANTS.RETRY_CONFIG.EXPONENTIAL_BACKOFF
          ? BLOCKCHAIN_CONSTANTS.RETRY_CONFIG.BASE_DELAY * Math.pow(2, attempt)
          : BLOCKCHAIN_CONSTANTS.RETRY_CONFIG.BASE_DELAY;

        await this.delay(delay);
      }
    }
  },

  /**
   * Promise-based delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Safely converts wei to ether
   */
  formatEther(weiValue) {
    try {
      // Using dynamic import to avoid circular dependencies
      const { ethers } = require('ethers');
      return ethers.formatEther(weiValue);
    } catch (error) {
      ErrorHandler.logError(error, 'format-ether', { weiValue });
      return '0.0';
    }
  },

  /**
   * Safely converts ether to wei
   */
  parseEther(etherValue) {
    try {
      const { ethers } = require('ethers');
      return ethers.parseEther(etherValue.toString());
    } catch (error) {
      ErrorHandler.logError(error, 'parse-ether', { etherValue });
      return 0n;
    }
  },

  /**
   * Calculates return on investment ratio
   */
  calculateROI(winner, loser, divisor, precision = 2) {
    try {
      const bigWinner = BigInt(winner);
      const bigLoser = BigInt(loser);
      const bigDivisor = BigInt(divisor);

      if (bigDivisor === 0n) {
        return '0.00';
      }

      const roi = ((bigWinner + bigLoser + bigDivisor) * BLOCKCHAIN_CONSTANTS.SCALING_FACTORS.PRECISION) / (bigWinner + bigDivisor);
      return (Number(roi) / 1000).toFixed(precision);
    } catch (error) {
      ErrorHandler.logError(error, 'roi-calculation', { winner, loser, divisor });
      return '0.00';
    }
  },

  /**
   * Validates and normalizes network ID
   */
  normalizeNetworkId(networkId) {
    if (typeof networkId === 'number') {
      return networkId.toString();
    }
    if (typeof networkId === 'string') {
      // Handle hex format
      if (networkId.startsWith('0x')) {
        return parseInt(networkId, 16).toString();
      }
      return networkId;
    }
    return null;
  },

  /**
   * Checks if a transaction hash is valid
   */
  isValidTransactionHash(hash) {
    return typeof hash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(hash);
  },

  /**
   * Safe JSON stringification for blockchain objects
   */
  safeJSONStringify(obj) {
    try {
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        if (value && typeof value === 'object' && value._isBigNumber) {
          return value.toString();
        }
        if (value && typeof value === 'object' && typeof value.toString === 'function') {
          if (value.type === 'BigNumber' || value._hex !== undefined) {
            return value.toString();
          }
        }
        return value;
      });
    } catch (error) {
      ErrorHandler.logError(error, 'json-stringify', { obj: typeof obj });
      return '{}';
    }
  },

  /**
   * Calculate funding percentage for appeals
   */
  calculateFundingPercentage: (raised, target) => {
    if (!target || target === 0n) return 0;
    return BlockchainUtils.calculatePercentage(raised, target, 2);
  },

  /**
   * Get human-readable dispute period name
   */
  getDisputePeriodName: (period) => {
    const periodNames = {
      [BLOCKCHAIN_CONSTANTS.DISPUTE_PERIODS.EVIDENCE]: 'Evidence',
      [BLOCKCHAIN_CONSTANTS.DISPUTE_PERIODS.COMMIT]: 'Commit',
      [BLOCKCHAIN_CONSTANTS.DISPUTE_PERIODS.VOTE]: 'Vote',
      [BLOCKCHAIN_CONSTANTS.DISPUTE_PERIODS.APPEAL]: 'Appeal',
      [BLOCKCHAIN_CONSTANTS.DISPUTE_PERIODS.EXECUTION]: 'Execution'
    };
    
    return periodNames[parseInt(period)] || 'Unknown';
  },

  /**
   * Validate and sanitize numeric inputs for blockchain operations
   */
  sanitizeNumericInput: (input, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const num = parseInt(input);
    if (isNaN(num) || num < min || num > max) {
      return null;
    }
    return num;
  }
};

// Convenience exports for frequently used functions
export const {
  formatBigIntSafely,
  calculatePercentageWithPrecision,
  truncateAddress,
  isValidAddress,
  retryOperation
} = BlockchainUtils;