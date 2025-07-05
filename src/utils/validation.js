import { BlockchainUtils } from './blockchain.js';
import { UI_CONSTANTS } from '../constants/ui.js';
import DOMPurify from 'dompurify';
import { AddressUtils } from './blockchain.js';
import { VALIDATION, FILE_LIMITS } from '../constants/blockchain.js';
import { VALIDATION_RULES, FILE_UPLOAD } from '../constants/ui.js';
import { handleValidationError, debug } from './errorHandler.js';

/**
 * Centralized Validation Utility
 * Provides reusable validation rules and sanitization functions
 * Replaces scattered validation logic throughout the application
 */

/**
 * Centralized validation rules to replace scattered validation logic
 * Provides consistent, reusable validation across the application
 */
export const ValidationRules = {
  /**
   * Validates required fields
   */
  required: (value) => {
    if (value === null || value === undefined) {
      return UI_CONSTANTS.ERROR_MESSAGES.REQUIRED_FIELD;
    }
    if (typeof value === 'string' && !value.trim()) {
      return UI_CONSTANTS.ERROR_MESSAGES.REQUIRED_FIELD;
    }
    if (Array.isArray(value) && value.length === 0) {
      return UI_CONSTANTS.ERROR_MESSAGES.REQUIRED_FIELD;
    }
    return null;
  },

  /**
   * Validates Ethereum addresses
   */
  ethereumAddress: (address) => {
    if (!address || typeof address !== 'string') {
      return UI_CONSTANTS.ERROR_MESSAGES.INVALID_ADDRESS;
    }
    if (!AddressUtils.isValid(address)) {
      return UI_CONSTANTS.ERROR_MESSAGES.INVALID_ADDRESS;
    }
    return null;
  },

  /**
   * Validates string length
   */
  stringLength: (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (typeof value !== 'string') {
      return 'Value must be a string';
    }
    
    const length = value.trim().length;
    
    if (length < min) {
      return `Must be at least ${min} characters long`;
    }
    
    if (length > max) {
      return `Must be no more than ${max} characters long`;
    }
    
    return null;
  },

  /**
   * Validates numeric range
   */
  numericRange: (value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
    const num = Number(value);
    
    if (isNaN(num)) {
      return 'Must be a valid number';
    }
    
    if (num < min) {
      return `Must be at least ${min}`;
    }
    
    if (num > max) {
      return `Must be no more than ${max}`;
    }
    
    return null;
  },

  /**
   * Validates juror count
   */
  jurorCount: (count) => {
    const numericError = ValidationRules.numericRange(
      count, 
      UI_CONSTANTS.VALIDATION.MIN_JURORS, 
      UI_CONSTANTS.VALIDATION.MAX_JURORS
    );
    
    if (numericError) {
      return `Juror count: ${numericError}`;
    }
    
    if (!Number.isInteger(Number(count))) {
      return 'Juror count must be a whole number';
    }
    
    return null;
  },

  /**
   * Validates ruling options count
   */
  rulingOptionsCount: (count) => {
    const numericError = ValidationRules.numericRange(
      count,
      UI_CONSTANTS.VALIDATION.MIN_RULING_OPTIONS,
      UI_CONSTANTS.VALIDATION.MAX_RULING_OPTIONS
    );
    
    if (numericError) {
      return `Ruling options count: ${numericError}`;
    }
    
    if (!Number.isInteger(Number(count))) {
      return 'Ruling options count must be a whole number';
    }
    
    return null;
  },

  /**
   * Validates file uploads
   */
  fileUpload: (file) => {
    if (!file || !(file instanceof File)) {
      return 'Please select a valid file';
    }

    // Check file size
    if (file.size > UI_CONSTANTS.FILE_UPLOAD.MAX_SIZE_BYTES) {
      const maxSizeMB = UI_CONSTANTS.FILE_UPLOAD.MAX_SIZE_BYTES / (1024 * 1024);
      return `File size must be less than ${maxSizeMB}MB`;
    }

    // Check file type
    const allowedTypes = UI_CONSTANTS.FILE_UPLOAD.ALLOWED_TYPES;
    const isValidType = allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });

    if (!isValidType) {
      return `File type '${file.type}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`;
    }

    return null;
  },

  /**
   * Validates URLs
   */
  url: (url) => {
    if (!url || typeof url !== 'string') {
      return 'URL is required';
    }

    try {
      new URL(url);
      return null;
    } catch {
      return 'Please enter a valid URL';
    }
  },

  /**
   * Validates email format
   */
  email: (email) => {
    if (!email || typeof email !== 'string') {
      return 'Email is required';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }

    return null;
  },

  /**
   * Validates dispute title
   */
  disputeTitle: (title) => {
    const requiredError = ValidationRules.required(title);
    if (requiredError) return requiredError;

    return ValidationRules.stringLength(
      title, 
      1, 
      UI_CONSTANTS.VALIDATION.TITLE_MAX_LENGTH
    );
  },

  /**
   * Validates dispute description
   */
  disputeDescription: (description) => {
    if (!description) return null; // Description is optional

    return ValidationRules.stringLength(
      description,
      0,
      UI_CONSTANTS.VALIDATION.DESCRIPTION_MAX_LENGTH
    );
  },

  /**
   * Validates dispute question
   */
  disputeQuestion: (question) => {
    const requiredError = ValidationRules.required(question);
    if (requiredError) return requiredError;

    return ValidationRules.stringLength(
      question,
      1,
      UI_CONSTANTS.VALIDATION.QUESTION_MAX_LENGTH
    );
  },

  /**
   * Validates question type
   */
  questionType: (type) => {
    const validTypes = Object.values(UI_CONSTANTS.VALIDATION.QUESTION_TYPES);
    
    if (!validTypes.includes(type)) {
      return `Invalid question type. Allowed types: ${validTypes.join(', ')}`;
    }

    return null;
  },

  /**
   * Validates ruling option titles
   */
  rulingOptionTitles: (titles, questionType) => {
    if (!Array.isArray(titles)) {
      return 'Ruling titles must be an array';
    }

    // Check if titles are required for this question type
    const requiresOptions = [
      UI_CONSTANTS.VALIDATION.QUESTION_TYPES.SINGLE_SELECT,
      UI_CONSTANTS.VALIDATION.QUESTION_TYPES.MULTIPLE_SELECT
    ].includes(questionType);

    if (requiresOptions && titles.length === 0) {
      return 'At least one ruling option is required for this question type';
    }

    // Validate each title
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      
      if (!title || typeof title !== 'string' || !title.trim()) {
        return `Ruling option ${i + 1} cannot be empty`;
      }

      if (title.length > 100) {
        return `Ruling option ${i + 1} is too long (max 100 characters)`;
      }
    }

    // Check for duplicates
    const uniqueTitles = new Set(titles.map(title => title.trim().toLowerCase()));
    if (uniqueTitles.size !== titles.length) {
      return 'Ruling options must be unique';
    }

    return null;
  },

  /**
   * Validates evidence title
   */
  evidenceTitle: (title) => {
    const requiredError = ValidationRules.required(title);
    if (requiredError) return requiredError;

    return ValidationRules.stringLength(
      title,
      1,
      UI_CONSTANTS.VALIDATION.EVIDENCE_TITLE_MAX_LENGTH
    );
  },

  /**
   * Validates evidence description
   */
  evidenceDescription: (description) => {
    const requiredError = ValidationRules.required(description);
    if (requiredError) return requiredError;

    return ValidationRules.stringLength(
      description,
      1,
      UI_CONSTANTS.VALIDATION.EVIDENCE_DESCRIPTION_MAX_LENGTH
    );
  }
};

/**
 * Sanitization functions for security
 */
export const Sanitizers = {
  /**
   * Sanitizes user input to prevent XSS
   */
  sanitizeInput: (input) => {
    if (typeof input !== 'string') {
      return input;
    }

    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: []
    });
  },

  /**
   * Sanitizes plain text (removes all HTML)
   */
  sanitizePlainText: (input) => {
    if (typeof input !== 'string') {
      return input;
    }

    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
  },

  /**
   * Sanitizes numeric input
   */
  sanitizeNumeric: (input) => {
    const str = String(input).replace(/[^\d.-]/g, '');
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  },

  /**
   * Sanitizes Ethereum address
   */
  sanitizeAddress: (address) => {
    if (typeof address !== 'string') {
      return '';
    }

    // Remove any non-hex characters except 0x prefix
    const sanitized = address.toLowerCase().replace(/[^0-9a-fx]/g, '');
    
    // Ensure it starts with 0x
    if (sanitized.startsWith('0x')) {
      return sanitized;
    } else if (sanitized.length === 40) {
      return '0x' + sanitized;
    }
    
    return sanitized;
  }
};

/**
 * Form validation helper
 */
export class FormValidator {
  constructor() {
    this.errors = {};
  }

  /**
   * Validates a single field
   */
  validateField(fieldName, value, rules) {
    const errors = [];

    for (const rule of rules) {
      const error = rule(value);
      if (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      this.errors[fieldName] = errors;
      return false;
    } else {
      delete this.errors[fieldName];
      return true;
    }
  }

  /**
   * Validates multiple fields
   */
  validateFields(fieldRules) {
    let allValid = true;

    Object.entries(fieldRules).forEach(([fieldName, { value, rules }]) => {
      const isValid = this.validateField(fieldName, value, rules);
      if (!isValid) {
        allValid = false;
      }
    });

    return allValid;
  }

  /**
   * Gets all errors
   */
  getErrors() {
    return { ...this.errors };
  }

  /**
   * Gets errors for a specific field
   */
  getFieldErrors(fieldName) {
    return this.errors[fieldName] || [];
  }

  /**
   * Checks if form has any errors
   */
  hasErrors() {
    return Object.keys(this.errors).length > 0;
  }

  /**
   * Clears all errors
   */
  clearErrors() {
    this.errors = {};
  }

  /**
   * Clears errors for a specific field
   */
  clearFieldErrors(fieldName) {
    delete this.errors[fieldName];
  }
}

/**
 * Pre-configured validation rules for common dispute resolver forms
 */
export const DisputeValidation = {
  /**
   * Validates complete dispute creation form
   */
  validateDisputeForm: (formData) => {
    const validator = new FormValidator();

    const fieldRules = {
      title: {
        value: formData.title,
        rules: [ValidationRules.disputeTitle]
      },
      description: {
        value: formData.description,
        rules: [ValidationRules.disputeDescription]
      },
      question: {
        value: formData.question,
        rules: [ValidationRules.disputeQuestion]
      },
      questionType: {
        value: formData.questionType,
        rules: [ValidationRules.required, ValidationRules.questionType]
      },
      initialNumberOfJurors: {
        value: formData.initialNumberOfJurors,
        rules: [ValidationRules.required, ValidationRules.jurorCount]
      },
      selectedSubcourt: {
        value: formData.selectedSubcourt,
        rules: [ValidationRules.required]
      }
    };

    // Validate ruling options if required
    if (formData.rulingTitles && formData.rulingTitles.length > 0) {
      fieldRules.rulingTitles = {
        value: formData.rulingTitles,
        rules: [(titles) => ValidationRules.rulingOptionTitles(titles, formData.questionType)]
      };
    }

    const isValid = validator.validateFields(fieldRules);

    return {
      isValid,
      errors: validator.getErrors()
    };
  },

  /**
   * Validates evidence submission form
   */
  validateEvidenceForm: (formData) => {
    const validator = new FormValidator();

    const fieldRules = {
      evidenceTitle: {
        value: formData.evidenceTitle,
        rules: [ValidationRules.evidenceTitle]
      },
      evidenceDescription: {
        value: formData.evidenceDescription,
        rules: [ValidationRules.evidenceDescription]
      }
    };

    // Validate file if provided
    if (formData.evidenceDocument) {
      fieldRules.evidenceDocument = {
        value: formData.evidenceDocument,
        rules: [ValidationRules.fileUpload]
      };
    }

    const isValid = validator.validateFields(fieldRules);

    return {
      isValid,
      errors: validator.getErrors()
    };
  }
};

/**
 * Validates an entire form using provided rules
 * @param {Object} formData - Form data to validate
 * @param {Object} rules - Validation rules for each field
 * @returns {Object} Validation result with isValid and errors
 */
export function validateForm(formData, rules) {
  const errors = {};
  let isValid = true;

  Object.keys(rules).forEach(field => {
    const fieldRules = Array.isArray(rules[field]) ? rules[field] : [rules[field]];
    const value = formData[field];

    for (const rule of fieldRules) {
      const result = typeof rule === 'function' 
        ? rule(value, formData) 
        : rule(value);
        
      if (!result.isValid) {
        errors[field] = result.message;
        isValid = false;
        break; // Stop at first error for this field
      }
    }
  });

  return { isValid, errors };
}

/**
 * Validates a single form field
 * @param {any} value - Field value to validate
 * @param {Array|Function} rules - Validation rules for the field
 * @param {Object} formData - Complete form data for cross-field validation
 * @returns {Object} Validation result
 */
export function validateField(value, rules, formData = {}) {
  const fieldRules = Array.isArray(rules) ? rules : [rules];
  
  for (const rule of fieldRules) {
    const result = typeof rule === 'function' 
      ? rule(value, formData) 
      : rule(value);
      
    if (!result.isValid) {
      return result;
    }
  }
  
  return { isValid: true, message: '' };
}

/**
 * Input sanitization utility
 * @param {string} input - Input to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized input
 */
export const sanitizeInput = (input, options = {}) => {
  if (typeof input !== 'string') return input;

  let sanitized = input;

  // Trim whitespace by default
  if (options.trim !== false) {
    sanitized = sanitized.trim();
  }

  // Remove HTML tags
  if (options.removeHtml) {
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }

  // Remove script tags and javascript: URLs
  if (options.removeScripts !== false) {
    sanitized = sanitized
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '');
  }

  // Enforce maximum length
  if (options.maxLength) {
    sanitized = sanitized.slice(0, options.maxLength);
  }

  // Convert to lowercase
  if (options.toLowerCase) {
    sanitized = sanitized.toLowerCase();
  }

  // Remove special characters (keep only alphanumeric and basic punctuation)
  if (options.removeSpecialChars) {
    sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-_.,!?]/g, '');
  }

  return sanitized;
};

/**
 * Creates validation schemas for common form types
 */
export const ValidationSchemas = {
  /**
   * Dispute creation form validation schema
   */
  createDispute: {
    title: [
      ValidationRules.required,
      ValidationRules.minLength(UI_CONSTANTS.VALIDATION.MIN_TITLE_LENGTH),
      ValidationRules.maxLength(UI_CONSTANTS.VALIDATION.MAX_TITLE_LENGTH)
    ],
    description: [
      ValidationRules.maxLength(UI_CONSTANTS.VALIDATION.MAX_DESCRIPTION_LENGTH)
    ],
    question: [ValidationRules.required],
    initialNumberOfJurors: [
      ValidationRules.required,
      ValidationRules.jurorCount
    ],
    selectedSubcourt: [ValidationRules.required],
    numberOfRulingOptions: [ValidationRules.rulingOptionsCount],
    rulingTitles: (value, formData) => {
      if (formData.questionType === UI_CONSTANTS.QUESTION_TYPES.SINGLE_SELECT ||
          formData.questionType === UI_CONSTANTS.QUESTION_TYPES.MULTIPLE_SELECT) {
        return ValidationRules.required(value);
      }
      return { isValid: true, message: '' };
    }
  },

  /**
   * Evidence submission form validation schema
   */
  submitEvidence: {
    evidenceTitle: [
      ValidationRules.required,
      ValidationRules.maxLength(100)
    ],
    evidenceDescription: [
      ValidationRules.required,
      ValidationRules.maxLength(1000)
    ],
    supportingSide: [ValidationRules.required],
    evidenceDocument: [
      ValidationRules.fileSize,
      ValidationRules.fileType
    ]
  },

  /**
   * Appeal funding form validation schema
   */
  fundAppeal: {
    contribution: [
      ValidationRules.required,
      ValidationRules.positiveNumber
    ],
    rulingOption: [ValidationRules.required]
  },

  /**
   * User profile form validation schema
   */
  userProfile: {
    name: [
      ValidationRules.minLength(2),
      ValidationRules.maxLength(50)
    ],
    email: [ValidationRules.email],
    website: [ValidationRules.url],
    ethereumAddress: [ValidationRules.address]
  }
};

/**
 * Real-time validation hook for React components
 * @param {Object} initialData - Initial form data
 * @param {Object} validationSchema - Validation rules
 * @returns {Object} Validation state and methods
 */
export const useFormValidation = (initialData = {}, validationSchema = {}) => {
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validateSingleField = useCallback((fieldName, value) => {
    const rules = validationSchema[fieldName];
    if (!rules) return { isValid: true, message: '' };

    return validateField(value, rules, formData);
  }, [validationSchema, formData]);

  const handleFieldChange = useCallback((fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    
    // Validate field if it has been touched
    if (touched[fieldName]) {
      const validation = validateSingleField(fieldName, value);
      setErrors(prev => ({
        ...prev,
        [fieldName]: validation.isValid ? null : validation.message
      }));
    }
  }, [touched, validateSingleField]);

  const handleFieldBlur = useCallback((fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    
    const value = formData[fieldName];
    const validation = validateSingleField(fieldName, value);
    setErrors(prev => ({
      ...prev,
      [fieldName]: validation.isValid ? null : validation.message
    }));
  }, [formData, validateSingleField]);

  const validateAll = useCallback(() => {
    const validation = validateForm(formData, validationSchema);
    setErrors(validation.errors);
    setTouched(Object.keys(validationSchema).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {}));
    return validation;
  }, [formData, validationSchema]);

  const isValid = useMemo(() => {
    return Object.values(errors).every(error => !error);
  }, [errors]);

  const reset = useCallback(() => {
    setFormData(initialData);
    setErrors({});
    setTouched({});
  }, [initialData]);

  return {
    formData,
    errors,
    touched,
    isValid,
    handleFieldChange,
    handleFieldBlur,
    validateAll,
    reset
  };
};

/**
 * Security utilities for input sanitization
 */
export const SecurityUtils = {
  /**
   * Sanitize string input to prevent XSS attacks
   */
  sanitizeInput: (input) => {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  /**
   * Validate file type against allowed types
   */
  validateFileType: (file, allowedTypes = UI_CONSTANTS.FILE_UPLOAD.ALLOWED_TYPES) => {
    if (!file || !file.type) return false;
    
    return allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type || file.name.endsWith(type);
    });
  },

  /**
   * Validate URL format
   */
  isValidUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Strip HTML tags from string
   */
  stripHtml: (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
};

/**
 * Reusable validation rules
 * Each rule returns { isValid: boolean, message: string }
 */
export const ValidationRules = {
  /**
   * Required field validation
   */
  required: (value) => ({
    isValid: value != null && value !== '' && value !== undefined,
    message: 'This field is required'
  }),

  /**
   * String length validation
   */
  length: (min, max) => (value) => {
    const length = value ? value.toString().length : 0;
    const isValid = length >= min && length <= max;
    
    if (min === max) {
      return {
        isValid,
        message: `Must be exactly ${min} characters`
      };
    }
    
    return {
      isValid,
      message: `Must be between ${min} and ${max} characters`
    };
  },

  /**
   * Ethereum address validation
   */
  ethereumAddress: (value) => ({
    isValid: !value || AddressUtils.isValid(value),
    message: 'Please enter a valid Ethereum address (0x...)'
  }),

  /**
   * Number range validation
   */
  numberRange: (min, max) => (value) => {
    const num = parseInt(value);
    const isValid = !isNaN(num) && num >= min && num <= max;
    
    return {
      isValid,
      message: `Must be a number between ${min} and ${max}`
    };
  },

  /**
   * File size validation
   */
  fileSize: (maxSizeMB = UI_CONSTANTS.FILE_UPLOAD.MAX_SIZE_MB) => (file) => {
    if (!file) return { isValid: true, message: '' };
    
    const isValid = file.size <= maxSizeMB * 1024 * 1024;
    return {
      isValid,
      message: `File size must be less than ${maxSizeMB}MB`
    };
  },

  /**
   * File type validation
   */
  fileType: (allowedTypes = UI_CONSTANTS.FILE_UPLOAD.ALLOWED_TYPES) => (file) => {
    if (!file) return { isValid: true, message: '' };
    
    const isValid = SecurityUtils.validateFileType(file, allowedTypes);
    return {
      isValid,
      message: `File type not supported. Allowed: ${allowedTypes.join(', ')}`
    };
  },

  /**
   * Email format validation
   */
  email: (value) => {
    if (!value) return { isValid: true, message: '' };
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(value);
    
    return {
      isValid,
      message: 'Please enter a valid email address'
    };
  },

  /**
   * URL format validation
   */
  url: (value) => {
    if (!value) return { isValid: true, message: '' };
    
    const isValid = SecurityUtils.isValidUrl(value);
    return {
      isValid,
      message: 'Please enter a valid URL'
    };
  },

  /**
   * Regex pattern validation
   */
  pattern: (regex, message) => (value) => {
    if (!value) return { isValid: true, message: '' };
    
    const isValid = regex.test(value);
    return {
      isValid,
      message
    };
  },

  /**
   * Custom validation function
   */
  custom: (validatorFn, message) => (value) => {
    const isValid = validatorFn(value);
    return {
      isValid,
      message: isValid ? '' : message
    };
  }
};

/**
 * Pre-configured validation rules for common form fields
 */
export const CommonValidations = {
  disputeTitle: [
    ValidationRules.required,
    ValidationRules.length(3, UI_CONSTANTS.VALIDATION.MAX_TITLE_LENGTH)
  ],

  disputeDescription: [
    ValidationRules.length(0, UI_CONSTANTS.VALIDATION.MAX_DESCRIPTION_LENGTH)
  ],

  disputeQuestion: [
    ValidationRules.required,
    ValidationRules.length(10, UI_CONSTANTS.VALIDATION.MAX_QUESTION_LENGTH)
  ],

  jurorCount: [
    ValidationRules.required,
    ValidationRules.numberRange(
      UI_CONSTANTS.VALIDATION.MIN_JURORS,
      UI_CONSTANTS.VALIDATION.MAX_JURORS
    )
  ],

  rulingTitle: [
    ValidationRules.required,
    ValidationRules.length(1, UI_CONSTANTS.VALIDATION.MAX_RULING_TITLE_LENGTH)
  ],

  ethereumAddress: [
    ValidationRules.ethereumAddress
  ],

  uploadedFile: [
    ValidationRules.fileSize(),
    ValidationRules.fileType()
  ]
};

/**
 * Main validation function
 * @param {any} value - Value to validate
 * @param {Array} rules - Array of validation rules
 * @returns {Object} Validation result
 */
export const validate = (value, rules) => {
  // Apply sanitization first
  const sanitizedValue = typeof value === 'string' 
    ? SecurityUtils.sanitizeInput(value) 
    : value;

  for (const rule of rules) {
    const result = rule(sanitizedValue);
    if (!result.isValid) {
      return {
        isValid: false,
        message: result.message,
        sanitizedValue
      };
    }
  }
  
  return {
    isValid: true,
    message: '',
    sanitizedValue
  };
};

/**
 * Validate an entire form object
 * @param {Object} formData - Form data object
 * @param {Object} validationRules - Validation rules for each field
 * @returns {Object} Validation results
 */
export const validateForm = (formData, validationRules) => {
  const errors = {};
  const sanitizedData = {};
  let isFormValid = true;

  Object.keys(validationRules).forEach(field => {
    const value = formData[field];
    const rules = validationRules[field];
    
    const result = validate(value, rules);
    
    if (!result.isValid) {
      errors[field] = result.message;
      isFormValid = false;
    }
    
    sanitizedData[field] = result.sanitizedValue;
  });

  return {
    isValid: isFormValid,
    errors,
    sanitizedData
  };
};

/**
 * Create a debounced validator for real-time validation
 * @param {Function} validatorFn - Validation function
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} Debounced validator
 */
export const createDebouncedValidator = (validatorFn, delay = UI_CONSTANTS.TIMEOUTS.DEBOUNCE_MS) => {
  let timeoutId;
  
  return (value, callback) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const result = validatorFn(value);
      callback(result);
    }, delay);
  };
};

/**
 * Validation Utility Functions
 * Centralized validation logic for forms, inputs, and data integrity
 */

/**
 * Core validation utilities
 */
export class ValidationUtils {
  /**
   * Validates dispute title
   */
  static validateDisputeTitle(title) {
    if (!title || typeof title !== 'string') {
      return { isValid: false, error: 'Title is required' };
    }
    
    const trimmed = title.trim();
    
    if (trimmed.length < VALIDATION.MIN_DISPUTE_TITLE_LENGTH) {
      return { 
        isValid: false, 
        error: `Title must be at least ${VALIDATION.MIN_DISPUTE_TITLE_LENGTH} characters` 
      };
    }
    
    if (trimmed.length > VALIDATION.MAX_DISPUTE_TITLE_LENGTH) {
      return { 
        isValid: false, 
        error: `Title must be no more than ${VALIDATION.MAX_DISPUTE_TITLE_LENGTH} characters` 
      };
    }

    // Check for valid characters
    if (VALIDATION_RULES.DISPUTE_TITLE.PATTERN && !VALIDATION_RULES.DISPUTE_TITLE.PATTERN.test(trimmed)) {
      return {
        isValid: false,
        error: 'Title contains invalid characters'
      };
    }
    
    return { isValid: true, value: trimmed };
  }

  /**
   * Validates dispute description
   */
  static validateDescription(description) {
    if (!description || typeof description !== 'string') {
      return { isValid: false, error: 'Description is required' };
    }
    
    const trimmed = description.trim();
    
    if (trimmed.length < VALIDATION.MIN_DESCRIPTION_LENGTH) {
      return { 
        isValid: false, 
        error: `Description must be at least ${VALIDATION.MIN_DESCRIPTION_LENGTH} characters` 
      };
    }
    
    if (trimmed.length > VALIDATION.MAX_DESCRIPTION_LENGTH) {
      return { 
        isValid: false, 
        error: `Description must be no more than ${VALIDATION.MAX_DESCRIPTION_LENGTH} characters` 
      };
    }
    
    return { isValid: true, value: trimmed };
  }

  /**
   * Validates dispute question
   */
  static validateQuestion(question) {
    if (!question || typeof question !== 'string') {
      return { isValid: false, error: 'Question is required' };
    }
    
    const trimmed = question.trim();
    
    if (trimmed.length < VALIDATION.MIN_QUESTION_LENGTH) {
      return { 
        isValid: false, 
        error: `Question must be at least ${VALIDATION.MIN_QUESTION_LENGTH} characters` 
      };
    }
    
    if (trimmed.length > VALIDATION.MAX_QUESTION_LENGTH) {
      return { 
        isValid: false, 
        error: `Question must be no more than ${VALIDATION.MAX_QUESTION_LENGTH} characters` 
      };
    }
    
    return { isValid: true, value: trimmed };
  }

  /**
   * Validates ruling options
   */
  static validateRulingOptions(options) {
    if (!Array.isArray(options)) {
      return { isValid: false, error: 'Ruling options must be an array' };
    }
    
    if (options.length < VALIDATION.MIN_RULING_OPTIONS) {
      return { 
        isValid: false, 
        error: `Must have at least ${VALIDATION.MIN_RULING_OPTIONS} ruling options` 
      };
    }
    
    if (options.length > VALIDATION.MAX_RULING_OPTIONS) {
      return { 
        isValid: false, 
        error: `Must have no more than ${VALIDATION.MAX_RULING_OPTIONS} ruling options` 
      };
    }
    
    const validatedOptions = [];
    const errors = [];
    
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      
      if (!option || typeof option !== 'string') {
        errors.push(`Ruling option ${i + 1} is required`);
        continue;
      }
      
      const trimmed = option.trim();
      
      if (trimmed.length === 0) {
        errors.push(`Ruling option ${i + 1} cannot be empty`);
        continue;
      }
      
      if (VALIDATION_RULES.RULING_OPTIONS?.MIN_OPTION_LENGTH && 
          trimmed.length < VALIDATION_RULES.RULING_OPTIONS.MIN_OPTION_LENGTH) {
        errors.push(`Ruling option ${i + 1} must be at least ${VALIDATION_RULES.RULING_OPTIONS.MIN_OPTION_LENGTH} characters`);
        continue;
      }
      
      if (VALIDATION_RULES.RULING_OPTIONS?.MAX_OPTION_LENGTH && 
          trimmed.length > VALIDATION_RULES.RULING_OPTIONS.MAX_OPTION_LENGTH) {
        errors.push(`Ruling option ${i + 1} must be no more than ${VALIDATION_RULES.RULING_OPTIONS.MAX_OPTION_LENGTH} characters`);
        continue;
      }
      
      // Check for duplicates
      if (validatedOptions.includes(trimmed)) {
        errors.push(`Ruling option ${i + 1} is a duplicate`);
        continue;
      }
      
      validatedOptions.push(trimmed);
    }
    
    if (errors.length > 0) {
      return { isValid: false, error: errors[0], errors };
    }
    
    return { isValid: true, value: validatedOptions };
  }

  /**
   * Validates Ethereum address
   */
  static validateAddress(address) {
    if (!address) {
      return { isValid: false, error: 'Address is required' };
    }
    
    if (typeof address !== 'string') {
      return { isValid: false, error: 'Address must be a string' };
    }
    
    const trimmed = address.trim();
    
    if (trimmed.length !== VALIDATION.ADDRESS_LENGTH) {
      return { isValid: false, error: 'Address must be 42 characters long' };
    }
    
    if (!AddressUtils.isValidAddress(trimmed)) {
      return { isValid: false, error: 'Invalid Ethereum address format' };
    }
    
    return { isValid: true, value: AddressUtils.getChecksumAddress(trimmed) };
  }

  /**
   * Validates amount (ETH or token)
   */
  static validateAmount(amount, min = 0, max = null, decimals = 18) {
    if (amount === null || amount === undefined || amount === '') {
      return { isValid: false, error: 'Amount is required' };
    }
    
    let numAmount;
    
    if (typeof amount === 'string') {
      numAmount = parseFloat(amount.trim());
    } else if (typeof amount === 'number') {
      numAmount = amount;
    } else {
      return { isValid: false, error: 'Amount must be a number or string' };
    }
    
    if (isNaN(numAmount)) {
      return { isValid: false, error: 'Amount must be a valid number' };
    }
    
    if (numAmount < 0) {
      return { isValid: false, error: 'Amount cannot be negative' };
    }
    
    if (numAmount < min) {
      return { isValid: false, error: `Amount must be at least ${min}` };
    }
    
    if (max !== null && numAmount > max) {
      return { isValid: false, error: `Amount must be no more than ${max}` };
    }
    
    // Check decimal places
    const amountStr = numAmount.toString();
    const decimalIndex = amountStr.indexOf('.');
    if (decimalIndex !== -1) {
      const decimalPlaces = amountStr.length - decimalIndex - 1;
      if (decimalPlaces > decimals) {
        return { 
          isValid: false, 
          error: `Amount cannot have more than ${decimals} decimal places` 
        };
      }
    }
    
    return { isValid: true, value: numAmount };
  }

  /**
   * Validates file upload
   */
  static validateFile(file, maxSize = FILE_UPLOAD.MAX_SIZE, allowedTypes = FILE_UPLOAD.ALLOWED_TYPES) {
    if (!file) {
      return { isValid: false, error: 'File is required' };
    }
    
    if (!(file instanceof File)) {
      return { isValid: false, error: 'Invalid file object' };
    }
    
    if (file.size === 0) {
      return { isValid: false, error: 'File cannot be empty' };
    }
    
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / 1024 / 1024);
      return { 
        isValid: false, 
        error: `File size must be less than ${maxSizeMB}MB` 
      };
    }
    
    if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      const allowedExtensions = allowedTypes
        .map(type => FILE_UPLOAD.MIME_TYPE_EXTENSIONS[type] || type)
        .join(', ');
      return { 
        isValid: false, 
        error: `File type not allowed. Allowed types: ${allowedExtensions}` 
      };
    }
    
    return { isValid: true, value: file };
  }

  /**
   * Validates URL
   */
  static validateUrl(url, required = false) {
    if (!url || url.trim() === '') {
      if (required) {
        return { isValid: false, error: 'URL is required' };
      }
      return { isValid: true, value: '' };
    }
    
    const trimmed = url.trim();
    
    try {
      new URL(trimmed);
      return { isValid: true, value: trimmed };
    } catch (error) {
      return { isValid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Validates email address
   */
  static validateEmail(email, required = false) {
    if (!email || email.trim() === '') {
      if (required) {
        return { isValid: false, error: 'Email is required' };
      }
      return { isValid: true, value: '' };
    }
    
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(trimmed)) {
      return { isValid: false, error: 'Invalid email format' };
    }
    
    return { isValid: true, value: trimmed };
  }

  /**
   * Validates number of jurors
   */
  static validateJurors(jurors) {
    const result = this.validateAmount(jurors, 1, 32, 0);
    
    if (!result.isValid) {
      return result;
    }
    
    const numJurors = Math.floor(result.value);
    
    if (numJurors !== result.value) {
      return { isValid: false, error: 'Number of jurors must be a whole number' };
    }
    
    if (numJurors % 2 === 0) {
      return { isValid: false, error: 'Number of jurors must be odd' };
    }
    
    return { isValid: true, value: numJurors };
  }

  /**
   * Validates subcourt ID
   */
  static validateSubcourt(subcourtId) {
    const result = this.validateAmount(subcourtId, 0, 999999, 0);
    
    if (!result.isValid) {
      return result;
    }
    
    const numSubcourt = Math.floor(result.value);
    
    if (numSubcourt !== result.value) {
      return { isValid: false, error: 'Subcourt ID must be a whole number' };
    }
    
    return { isValid: true, value: numSubcourt };
  }

  /**
   * Sanitizes string input to prevent XSS
   */
  static sanitizeString(input) {
    if (!input || typeof input !== 'string') return '';
    
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
  }

  /**
   * Validates and sanitizes text input
   */
  static validateAndSanitizeText(text, minLength = 0, maxLength = 10000, required = true) {
    if (!text || typeof text !== 'string') {
      if (required) {
        return { isValid: false, error: 'Text is required' };
      }
      return { isValid: true, value: '' };
    }
    
    const sanitized = this.sanitizeString(text);
    
    if (required && sanitized.length === 0) {
      return { isValid: false, error: 'Text cannot be empty' };
    }
    
    if (sanitized.length < minLength) {
      return { 
        isValid: false, 
        error: `Text must be at least ${minLength} characters` 
      };
    }
    
    if (sanitized.length > maxLength) {
      return { 
        isValid: false, 
        error: `Text must be no more than ${maxLength} characters` 
      };
    }
    
    return { isValid: true, value: sanitized };
  }
}

/**
 * Form validation utilities
 */
export class FormValidator {
  constructor() {
    this.errors = {};
    this.values = {};
  }

  /**
   * Validates a single field
   */
  validateField(fieldName, value, validator, ...args) {
    const result = validator(value, ...args);
    
    if (result.isValid) {
      delete this.errors[fieldName];
      this.values[fieldName] = result.value;
    } else {
      this.errors[fieldName] = result.error;
    }
    
    return result;
  }

  /**
   * Validates multiple fields
   */
  validateFields(fields) {
    let allValid = true;
    
    for (const [fieldName, { value, validator, args = [] }] of Object.entries(fields)) {
      const result = this.validateField(fieldName, value, validator, ...args);
      if (!result.isValid) {
        allValid = false;
      }
    }
    
    return allValid;
  }

  /**
   * Gets validation errors
   */
  getErrors() {
    return { ...this.errors };
  }

  /**
   * Gets validated values
   */
  getValues() {
    return { ...this.values };
  }

  /**
   * Checks if form is valid
   */
  isValid() {
    return Object.keys(this.errors).length === 0;
  }

  /**
   * Clears all errors
   */
  clearErrors() {
    this.errors = {};
  }

  /**
   * Clears specific field error
   */
  clearFieldError(fieldName) {
    delete this.errors[fieldName];
  }

  /**
   * Sets custom error
   */
  setError(fieldName, error) {
    this.errors[fieldName] = error;
  }

  /**
   * Gets error for specific field
   */
  getFieldError(fieldName) {
    return this.errors[fieldName];
  }

  /**
   * Gets first error message
   */
  getFirstError() {
    const errorFields = Object.keys(this.errors);
    if (errorFields.length === 0) return null;
    return this.errors[errorFields[0]];
  }
}

/**
 * Validation rules for common form patterns
 */
export const ValidationRules = {
  /**
   * Dispute creation form validation
   */
  disputeForm: {
    title: (value) => ValidationUtils.validateDisputeTitle(value),
    description: (value) => ValidationUtils.validateDescription(value),
    question: (value) => ValidationUtils.validateQuestion(value),
    rulingOptions: (value) => ValidationUtils.validateRulingOptions(value),
    category: (value) => ValidationUtils.validateAndSanitizeText(value, 1, 100),
    subcourt: (value) => ValidationUtils.validateSubcourt(value),
    jurors: (value) => ValidationUtils.validateJurors(value),
    primaryDocument: (value) => ValidationUtils.validateFile(value)
  },

  /**
   * Evidence submission form validation
   */
  evidenceForm: {
    title: (value) => ValidationUtils.validateAndSanitizeText(value, 5, 200),
    description: (value) => ValidationUtils.validateAndSanitizeText(value, 20, 2000),
    supportingSide: (value) => ValidationUtils.validateAmount(value, 0, 10, 0),
    evidenceDocument: (value) => ValidationUtils.validateFile(value)
  },

  /**
   * Appeal funding form validation
   */
  appealForm: {
    side: (value) => ValidationUtils.validateAmount(value, 0, 10, 0),
    amount: (value) => ValidationUtils.validateAmount(value, 0.001, 1000000, 18)
  },

  /**
   * Common field validators
   */
  common: {
    address: (value) => ValidationUtils.validateAddress(value),
    amount: (value, min = 0, max = null) => ValidationUtils.validateAmount(value, min, max),
    url: (value, required = false) => ValidationUtils.validateUrl(value, required),
    email: (value, required = false) => ValidationUtils.validateEmail(value, required),
    text: (value, min = 0, max = 1000, required = true) => 
      ValidationUtils.validateAndSanitizeText(value, min, max, required)
  }
};

/**
 * Validation error handler
 */
export class ValidationError extends Error {
  constructor(field, message, value = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Validates form data and throws ValidationError on failure
 */
export function validateOrThrow(validator, value, fieldName = 'field') {
  const result = validator(value);
  
  if (!result.isValid) {
    const error = handleValidationError(fieldName, result.error, value);
    throw new ValidationError(fieldName, result.error, value);
  }
  
  return result.value;
}

/**
 * Batch validation utility
 */
export function validateBatch(validations) {
  const results = {};
  const errors = {};
  let hasErrors = false;
  
  for (const [fieldName, { validator, value, args = [] }] of Object.entries(validations)) {
    try {
      const result = validator(value, ...args);
      
      if (result.isValid) {
        results[fieldName] = result.value;
      } else {
        errors[fieldName] = result.error;
        hasErrors = true;
      }
    } catch (error) {
      errors[fieldName] = error.message;
      hasErrors = true;
      debug('validation', 'Validation error', { fieldName, error: error.message });
    }
  }
  
  return {
    isValid: !hasErrors,
    values: results,
    errors
  };
}