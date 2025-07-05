/**
 * Error Handler Utility
 * Centralized error handling, logging, and user feedback
 */

import { ERROR_CODES, TRANSACTION_TYPES } from '../constants/blockchain.js';
import { MESSAGES } from '../constants/ui.js';

// Error tracking for debugging
let errorCounter = 0;
const errorLog = [];

/**
 * Generates a unique error ID for tracking
 */
function generateErrorId() {
  return `ERR-${Date.now()}-${++errorCounter}`;
}

/**
 * Logs error with context for debugging
 */
export function logError(error, context = {}) {
  const errorId = generateErrorId();
  const timestamp = new Date().toISOString();
  
  const errorEntry = {
    id: errorId,
    timestamp,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context,
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  errorLog.push(errorEntry);
  
  // Keep only last 100 errors to prevent memory issues
  if (errorLog.length > 100) {
    errorLog.shift();
  }

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${errorId}] Error:`, error);
    console.error(`[${errorId}] Context:`, context);
  }

  return errorId;
}

/**
 * Debug logging utility
 */
export function debug(category, message, data = {}) {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[${category}] ${message}`, data);
  }
}

/**
 * Determines error code from error object
 */
function getErrorCode(error) {
  if (!error) return ERROR_CODES.UNKNOWN_ERROR;

  // Check for specific error patterns
  if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
    return ERROR_CODES.NETWORK_ERROR;
  }
  
  if (error.code === 'INSUFFICIENT_FUNDS' || error.message?.includes('insufficient funds')) {
    return ERROR_CODES.INSUFFICIENT_FUNDS;
  }
  
  if (error.code === 'USER_REJECTED' || error.message?.includes('user rejected')) {
    return ERROR_CODES.USER_REJECTED;
  }
  
  if (error.code === 'TIMEOUT' || error.message?.includes('timeout')) {
    return ERROR_CODES.TIMEOUT;
  }
  
  if (error.code === 'INVALID_ARGUMENT' || error.message?.includes('invalid argument')) {
    return ERROR_CODES.INVALID_PARAMETERS;
  }
  
  // Check for contract-specific errors
  if (error.message?.includes('execution reverted') || error.message?.includes('contract')) {
    return ERROR_CODES.CONTRACT_ERROR;
  }
  
  return ERROR_CODES.UNKNOWN_ERROR;
}

/**
 * Gets user-friendly error message
 */
function getUserMessage(errorCode, context = {}) {
  const messages = {
    [ERROR_CODES.NETWORK_ERROR]: 'Network connection issue. Please check your internet connection and try again.',
    [ERROR_CODES.CONTRACT_ERROR]: 'Blockchain transaction failed. Please check your wallet and try again.',
    [ERROR_CODES.INSUFFICIENT_FUNDS]: 'Insufficient funds to complete this transaction. Please add more funds to your wallet.',
    [ERROR_CODES.USER_REJECTED]: 'Transaction was cancelled. Please try again if you want to proceed.',
    [ERROR_CODES.TIMEOUT]: 'Request timed out. Please try again.',
    [ERROR_CODES.INVALID_PARAMETERS]: 'Invalid input parameters. Please check your inputs and try again.',
    [ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.'
  };

  let message = messages[errorCode] || messages[ERROR_CODES.UNKNOWN_ERROR];
  
  // Add context-specific information
  if (context.transactionType) {
    const transactionMessages = {
      [TRANSACTION_TYPES.CREATE_DISPUTE]: 'Failed to create dispute.',
      [TRANSACTION_TYPES.SUBMIT_EVIDENCE]: 'Failed to submit evidence.',
      [TRANSACTION_TYPES.FUND_APPEAL]: 'Failed to fund appeal.',
      [TRANSACTION_TYPES.WITHDRAW_REWARDS]: 'Failed to withdraw rewards.'
    };
    
    const transactionMessage = transactionMessages[context.transactionType];
    if (transactionMessage) {
      message = `${transactionMessage} ${message}`;
    }
  }

  return message;
}

/**
 * Handles contract-specific errors
 */
export function handleContractError(error, contractName, methodName, parameters = {}) {
  const errorId = logError(error, {
    type: 'contract-error',
    contractName,
    methodName,
    parameters
  });

  const errorCode = getErrorCode(error);
  const userMessage = getUserMessage(errorCode, { transactionType: TRANSACTION_TYPES.GENERAL_CONTRACT_CALL });

  const enhancedError = new Error(userMessage);
  enhancedError.code = errorCode;
  enhancedError.errorId = errorId;
  enhancedError.originalError = error;
  enhancedError.contractName = contractName;
  enhancedError.methodName = methodName;

  return enhancedError;
}

/**
 * Handles network-specific errors
 */
export function handleNetworkError(error, operation = 'network-operation') {
  const errorId = logError(error, {
    type: 'network-error',
    operation
  });

  const errorCode = ERROR_CODES.NETWORK_ERROR;
  const userMessage = getUserMessage(errorCode);

  const enhancedError = new Error(userMessage);
  enhancedError.code = errorCode;
  enhancedError.errorId = errorId;
  enhancedError.originalError = error;

  return enhancedError;
}

/**
 * Handles user-facing errors with friendly messages
 */
export function handleUserError(error, context = '', fallbackMessage = MESSAGES.ERROR_GENERIC) {
  const errorId = logError(error, {
    type: 'user-error',
    context
  });

  const errorCode = getErrorCode(error);
  const userMessage = getUserMessage(errorCode) || fallbackMessage;

  const enhancedError = new Error(userMessage);
  enhancedError.code = errorCode;
  enhancedError.errorId = errorId;
  enhancedError.originalError = error;

  return enhancedError;
}

/**
 * Handles validation errors
 */
export function handleValidationError(field, message, value = null) {
  const error = new Error(message);
  const errorId = logError(error, {
    type: 'validation-error',
    field,
    value
  });

  error.code = ERROR_CODES.INVALID_PARAMETERS;
  error.errorId = errorId;
  error.field = field;

  return error;
}

/**
 * React Error Boundary component
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const errorId = logError(error, {
      type: 'react-error-boundary',
      errorInfo,
      componentStack: errorInfo.componentStack
    });

    this.setState({ errorId });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. Please refresh the page and try again.</p>
          {this.state.errorId && (
            <p className="error-id">Error ID: {this.state.errorId}</p>
          )}
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Gets error log for debugging
 */
export function getErrorLog() {
  return [...errorLog];
}

/**
 * Clears error log
 */
export function clearErrorLog() {
  errorLog.length = 0;
  errorCounter = 0;
}

/**
 * Exports error log as JSON for support
 */
export function exportErrorLog() {
  const exportData = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    errors: errorLog
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error-log-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Checks if error is retryable
 */
export function isRetryableError(error) {
  const retryableCodes = [
    ERROR_CODES.NETWORK_ERROR,
    ERROR_CODES.TIMEOUT
  ];

  return retryableCodes.includes(error.code || getErrorCode(error));
}

/**
 * Formats error for display
 */
export function formatErrorForDisplay(error) {
  if (!error) return 'Unknown error';

  // If it's already a handled error, return the message
  if (error.errorId) {
    return error.message;
  }

  // Otherwise, handle it and return the formatted message
  const handledError = handleUserError(error);
  return handledError.message;
}

/**
 * Creates a notification-friendly error object
 */
export function createNotificationError(error, title = 'Error') {
  const errorCode = getErrorCode(error);
  const message = getUserMessage(errorCode);

  return {
    type: 'error',
    title,
    message,
    errorId: error.errorId,
    timestamp: Date.now()
  };
}

// Export React if available (for ErrorBoundary)
let React;
try {
  React = require('react');
} catch (e) {
  // React not available, ErrorBoundary won't work but other functions will
}