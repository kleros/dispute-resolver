/**
 * Centralized UI constants
 * Replaces magic numbers and hardcoded values in UI components
 */

export const UI_CONSTANTS = {
  // File upload constraints
  FILE_UPLOAD: {
    MAX_SIZE_BYTES: 4 * 1024 * 1024, // 4MB
    MAX_SIZE_MB: 4,
    ALLOWED_TYPES: [
      'image/*',
      'application/pdf',
      'text/*',
      'video/*'
    ],
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt', '.md', '.mp4', '.webm']
  },

  // Form validation rules
  VALIDATION: {
    MIN_JURORS: 1,
    MAX_JURORS: 32,
    MAX_RULING_OPTIONS: 32,
    MIN_RULING_OPTIONS: 2,
    
    // Input length limits
    TITLE_MAX_LENGTH: 200,
    DESCRIPTION_MAX_LENGTH: 5000,
    CATEGORY_MAX_LENGTH: 100,
    QUESTION_MAX_LENGTH: 1000,
    EVIDENCE_TITLE_MAX_LENGTH: 100,
    EVIDENCE_DESCRIPTION_MAX_LENGTH: 2000,
    
    // Address validation
    ADDRESS_PATTERN: /^0x[a-fA-F0-9]{40}$/,
    
    // Question types
    QUESTION_TYPES: {
      SINGLE_SELECT: 'single-select',
      MULTIPLE_SELECT: 'multiple-select',
      UINT: 'uint',
      INT: 'int',
      STRING: 'string',
      DATETIME: 'datetime',
      HASH: 'hash'
    }
  },

  // Timing constants
  TIMEOUTS: {
    DEBOUNCE_SEARCH: 750,
    DEBOUNCE_INPUT: 300,
    API_TIMEOUT: 30000,
    CACHE_CHECK_INTERVAL: 60000,
    NOTIFICATION_DURATION: 5000,
    RETRY_DELAY: 2000
  },

  // UI Layout constants
  LAYOUT: {
    SIDEBAR_WIDTH: 250,
    HEADER_HEIGHT: 80,
    FOOTER_HEIGHT: 120,
    CARD_PADDING: 24,
    GRID_GUTTER: 16,
    
    // Responsive breakpoints
    BREAKPOINTS: {
      XS: 576,
      SM: 768,
      MD: 992,
      LG: 1200,
      XL: 1400
    }
  },

  // Animation and transition constants
  ANIMATION: {
    DURATION_FAST: 150,
    DURATION_NORMAL: 300,
    DURATION_SLOW: 500,
    
    EASING: {
      EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
      EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
      EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }
  },

  // Color scheme
  COLORS: {
    PRIMARY: '#4d00b4',
    SECONDARY: '#009aff',
    SUCCESS: '#00c42b',
    WARNING: '#ff9900',
    ERROR: '#f60c36',
    INFO: '#009aff',
    
    // Status colors for disputes
    STATUS_COLORS: {
      EVIDENCE: '#00c42b',
      COMMIT: '#009aff',
      VOTING: '#009aff',
      APPEAL: '#f60c36',
      EXECUTION: '#6c6c6c'
    }
  },

  // Pagination and list settings
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    LOAD_MORE_INCREMENT: 10
  },

  // Error messages
  ERROR_MESSAGES: {
    NETWORK_ERROR: 'Network connection issue. Please try again.',
    CONTRACT_ERROR: 'Blockchain interaction failed. Please check your wallet.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    FILE_TOO_LARGE: 'File is too large. Maximum size is 4MB.',
    INVALID_ADDRESS: 'Please enter a valid Ethereum address.',
    REQUIRED_FIELD: 'This field is required.',
    METAMASK_NOT_FOUND: 'MetaMask not detected. Please install MetaMask to continue.',
    UNSUPPORTED_NETWORK: 'This network is not supported. Please switch to a supported network.'
  },

  // Success messages
  SUCCESS_MESSAGES: {
    DISPUTE_CREATED: 'Dispute created successfully!',
    EVIDENCE_SUBMITTED: 'Evidence submitted successfully!',
    APPEAL_FUNDED: 'Appeal funded successfully!',
    TRANSACTION_CONFIRMED: 'Transaction confirmed!',
    FILE_UPLOADED: 'File uploaded successfully!'
  },

  // Loading states
  LOADING_MESSAGES: {
    CREATING_DISPUTE: 'Creating dispute...',
    SUBMITTING_EVIDENCE: 'Submitting evidence...',
    FUNDING_APPEAL: 'Funding appeal...',
    LOADING_DISPUTES: 'Loading disputes...',
    CONNECTING_WALLET: 'Connecting wallet...',
    UPLOADING_FILE: 'Uploading file...'
  }
};

// Question type configurations
export const QUESTION_TYPE_CONFIG = {
  [UI_CONSTANTS.VALIDATION.QUESTION_TYPES.SINGLE_SELECT]: {
    code: 'single-select',
    humanReadable: 'Multiple choice: single select',
    allowsCustomOptions: false,
    requiresOptions: true
  },
  [UI_CONSTANTS.VALIDATION.QUESTION_TYPES.MULTIPLE_SELECT]: {
    code: 'multiple-select',
    humanReadable: 'Multiple choice: multiple select',
    allowsCustomOptions: false,
    requiresOptions: true
  },
  [UI_CONSTANTS.VALIDATION.QUESTION_TYPES.UINT]: {
    code: 'uint',
    humanReadable: 'Non-negative number',
    allowsCustomOptions: true,
    requiresOptions: false
  },
  [UI_CONSTANTS.VALIDATION.QUESTION_TYPES.DATETIME]: {
    code: 'datetime',
    humanReadable: 'Date',
    allowsCustomOptions: true,
    requiresOptions: false
  },
  [UI_CONSTANTS.VALIDATION.QUESTION_TYPES.HASH]: {
    code: 'hash',
    humanReadable: 'Hash',
    allowsCustomOptions: true,
    requiresOptions: false
  }
};

// Form validation rules
export const VALIDATION_RULES = {
  TITLE: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 200
  },
  DESCRIPTION: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 5000
  },
  JURORS: {
    MIN_COUNT: 1,
    MAX_COUNT: 32
  },
  RULING_OPTIONS: {
    MIN_COUNT: 2,
    MAX_COUNT: 32
  },
  ADDRESS_PATTERN: /^0x[a-fA-F0-9]{40}$/,
  ETHEREUM_ADDRESS_LENGTH: 42
};

// Debounce and timeout values
export const TIMEOUTS = {
  DEBOUNCE_SEARCH: 750,
  DEBOUNCE_INPUT: 300,
  API_TIMEOUT: 30000,
  CACHE_CHECK_INTERVAL: 60000,
  TOAST_DURATION: 5000
};

// Question types for dispute creation
export const QUESTION_TYPES = Object.freeze({
  SINGLE_SELECT: { code: "single-select", humanReadable: "Multiple choice: single select" },
  MULTIPLE_SELECT: { code: "multiple-select", humanReadable: "Multiple choice: multiple select" },
  UINT: { code: "uint", humanReadable: "Non-negative number" },
  DATETIME: { code: "datetime", humanReadable: "Date" },
  HASH: { code: "hash", humanReadable: "Hash value" }
});

// Display formatting
export const FORMATTING = {
  ADDRESS_TRUNCATION: {
    START_CHARS: 6,
    END_CHARS: 4
  },
  DECIMAL_PLACES: {
    PERCENTAGE: 2,
    CURRENCY: 4,
    TOKEN: 6
  },
  MAX_DISPLAY_LENGTH: {
    TITLE: 100,
    DESCRIPTION: 500,
    EVIDENCE_TITLE: 150
  }
};

// Component states
export const COMPONENT_STATES = {
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  IDLE: 'idle'
};

// Modal and overlay settings
export const MODAL_SETTINGS = {
  BACKDROP_CLOSE: true,
  KEYBOARD_CLOSE: true,
  FOCUS_TRAP: true
};

// Notification types
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};