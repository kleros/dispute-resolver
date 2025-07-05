/**
 * Centralized Error Handling System
 * Replaces scattered console.error/console.warn calls
 * Provides structured logging, user notifications, and error tracking
 */

/**
 * Generates unique error IDs for tracking
 */
const generateErrorId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Main error handler class
 * Replaces inconsistent console.error calls throughout the app
 */
export class ErrorHandler {
  /**
   * Logs error with structured format and metadata
   * @param {Error|string} error - The error to log
   * @param {string} context - Context where error occurred
   * @param {object} metadata - Additional debugging information
   * @returns {string} Unique error ID for tracking
   */
  static logError(error, context, metadata = {}) {
    const errorId = generateErrorId();
    const timestamp = new Date().toISOString();
    
    const errorData = {
      id: errorId,
      timestamp,
      context,
      metadata,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'Unknown'
    };

    // Extract error details
    if (error instanceof Error) {
      errorData.message = error.message;
      errorData.stack = error.stack;
      errorData.name = error.name;
    } else {
      errorData.message = String(error);
    }

    // Console logging with structured format
    console.group(`🚨 Error [${errorId}] in ${context}`);
    console.error('Message:', error.message || error);
    console.error('Context:', context);
    if (Object.keys(metadata).length > 0) {
      console.error('Metadata:', metadata);
    }
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
    console.groupEnd();

    // Report to external monitoring service (if available)
    this.reportToMonitoring(errorData);

    return errorId;
  }

  /**
   * Handles user-facing errors with notifications
   * @param {Error|string} error - The error that occurred
   * @param {string} context - Context where error occurred
   * @param {string} userMessage - User-friendly message to display
   * @param {object} metadata - Additional debugging information
   * @returns {object} Error result with ID
   */
  static handleUserError(error, context, userMessage, metadata = {}) {
    const errorId = this.logError(error, context, metadata);
    
    // Show user notification
    this.showUserNotification(userMessage, 'error', errorId);
    
    return {
      success: false,
      errorId,
      userMessage
    };
  }

  /**
   * Logs warnings with structured format
   * @param {string} message - Warning message
   * @param {string} context - Context where warning occurred
   * @param {object} metadata - Additional information
   * @returns {string} Warning ID
   */
  static logWarning(message, context, metadata = {}) {
    const warningId = generateErrorId();
    
    console.warn(`⚠️ Warning [${warningId}]:`, message, metadata);
    
    // Report warning to monitoring
    this.reportWarningToMonitoring({
      id: warningId,
      message,
      context,
      metadata,
      timestamp: new Date().toISOString()
    });
    
    return warningId;
  }

  /**
   * Debug logging with conditional output
   * @param {string} context - Debug context
   * @param {string} message - Debug message
   * @param {object} metadata - Debug data
   */
  static debug(context, message, metadata = {}) {
    if (process.env.NODE_ENV === 'development' || process.env.REACT_APP_DEBUG === 'true') {
      console.debug(`🔍 Debug [${context}]:`, message, metadata);
    }
  }

  /**
   * Handles contract interaction errors specifically
   * @param {Error} error - Contract error
   * @param {string} contractName - Name of contract
   * @param {string} methodName - Contract method that failed
   * @param {object} params - Parameters passed to method
   * @returns {object} Structured error result
   */
  static handleContractError(error, contractName, methodName, params = {}) {
    const context = `${contractName}.${methodName}`;
    const userMessage = this.getContractErrorMessage(error, methodName);
    
    return this.handleUserError(error, context, userMessage, {
      contractName,
      methodName,
      params,
      isContractError: true
    });
  }

  /**
   * Handles network-related errors
   * @param {Error} error - Network error
   * @param {string} operation - What operation was being performed
   * @param {string} network - Network ID
   * @returns {object} Structured error result
   */
  static handleNetworkError(error, operation, network) {
    const context = `network-${network}`;
    const userMessage = 'Network connection issue. Please check your internet connection and try again.';
    
    return this.handleUserError(error, context, userMessage, {
      operation,
      network,
      isNetworkError: true
    });
  }

  /**
   * Shows user notification (to be implemented based on UI framework)
   * @param {string} message - Message to show
   * @param {string} type - Notification type (error, warning, success, info)
   * @param {string} errorId - Error ID for reference
   */
  static showUserNotification(message, type = 'info', errorId = null) {
    // This would integrate with your notification system
    // For now, just log to console
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`📢 User Notification [${type.toUpperCase()}]:`, message);
    
    if (errorId) {
      console.log(`Error ID for support: ${errorId}`);
    }
    
    // TODO: Integrate with actual notification system (react-toastify, antd notifications, etc.)
  }

  /**
   * Reports error to external monitoring service
   * @param {object} errorData - Structured error data
   */
  static reportToMonitoring(errorData) {
    try {
      // TODO: Integrate with monitoring service (Sentry, LogRocket, etc.)
      console.debug('Error reported to service:', errorData.id);
    } catch (reportError) {
      console.warn('Failed to report error to service:', reportError);
    }
  }

  /**
   * Reports warning to monitoring service
   * @param {object} warningData - Structured warning data
   */
  static reportWarningToMonitoring(warningData) {
    try {
      // TODO: Integrate with monitoring service
      console.debug('Warning reported to service:', warningData.id);
    } catch (reportError) {
      console.warn('Failed to report warning to service:', reportError);
    }
  }

  /**
   * Gets user-friendly message for contract errors
   * @param {Error} error - The contract error
   * @param {string} methodName - Contract method name
   * @returns {string} User-friendly error message
   */
  static getContractErrorMessage(error, methodName) {
    const message = error.message || error.toString();
    
    // Common contract error patterns
    if (message.includes('user rejected')) {
      return 'Transaction was cancelled by user.';
    }
    
    if (message.includes('insufficient funds')) {
      return 'Insufficient funds for this transaction.';
    }
    
    if (message.includes('gas')) {
      return 'Transaction failed due to gas issues. Please try again.';
    }
    
    if (message.includes('revert')) {
      return 'Transaction was rejected by the contract. Please check the transaction details.';
    }
    
    // Method-specific messages
    switch (methodName) {
      case 'createDispute':
        return 'Failed to create dispute. Please check your inputs and try again.';
      case 'submitEvidence':
        return 'Failed to submit evidence. Please try again.';
      case 'fundAppeal':
        return 'Failed to fund appeal. Please check your balance and try again.';
      default:
        return 'Transaction failed. Please try again or contact support.';
    }
  }
}

/**
 * React Error Boundary component for catching React errors
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorId = ErrorHandler.logError(error, 'react-error-boundary', {
      componentStack: errorInfo.componentStack,
      errorBoundary: this.constructor.name
    });
    
    this.setState({ errorId });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. Please refresh the page or contact support.</p>
          {this.state.errorId && (
            <p>Error ID: {this.state.errorId}</p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Sets up global error handlers
 */
export const setupGlobalErrorHandlers = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const errorId = ErrorHandler.logError(event.reason, 'unhandled-promise-rejection', {
      promise: event.promise
    });
    console.error(`Unhandled error: ${errorId}`);
  });

  // Handle uncaught errors  
  window.addEventListener('error', (event) => {
    const errorId = ErrorHandler.logError(event.error, 'uncaught-error', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
    console.error(`Unhandled promise rejection: ${errorId}`);
  });
};

// Export convenience functions for common use cases
export const logError = ErrorHandler.logError.bind(ErrorHandler);
export const logWarning = ErrorHandler.logWarning.bind(ErrorHandler);
export const debug = ErrorHandler.debug.bind(ErrorHandler);
export const handleUserError = ErrorHandler.handleUserError.bind(ErrorHandler);
export const handleContractError = ErrorHandler.handleContractError.bind(ErrorHandler);
export const handleNetworkError = ErrorHandler.handleNetworkError.bind(ErrorHandler);