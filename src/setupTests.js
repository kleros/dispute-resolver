/**
 * Jest Setup File
 * Configures global test environment and utilities
 */

import '@testing-library/jest-dom';

// Mock Web3 globals that might not be available in test environment
global.BigInt = global.BigInt || function(value) {
  return parseInt(value);
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.sessionStorage = sessionStorageMock;

// Mock window.location
delete window.location;
window.location = {
  href: 'http://localhost:3000',
  origin: 'http://localhost:3000',
  protocol: 'http:',
  host: 'localhost:3000',
  hostname: 'localhost',
  port: '3000',
  pathname: '/',
  search: '',
  hash: '',
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn(),
};

// Mock window.ethereum (MetaMask)
global.window.ethereum = {
  isMetaMask: true,
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  selectedAddress: null,
  chainId: '0x1',
  networkVersion: '1',
};

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
  jest.clearAllMocks();
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// Mock fetch
global.fetch = jest.fn();

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock File and FileReader
global.File = class MockFile {
  constructor(parts, filename, properties) {
    this.name = filename;
    this.size = parts.reduce((acc, part) => acc + part.length, 0);
    this.type = properties?.type || '';
  }
};

global.FileReader = class MockFileReader {
  constructor() {
    this.readAsDataURL = jest.fn();
    this.readAsText = jest.fn();
    this.result = null;
    this.onload = null;
    this.onerror = null;
  }
};

// Test utilities
export const createMockFile = (name = 'test.txt', size = 1024, type = 'text/plain') => {
  const content = 'x'.repeat(size);
  return new File([content], name, { type });
};

export const createMockEvent = (eventType, eventData = {}) => {
  return {
    type: eventType,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target: { value: '', ...eventData.target },
    ...eventData
  };
};

export const createMockProvider = () => ({
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  getSigner: jest.fn(() => ({
    getAddress: jest.fn().mockResolvedValue('0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9'),
    signMessage: jest.fn(),
    sendTransaction: jest.fn()
  })),
  getNetwork: jest.fn().mockResolvedValue({ chainId: 1, name: 'mainnet' }),
  getBlockNumber: jest.fn().mockResolvedValue(12345678),
  getBalance: jest.fn().mockResolvedValue('1000000000000000000'), // 1 ETH
  getTransactionReceipt: jest.fn(),
  waitForTransaction: jest.fn()
});

export const createMockContract = () => ({
  interface: {
    getEvent: jest.fn().mockReturnValue({ topicHash: '0x123' })
  },
  filters: {
    DisputeCreation: jest.fn(),
    Evidence: jest.fn(),
    Contribution: jest.fn()
  },
  queryFilter: jest.fn().mockResolvedValue([]),
  createDispute: jest.fn(),
  submitEvidence: jest.fn(),
  fundAppeal: jest.fn(),
  getSubcourt: jest.fn(),
  arbitrationCost: jest.fn(),
  currentRuling: jest.fn(),
  appealCost: jest.fn(),
  estimateGas: jest.fn().mockResolvedValue(200000)
});

// Global test constants
export const TEST_ADDRESSES = {
  VALID: '0x742d35Cc6473C4b1d2c4b8c0c8e3b9c2f7b1d8e9',
  INVALID: 'invalid-address',
  ZERO: '0x0000000000000000000000000000000000000000'
};

export const TEST_DISPUTE_DATA = {
  title: 'Test Dispute Title',
  description: 'This is a test dispute description that meets the minimum length requirements for validation.',
  question: 'What is the correct answer to this test question?',
  rulingOptions: ['Option A', 'Option B', 'Option C'],
  category: 'General',
  subcourt: 0,
  jurors: 3
};

// Suppress specific console warnings in tests
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (
      args[0].includes('Warning: ReactDOM.render is deprecated') ||
      args[0].includes('Warning: componentWillReceiveProps') ||
      args[0].includes('Warning: componentWillMount')
    )
  ) {
    return;
  }
  originalConsoleWarn.call(console, ...args);
};