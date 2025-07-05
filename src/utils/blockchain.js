/**
 * Blockchain Utility Functions
 * Common operations for blockchain interactions
 */

import { ethers } from 'ethers';
import { 
  SCALING_FACTORS, 
  RETRY_CONFIG, 
  VALIDATION,
  DEFAULT_ADDRESSES,
  GAS_LIMITS,
  HEX_PADDING_WIDTH,
  NETWORK_TIMEOUTS
} from '../constants/blockchain.js';
import { debug } from './errorHandler.js';

/**
 * BigInt utility functions
 */
export class BigIntUtils {
  /**
   * Formats BigInt to human-readable string
   */
  static formatEther(value) {
    if (!value) return '0';
    try {
      return ethers.formatEther(value);
    } catch (error) {
      debug('bigint-utils', 'Failed to format ether', { value, error: error.message });
      return '0';
    }
  }

  /**
   * Parses string to BigInt (wei)
   */
  static parseEther(value) {
    if (!value || value === '0') return 0n;
    try {
      return ethers.parseEther(value.toString());
    } catch (error) {
      debug('bigint-utils', 'Failed to parse ether', { value, error: error.message });
      return 0n;
    }
  }

  /**
   * Formats BigInt with custom decimals
   */
  static formatUnits(value, decimals = 18) {
    if (!value) return '0';
    try {
      return ethers.formatUnits(value, decimals);
    } catch (error) {
      debug('bigint-utils', 'Failed to format units', { value, decimals, error: error.message });
      return '0';
    }
  }

  /**
   * Parses string to BigInt with custom decimals
   */
  static parseUnits(value, decimals = 18) {
    if (!value || value === '0') return 0n;
    try {
      return ethers.parseUnits(value.toString(), decimals);
    } catch (error) {
      debug('bigint-utils', 'Failed to parse units', { value, decimals, error: error.message });
      return 0n;
    }
  }

  /**
   * Calculates percentage of a BigInt value
   */
  static calculatePercentage(value, percentage) {
    if (!value || !percentage) return 0n;
    try {
      const bigIntValue = BigInt(value);
      const bigIntPercentage = BigInt(Math.floor(percentage * 100)); // Convert to basis points
      return (bigIntValue * bigIntPercentage) / SCALING_FACTORS.PERCENTAGE_MULTIPLIER;
    } catch (error) {
      debug('bigint-utils', 'Failed to calculate percentage', { value, percentage, error: error.message });
      return 0n;
    }
  }

  /**
   * Safely converts any value to string, handling BigInt and ethers BigNumber
   */
  static toStringSafe(value) {
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
      debug('bigint-utils', 'Failed to convert value to string', { value, error: error.message });
      return '0';
    }
  }

  /**
   * Safely parses a value to BigInt
   */
  static parseSafe(value) {
    try {
      if (typeof value === 'bigint') {
        return value;
      }
      const str = this.toStringSafe(value);
      return BigInt(str);
    } catch (error) {
      debug('bigint-utils', 'Failed to parse BigInt', { value, error: error.message });
      return 0n;
    }
  }

  /**
   * Adds two BigInt values safely
   */
  static safeAdd(a, b) {
    try {
      return BigInt(a) + BigInt(b);
    } catch (error) {
      debug('bigint-utils', 'Failed to add values', { a, b, error: error.message });
      return 0n;
    }
  }

  /**
   * Subtracts two BigInt values safely
   */
  static safeSubtract(a, b) {
    try {
      const result = BigInt(a) - BigInt(b);
      return result < 0n ? 0n : result;
    } catch (error) {
      debug('bigint-utils', 'Failed to subtract values', { a, b, error: error.message });
      return 0n;
    }
  }

  /**
   * Formats BigInt for display with proper decimal places
   */
  static formatForDisplay(value, decimals = 18, displayDecimals = 4) {
    try {
      const formatted = this.formatUnits(value, decimals);
      const number = parseFloat(formatted);
      
      if (number === 0) return '0';
      if (number < 0.0001) return '< 0.0001';
      
      return number.toFixed(displayDecimals).replace(/\.?0+$/, '');
    } catch (error) {
      debug('bigint-utils', 'Failed to format for display', { value, decimals, displayDecimals, error: error.message });
      return '0';
    }
  }
}

/**
 * Address utility functions
 */
export class AddressUtils {
  /**
   * Validates Ethereum address
   */
  static isValidAddress(address) {
    if (!address || typeof address !== 'string') return false;
    
    try {
      return ethers.isAddress(address);
    } catch (error) {
      debug('address-utils', 'Address validation failed', { address, error: error.message });
      return false;
    }
  }

  /**
   * Checksums an address
   */
  static getChecksumAddress(address) {
    if (!address) return '';
    
    try {
      return ethers.getAddress(address);
    } catch (error) {
      debug('address-utils', 'Failed to checksum address', { address, error: error.message });
      return address;
    }
  }

  /**
   * Truncates address for display
   */
  static truncateAddress(address, startChars = 6, endChars = 4) {
    if (!address || !this.isValidAddress(address)) return '';
    
    if (address.length <= startChars + endChars) return address;
    
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
  }

  /**
   * Checks if address is zero address
   */
  static isZeroAddress(address) {
    if (!address) return true;
    return address.toLowerCase() === DEFAULT_ADDRESSES.ZERO_ADDRESS.toLowerCase();
  }

  /**
   * Checks if two addresses are equal
   */
  static areEqual(address1, address2) {
    if (!address1 || !address2) return false;
    
    try {
      return this.getChecksumAddress(address1) === this.getChecksumAddress(address2);
    } catch (error) {
      debug('address-utils', 'Failed to compare addresses', { address1, address2, error: error.message });
      return false;
    }
  }

  // Legacy methods for backward compatibility
  static isValid(address) {
    return this.isValidAddress(address);
  }

  static format(address, startChars = 6, endChars = 4) {
    return this.truncateAddress(address, startChars, endChars) || 'Invalid Address';
  }

  static normalize(address) {
    return this.isValidAddress(address) ? address.toLowerCase() : '';
  }
}

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
 * Retry utility functions
 */
export class RetryUtils {
  /**
   * Executes function with exponential backoff retry
   */
  static async withExponentialBackoff(
    operation, 
    maxRetries = RETRY_CONFIG.MAX_RETRIES,
    initialDelay = RETRY_CONFIG.INITIAL_DELAY,
    maxDelay = RETRY_CONFIG.MAX_DELAY,
    backoffFactor = RETRY_CONFIG.BACKOFF_FACTOR
  ) {
    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        debug('retry-utils', `Attempt ${attempt + 1}/${maxRetries + 1}`, { delay });
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          debug('retry-utils', 'Max retries reached', { error: error.message });
          throw error;
        }

        // Don't retry certain errors
        if (error.code === 'USER_REJECTED' || error.message?.includes('user rejected')) {
          debug('retry-utils', 'User rejected - not retrying', { error: error.message });
          throw error;
        }

        debug('retry-utils', `Attempt ${attempt + 1} failed, retrying in ${delay}ms`, { error: error.message });
        
        await this.sleep(delay);
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Executes function with fixed delay retry
   */
  static async withFixedDelay(
    operation,
    maxRetries = RETRY_CONFIG.MAX_RETRIES,
    delay = RETRY_CONFIG.INITIAL_DELAY
  ) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        debug('retry-utils', `Fixed delay attempt ${attempt + 1}/${maxRetries + 1}`);
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          debug('retry-utils', 'Max retries reached with fixed delay', { error: error.message });
          throw error;
        }

        // Don't retry certain errors
        if (error.code === 'USER_REJECTED' || error.message?.includes('user rejected')) {
          debug('retry-utils', 'User rejected - not retrying', { error: error.message });
          throw error;
        }

        debug('retry-utils', `Fixed delay attempt ${attempt + 1} failed, retrying in ${delay}ms`, { error: error.message });
        
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

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