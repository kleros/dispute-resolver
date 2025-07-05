/**
 * Tests for Blockchain Utility Functions
 * Demonstrates testing infrastructure and validates utility functions
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ethers } from 'ethers';
import { 
  BigIntUtils, 
  AddressUtils, 
  RetryUtils,
  ValidationUtils 
} from '../../utils/blockchain.js';

// Mock ethers for testing
jest.mock('ethers', () => ({
  formatEther: jest.fn(),
  parseEther: jest.fn(),
  formatUnits: jest.fn(),
  parseUnits: jest.fn(),
  isAddress: jest.fn(),
  getAddress: jest.fn()
}));

describe('BigIntUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatEther', () => {
    test('should format BigInt to ether string', () => {
      const mockValue = 1000000000000000000n; // 1 ETH in wei
      ethers.formatEther.mockReturnValue('1.0');

      const result = BigIntUtils.formatEther(mockValue);

      expect(ethers.formatEther).toHaveBeenCalledWith(mockValue);
      expect(result).toBe('1.0');
    });

    test('should return "0" for null/undefined values', () => {
      expect(BigIntUtils.formatEther(null)).toBe('0');
      expect(BigIntUtils.formatEther(undefined)).toBe('0');
      expect(BigIntUtils.formatEther('')).toBe('0');
    });

    test('should handle errors gracefully', () => {
      ethers.formatEther.mockImplementation(() => {
        throw new Error('Invalid value');
      });

      const result = BigIntUtils.formatEther(123n);
      expect(result).toBe('0');
    });
  });

  describe('parseEther', () => {
    test('should parse ether string to BigInt', () => {
      const mockValue = '1.5';
      const expectedResult = 1500000000000000000n;
      ethers.parseEther.mockReturnValue(expectedResult);

      const result = BigIntUtils.parseEther(mockValue);

      expect(ethers.parseEther).toHaveBeenCalledWith(mockValue);
      expect(result).toBe(expectedResult);
    });

    test('should return 0n for empty/zero values', () => {
      expect(BigIntUtils.parseEther('')).toBe(0n);
      expect(BigIntUtils.parseEther('0')).toBe(0n);
      expect(BigIntUtils.parseEther(null)).toBe(0n);
    });

    test('should handle errors gracefully', () => {
      ethers.parseEther.mockImplementation(() => {
        throw new Error('Invalid value');
      });

      const result = BigIntUtils.parseEther('invalid');
      expect(result).toBe(0n);
    });
  });

  describe('safeAdd', () => {
    test('should add two BigInt values correctly', () => {
      const result = BigIntUtils.safeAdd(100n, 200n);
      expect(result).toBe(300n);
    });

    test('should handle string inputs', () => {
      const result = BigIntUtils.safeAdd('100', '200');
      expect(result).toBe(300n);
    });

    test('should handle errors gracefully', () => {
      const result = BigIntUtils.safeAdd('invalid', 200n);
      expect(result).toBe(0n);
    });
  });

  describe('safeSubtract', () => {
    test('should subtract two BigInt values correctly', () => {
      const result = BigIntUtils.safeSubtract(300n, 100n);
      expect(result).toBe(200n);
    });

    test('should return 0n for negative results', () => {
      const result = BigIntUtils.safeSubtract(100n, 300n);
      expect(result).toBe(0n);
    });

    test('should handle errors gracefully', () => {
      const result = BigIntUtils.safeSubtract('invalid', 100n);
      expect(result).toBe(0n);
    });
  });

  describe('formatForDisplay', () => {
    test('should format BigInt for display with proper decimals', () => {
      ethers.formatUnits.mockReturnValue('1.234567');

      const result = BigIntUtils.formatForDisplay(1234567000000000000n, 18, 4);

      expect(result).toBe('1.2346');
    });

    test('should handle zero values', () => {
      ethers.formatUnits.mockReturnValue('0');

      const result = BigIntUtils.formatForDisplay(0n);

      expect(result).toBe('0');
    });

    test('should handle very small values', () => {
      ethers.formatUnits.mockReturnValue('0.00001');

      const result = BigIntUtils.formatForDisplay(10000000000000n);

      expect(result).toBe('< 0.0001');
    });
  });
});

describe('AddressUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidAddress', () => {
    test('should validate correct Ethereum address', () => {
      const validAddress = '0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9';
      ethers.isAddress.mockReturnValue(true);

      const result = AddressUtils.isValidAddress(validAddress);

      expect(ethers.isAddress).toHaveBeenCalledWith(validAddress);
      expect(result).toBe(true);
    });

    test('should reject invalid addresses', () => {
      ethers.isAddress.mockReturnValue(false);

      expect(AddressUtils.isValidAddress('invalid')).toBe(false);
      expect(AddressUtils.isValidAddress('')).toBe(false);
      expect(AddressUtils.isValidAddress(null)).toBe(false);
    });

    test('should handle errors gracefully', () => {
      ethers.isAddress.mockImplementation(() => {
        throw new Error('Invalid input');
      });

      const result = AddressUtils.isValidAddress('0x123');
      expect(result).toBe(false);
    });
  });

  describe('getChecksumAddress', () => {
    test('should return checksummed address', () => {
      const address = '0x742d35cc6473c4b1d2c4b8c0c8e3b9c2f7b1d8e9';
      const checksummed = '0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9';
      ethers.getAddress.mockReturnValue(checksummed);

      const result = AddressUtils.getChecksumAddress(address);

      expect(ethers.getAddress).toHaveBeenCalledWith(address);
      expect(result).toBe(checksummed);
    });

    test('should return empty string for null/undefined', () => {
      expect(AddressUtils.getChecksumAddress(null)).toBe('');
      expect(AddressUtils.getChecksumAddress(undefined)).toBe('');
    });

    test('should return original address on error', () => {
      const address = 'invalid';
      ethers.getAddress.mockImplementation(() => {
        throw new Error('Invalid address');
      });

      const result = AddressUtils.getChecksumAddress(address);
      expect(result).toBe(address);
    });
  });

  describe('truncateAddress', () => {
    test('should truncate long addresses correctly', () => {
      const address = '0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9';
      ethers.isAddress.mockReturnValue(true);

      const result = AddressUtils.truncateAddress(address, 6, 4);

      expect(result).toBe('0x742d...d8e9');
    });

    test('should return full address if shorter than truncation', () => {
      const address = '0x123456';
      ethers.isAddress.mockReturnValue(true);

      const result = AddressUtils.truncateAddress(address, 6, 4);

      expect(result).toBe(address);
    });

    test('should return empty string for invalid addresses', () => {
      ethers.isAddress.mockReturnValue(false);

      const result = AddressUtils.truncateAddress('invalid');

      expect(result).toBe('');
    });
  });

  describe('areEqual', () => {
    test('should return true for equal addresses', () => {
      const addr1 = '0x742d35cc6473c4b1d2c4b8c0c8e3b9c2f7b1d8e9';
      const addr2 = '0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9';
      const checksummed = '0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9';

      ethers.getAddress.mockReturnValue(checksummed);

      const result = AddressUtils.areEqual(addr1, addr2);

      expect(result).toBe(true);
    });

    test('should return false for different addresses', () => {
      const addr1 = '0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9';
      const addr2 = '0x123456789012345678901234567890123456789a';

      ethers.getAddress
        .mockReturnValueOnce(addr1)
        .mockReturnValueOnce(addr2);

      const result = AddressUtils.areEqual(addr1, addr2);

      expect(result).toBe(false);
    });

    test('should return false for null/undefined addresses', () => {
      expect(AddressUtils.areEqual(null, '0x123')).toBe(false);
      expect(AddressUtils.areEqual('0x123', null)).toBe(false);
      expect(AddressUtils.areEqual(null, null)).toBe(false);
    });
  });
});

describe('RetryUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withExponentialBackoff', () => {
    test('should succeed on first attempt', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const promise = RetryUtils.withExponentialBackoff(mockOperation, 3, 100, 1000, 2);
      const result = await promise;

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(result).toBe('success');
    });

    test('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue('success');

      const promise = RetryUtils.withExponentialBackoff(mockOperation, 3, 100, 1000, 2);

      // Fast-forward through the delays
      setTimeout(() => {
        jest.advanceTimersByTime(100);
        setTimeout(() => {
          jest.advanceTimersByTime(200);
        }, 0);
      }, 0);

      const result = await promise;

      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(result).toBe('success');
    });

    test('should throw error after max retries', async () => {
      const mockError = new Error('Persistent failure');
      const mockOperation = jest.fn().mockRejectedValue(mockError);

      const promise = RetryUtils.withExponentialBackoff(mockOperation, 2, 100, 1000, 2);

      // Fast-forward through the delays
      setTimeout(() => {
        jest.advanceTimersByTime(100);
        setTimeout(() => {
          jest.advanceTimersByTime(200);
        }, 0);
      }, 0);

      await expect(promise).rejects.toThrow('Persistent failure');
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should not retry user rejected errors', async () => {
      const mockError = new Error('user rejected transaction');
      const mockOperation = jest.fn().mockRejectedValue(mockError);

      const promise = RetryUtils.withExponentialBackoff(mockOperation, 3, 100, 1000, 2);

      await expect(promise).rejects.toThrow('user rejected transaction');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('sleep', () => {
    test('should resolve after specified time', async () => {
      const promise = RetryUtils.sleep(1000);

      jest.advanceTimersByTime(1000);

      await expect(promise).resolves.toBeUndefined();
    });
  });
});

describe('ValidationUtils', () => {
  describe('validateDisputeTitle', () => {
    test('should validate correct title', () => {
      const result = ValidationUtils.validateDisputeTitle('Valid Dispute Title');

      expect(result.isValid).toBe(true);
      expect(result.value).toBe('Valid Dispute Title');
    });

    test('should reject empty title', () => {
      const result = ValidationUtils.validateDisputeTitle('');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Title is required');
    });

    test('should reject title that is too short', () => {
      const result = ValidationUtils.validateDisputeTitle('Short');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be at least');
    });

    test('should reject title that is too long', () => {
      const longTitle = 'a'.repeat(101);
      const result = ValidationUtils.validateDisputeTitle(longTitle);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be no more than');
    });

    test('should trim whitespace', () => {
      const result = ValidationUtils.validateDisputeTitle('  Valid Title  ');

      expect(result.isValid).toBe(true);
      expect(result.value).toBe('Valid Title');
    });
  });

  describe('validateAmount', () => {
    test('should validate correct amount', () => {
      const result = ValidationUtils.validateAmount('1.5', 0, 10);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(1.5);
    });

    test('should reject negative amounts', () => {
      const result = ValidationUtils.validateAmount('-1');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Amount cannot be negative');
    });

    test('should reject amounts below minimum', () => {
      const result = ValidationUtils.validateAmount('0.5', 1, 10);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Amount must be at least 1');
    });

    test('should reject amounts above maximum', () => {
      const result = ValidationUtils.validateAmount('15', 0, 10);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Amount must be no more than 10');
    });

    test('should reject non-numeric values', () => {
      const result = ValidationUtils.validateAmount('not a number');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Amount must be a valid number');
    });
  });

  describe('validateRulingOptions', () => {
    test('should validate correct ruling options', () => {
      const options = ['Option 1', 'Option 2', 'Option 3'];
      const result = ValidationUtils.validateRulingOptions(options);

      expect(result.isValid).toBe(true);
      expect(result.value).toEqual(options);
    });

    test('should reject non-array input', () => {
      const result = ValidationUtils.validateRulingOptions('not an array');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Ruling options must be an array');
    });

    test('should reject too few options', () => {
      const result = ValidationUtils.validateRulingOptions(['Only one']);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('at least');
    });

    test('should reject too many options', () => {
      const manyOptions = Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`);
      const result = ValidationUtils.validateRulingOptions(manyOptions);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('no more than');
    });

    test('should reject duplicate options', () => {
      const options = ['Option 1', 'Option 2', 'Option 1'];
      const result = ValidationUtils.validateRulingOptions(options);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('duplicate');
    });

    test('should trim whitespace from options', () => {
      const options = ['  Option 1  ', '  Option 2  '];
      const result = ValidationUtils.validateRulingOptions(options);

      expect(result.isValid).toBe(true);
      expect(result.value).toEqual(['Option 1', 'Option 2']);
    });
  });
});

describe('Integration Tests', () => {
  test('should work together for dispute creation validation', () => {
    // Mock ethers functions
    ethers.isAddress.mockReturnValue(true);
    ethers.getAddress.mockReturnValue('0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9');

    const disputeData = {
      title: 'Test Dispute Title',
      description: 'This is a test dispute description that is long enough to pass validation requirements.',
      question: 'What is the correct answer?',
      rulingOptions: ['Option A', 'Option B', 'Option C'],
      arbitratorAddress: '0x742d35cc6473c4b1d2c4b8c0c8e3b9c2f7b1d8e9'
    };

    const titleResult = ValidationUtils.validateDisputeTitle(disputeData.title);
    const descResult = ValidationUtils.validateDescription(disputeData.description);
    const questionResult = ValidationUtils.validateQuestion(disputeData.question);
    const optionsResult = ValidationUtils.validateRulingOptions(disputeData.rulingOptions);
    const addressResult = AddressUtils.isValidAddress(disputeData.arbitratorAddress);

    expect(titleResult.isValid).toBe(true);
    expect(descResult.isValid).toBe(true);
    expect(questionResult.isValid).toBe(true);
    expect(optionsResult.isValid).toBe(true);
    expect(addressResult).toBe(true);
  });

  test('should handle BigInt operations in dispute calculations', () => {
    const contributionAmount = 1000000000000000000n; // 1 ETH
    const totalRequired = 3000000000000000000n; // 3 ETH

    const remaining = BigIntUtils.safeSubtract(totalRequired, contributionAmount);
    const percentage = BigIntUtils.calculatePercentage(contributionAmount, 33.33);

    expect(remaining).toBe(2000000000000000000n); // 2 ETH
    expect(percentage).toBeGreaterThan(0n);
  });
});