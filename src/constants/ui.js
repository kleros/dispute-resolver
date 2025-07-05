/**
 * UI Constants
 * Centralized configuration for UI components and user interactions
 */

// File upload constraints
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  MIME_TYPE_EXTENSIONS: {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'text/plain': '.txt',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
  }
};

// Form validation rules
export const VALIDATION_RULES = {
  DISPUTE_TITLE: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 100,
    PATTERN: /^[a-zA-Z0-9\s\-_.,!?()]+$/
  },
  DESCRIPTION: {
    MIN_LENGTH: 50,
    MAX_LENGTH: 5000
  },
  QUESTION: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 500
  },
  RULING_OPTIONS: {
    MIN_COUNT: 2,
    MAX_COUNT: 10,
    MIN_OPTION_LENGTH: 3,
    MAX_OPTION_LENGTH: 100
  },
  EVIDENCE_TITLE: {
    MIN_LENGTH: 5,
    MAX_LENGTH: 200
  },
  EVIDENCE_DESCRIPTION: {
    MIN_LENGTH: 20,
    MAX_LENGTH: 2000
  },
  ETHEREUM_ADDRESS: {
    PATTERN: /^0x[a-fA-F0-9]{40}$/,
    LENGTH: 42
  },
  AMOUNT: {
    MIN: 0,
    MAX: 1000000,
    DECIMAL_PLACES: 18
  }
};

// UI timeout values (in milliseconds)
export const UI_TIMEOUTS = {
  NOTIFICATION_DURATION: 5000, // 5 seconds
  LOADING_SPINNER_DELAY: 500, // 0.5 seconds
  DEBOUNCE_DELAY: 300, // 0.3 seconds
  TOOLTIP_DELAY: 1000, // 1 second
  MODAL_ANIMATION: 300, // 0.3 seconds
  FORM_SUBMISSION_TIMEOUT: 60000, // 1 minute
  AUTO_REFRESH_INTERVAL: 30000 // 30 seconds
};

// Pagination settings
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [5, 10, 20, 50],
  MAX_VISIBLE_PAGES: 5
};

// Table sorting options
export const SORTING = {
  DEFAULT_DIRECTION: 'desc',
  DIRECTIONS: ['asc', 'desc']
};

// Question types for dispute creation
export const QUESTION_TYPES = {
  SINGLE_SELECT: 'single-select',
  MULTIPLE_SELECT: 'multiple-select',
  BINARY: 'binary'
};

// Dispute categories
export const DISPUTE_CATEGORIES = {
  GENERAL: 'General',
  CONTENT_MODERATION: 'Content Moderation',
  TRADEMARK: 'Trademark',
  COPYRIGHT: 'Copyright',
  ORACLE: 'Oracle',
  CURATION: 'Curation',
  INSURANCE: 'Insurance',
  ESCROW: 'Escrow',
  OTHER: 'Other'
};

// Status indicators
export const STATUS_COLORS = {
  PENDING: '#fbbf24', // yellow
  ACTIVE: '#10b981', // green
  RESOLVED: '#6b7280', // gray
  APPEALED: '#f59e0b', // amber
  ERROR: '#ef4444', // red
  WARNING: '#f97316', // orange
  INFO: '#3b82f6' // blue
};

// Icon mappings
export const ICONS = {
  DISPUTE: '⚖️',
  EVIDENCE: '📄',
  APPEAL: '📢',
  RULING: '🏛️',
  WALLET: '💳',
  NETWORK: '🌐',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  LOADING: '⏳',
  COPY: '📋',
  EXTERNAL_LINK: '🔗'
};

// Responsive breakpoints
export const BREAKPOINTS = {
  MOBILE: '768px',
  TABLET: '1024px',
  DESKTOP: '1280px',
  LARGE_DESKTOP: '1536px'
};

// Z-index layers
export const Z_INDEX = {
  MODAL: 1000,
  DROPDOWN: 100,
  TOOLTIP: 200,
  NOTIFICATION: 300,
  LOADING_OVERLAY: 400
};

// Animation durations
export const ANIMATIONS = {
  FAST: '150ms',
  NORMAL: '300ms',
  SLOW: '500ms'
};

// Color palette
export const COLORS = {
  PRIMARY: '#6366f1', // indigo
  SECONDARY: '#8b5cf6', // violet
  SUCCESS: '#10b981', // emerald
  WARNING: '#f59e0b', // amber
  ERROR: '#ef4444', // red
  INFO: '#3b82f6', // blue
  GRAY: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827'
  }
};

// Common messages
export const MESSAGES = {
  LOADING: 'Loading...',
  NO_DATA: 'No data available',
  ERROR_GENERIC: 'An error occurred. Please try again.',
  SUCCESS_GENERIC: 'Operation completed successfully',
  WALLET_NOT_CONNECTED: 'Please connect your wallet',
  NETWORK_NOT_SUPPORTED: 'Network not supported',
  TRANSACTION_PENDING: 'Transaction pending...',
  TRANSACTION_CONFIRMED: 'Transaction confirmed',
  TRANSACTION_FAILED: 'Transaction failed',
  FORM_VALIDATION_ERROR: 'Please fix the errors below',
  UNSAVED_CHANGES: 'You have unsaved changes. Are you sure you want to leave?'
};

// Form field types
export const FORM_FIELD_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  SELECT: 'select',
  MULTI_SELECT: 'multi-select',
  FILE: 'file',
  NUMBER: 'number',
  EMAIL: 'email',
  URL: 'url',
  CHECKBOX: 'checkbox',
  RADIO: 'radio'
};

// Local storage keys
export const STORAGE_KEYS = {
  WALLET_PREFERENCE: 'wallet-preference',
  NETWORK_PREFERENCE: 'network-preference',
  THEME_PREFERENCE: 'theme-preference',
  LANGUAGE_PREFERENCE: 'language-preference',
  CACHE_PREFIX: 'dispute-resolver-cache-',
  FORM_DRAFTS: 'form-drafts',
  USER_SETTINGS: 'user-settings'
};

// Modal types
export const MODAL_TYPES = {
  CONFIRM: 'confirm',
  ALERT: 'alert',
  FORM: 'form',
  INFO: 'info',
  LOADING: 'loading'
};

// Table column types
export const TABLE_COLUMN_TYPES = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  STATUS: 'status',
  ACTION: 'action',
  LINK: 'link',
  BADGE: 'badge'
};

// Navigation paths
export const ROUTES = {
  HOME: '/',
  CREATE_DISPUTE: '/create',
  DISPUTE_DETAILS: '/dispute/:id',
  EVIDENCE: '/evidence/:id',
  APPEALS: '/appeals/:id',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  HELP: '/help'
};

// Feature flags
export const FEATURES = {
  DARK_MODE: true,
  NOTIFICATIONS: true,
  ANALYTICS: false,
  BETA_FEATURES: false,
  MULTI_LANGUAGE: false
};