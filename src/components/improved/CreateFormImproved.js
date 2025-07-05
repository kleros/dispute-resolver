import React, { useState, useCallback, useMemo } from "react";
import { Col, Row, Button, Form, Dropdown } from "react-bootstrap";
import { ReactComponent as ScalesSVG } from "../../assets/images/scales.svg";
import { ReactComponent as EthereumSVG } from "../../assets/images/ethereum.svg";
import { ReactComponent as AvatarSVG } from "../../assets/images/avatar.svg";

// Import our new utilities and constants
import { UI_CONSTANTS, QUESTION_TYPES, QUESTION_TYPE_CONFIG } from "../../constants/ui.js";
import { ValidationRules, validateForm, CommonValidations, DisputeValidation, Sanitizers } from "../../utils/validation.js";
import { ErrorHandler } from "../../utils/errorHandler.js";
import { BlockchainUtils } from "../../utils/blockchain.js";
import { HexUtils } from '../../utils/blockchain.js';
import { handleUserError, debug } from '../../utils/errorHandler.js';
import networkMap from "../../ethereum/network-contract-mapping";

import styles from "../styles/createForm.module.css";
import FileUploadDropzone from "../FileUploadDropzone.js";

/**
 * Improved CreateForm component with better error handling, validation, and maintainability
 * 
 * Key improvements:
 * - Uses centralized constants instead of magic numbers
 * - Implements proper validation with reusable rules
 * - Has consistent error handling
 * - Separates concerns between UI and business logic
 * - Uses React hooks for better state management
 */
const CreateFormImproved = ({ 
  subcourtDetails, 
  subcourtsLoading, 
  network, 
  onNextButtonClickCallback,
  getArbitrationCostCallback,
  publishCallback,
  formData: initialFormData 
}) => {
  // State management with proper initial values
  const [formData, setFormData] = useState({
    initialNumberOfJurors: "3",
    title: "",
    category: "",
    description: "",
    question: "",
    rulingTitles: ["", ""],
    rulingDescriptions: [""],
    names: [],
    addresses: [],
    selectedSubcourt: "0",
    arbitrationCost: "",
    primaryDocument: "",
    questionType: QUESTION_TYPES.SINGLE_SELECT,
    numberOfRulingOptions: 2,
    numberOfParties: 1,
    ...initialFormData // Merge with any initial data
  });

  const [uiState, setUiState] = useState({
    validated: false,
    uploading: false,
    uploadError: "",
    fileInput: null,
    calculatingCost: false,
  });

  const [validationErrors, setValidationErrors] = useState({});

  // Memoized validation rules
  const formValidationRules = {
    title: [
      ValidationRules.required,
      ValidationRules.stringLength(
        UI_CONSTANTS.FORM_VALIDATION.MIN_TITLE_LENGTH,
        UI_CONSTANTS.FORM_VALIDATION.MAX_TITLE_LENGTH
      )
    ],
    description: [
      ValidationRules.required,
      ValidationRules.stringLength(
        UI_CONSTANTS.FORM_VALIDATION.MIN_DESCRIPTION_LENGTH,
        UI_CONSTANTS.FORM_VALIDATION.MAX_DESCRIPTION_LENGTH
      )
    ],
    question: [ValidationRules.required],
    initialNumberOfJurors: [
      ValidationRules.required,
      ValidationRules.integer,
      ValidationRules.numberRange(
        UI_CONSTANTS.FORM_VALIDATION.MIN_JURORS,
        UI_CONSTANTS.FORM_VALIDATION.MAX_JURORS
      )
    ]
  };

  // Memoized validation to prevent unnecessary recalculations
  const validationResult = useMemo(() => {
    return validateForm(formData, formValidationRules);
  }, [formData]);

  // Effect to handle form data changes and validation
  useEffect(() => {
    const { errors } = validateForm(formData, formValidationRules);
    setValidationErrors(errors);
  }, [formData]);

  // Memoized arbitration cost calculation
  const calculateArbitrationCost = useCallback(async (subcourtID, jurorCount) => {
    if (!subcourtID || !jurorCount) return;

    try {
      setUiState(prev => ({ ...prev, calculatingCost: true }));
      
      const cost = await BlockchainUtils.retryOperation(
        () => getArbitrationCostCallback(subcourtID, jurorCount),
        3,
        1000
      );
      
      setFormData(prev => ({ ...prev, arbitrationCost: cost }));
    } catch (error) {
      const errorInfo = ErrorHandler.handleContractError(
        error, 
        'calculateArbitrationCost',
        null
      );
      console.error('Failed to calculate arbitration cost:', errorInfo.userMessage);
    } finally {
      setUiState(prev => ({ ...prev, calculatingCost: false }));
    }
  }, [getArbitrationCostCallback]);

  // Debounced form field updates with automatic validation
  const updateFormField = useCallback((fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));

    // Auto-calculate arbitration cost when relevant fields change
    if (fieldName === 'selectedSubcourt' || fieldName === 'initialNumberOfJurors') {
      const subcourtID = fieldName === 'selectedSubcourt' ? value : formData.selectedSubcourt;
      const jurorCount = fieldName === 'initialNumberOfJurors' ? value : formData.initialNumberOfJurors;
      
      if (subcourtID && jurorCount) {
        calculateArbitrationCost(subcourtID, jurorCount);
      }
    }
  }, [formData, calculateArbitrationCost]);

  // Handler for form field changes
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Handler for array field changes (ruling titles, descriptions, etc.)
  const handleArrayChange = useCallback((field, index, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: [
        ...prev[field].slice(0, index),
        value,
        ...prev[field].slice(index + 1)
      ]
    }));
  }, []);

  // File upload handler with proper error handling
  const handleFileUpload = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      setUiState(prev => ({ ...prev, uploading: true }));
      setValidationErrors(prev => ({ ...prev, upload: null }));

      // Validate file before upload
      const fileValidation = validateForm(
        { file }, 
        { file: CommonValidations.uploadedFile }
      );

      if (!fileValidation.isValid) {
        setValidationErrors(prev => ({ ...prev, upload: fileValidation.errors.file }));
        return;
      }

      const reader = new FileReader();
      reader.readAsArrayBuffer(file);

      reader.onload = async () => {
        try {
          const buffer = Buffer.from(reader.result);
          const result = await publishCallback(file.name, buffer);
          
          updateFormField('primaryDocument', result);
        } catch (uploadError) {
          const errorInfo = ErrorHandler.handleUploadError(
            uploadError, 
            file.name, 
            file.size
          );
          setValidationErrors(prev => ({ ...prev, upload: errorInfo.userMessage }));
        }
      };

      reader.onerror = () => {
        setValidationErrors(prev => ({ 
          ...prev, 
          upload: 'Failed to read the file. Please try again.' 
        }));
      };
    } catch (error) {
      const errorInfo = ErrorHandler.handleUploadError(error, file.name, file.size);
      setValidationErrors(prev => ({ ...prev, upload: errorInfo.userMessage }));
    } finally {
      setUiState(prev => ({ ...prev, uploading: false }));
    }
  }, [publishCallback, updateFormField]);

  // Form submission handler
  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();

    setUiState(prev => ({ ...prev, validated: true }));

    // Use our centralized validation
    const validation = validateForm(formData, formValidationRules);
    setValidationErrors(validation.errors);

    if (validation.isValid) {
      // Prepare clean, sanitized data for submission
      const submissionData = {
        ...validation.sanitizedData,
        subcourtDetails,
        selectedSubcourt: formData.selectedSubcourt,
        questionType: formData.questionType,
        arbitrationCost: formData.arbitrationCost,
        rulingTitles: formData.questionType.code === 'single-select' || 
                     formData.questionType.code === 'multiple-select' 
                     ? formData.rulingTitles 
                     : [],
        rulingDescriptions: formData.rulingDescriptions,
        names: formData.names,
        addresses: formData.addresses
      };

      onNextButtonClickCallback(submissionData);
    }
  }, [formData, onNextButtonClickCallback, subcourtDetails]);

  // Subcourt selection handler
  const handleSubcourtSelect = useCallback((subcourtID) => {
    updateFormField('selectedSubcourt', courtID);
  }, [updateFormField]);

  // Question type change handler
  const handleQuestionTypeChange = useCallback((questionTypeStr) => {
    const questionType = JSON.parse(questionTypeStr);
    
    setFormData(prev => ({
      ...prev,
      questionType,
      numberOfRulingOptions: [
        QUESTION_TYPES.SINGLE_SELECT.code,
        QUESTION_TYPES.MULTIPLE_SELECT.code
      ].includes(questionType.code) ? 2 : 0
    }));
  }, []);

  // Error display helper
  const getFieldError = useCallback((fieldName) => {
    return validationErrors[fieldName];
  }, [validationErrors]);

  // Check if network supports disputes
  if (!network || !networkMap[network]?.ARBITRABLE_PROXY) {
    return (
      <div className={styles.createForm}>
        <h1>Unsupported Network</h1>
        <p>
          There is no arbitrable contract deployed on this network.
          Unfortunately, you cannot create a dispute here.
        </p>
        <p>
          Feel free to head over to{" "}
          <a 
            href="https://github.com/kleros/dispute-resolver/issues" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            GitHub issues
          </a>{" "}
          to request this feature.
        </p>
      </div>
    );
  }

  // Memoized question type options
  const questionTypeOptions = useMemo(() => {
    return Object.entries(QUESTION_TYPE_CONFIG).map(([key, config]) => ({
      key,
      ...config
    }));
  }, []);

  // Memoized current question type config
  const currentQuestionConfig = useMemo(() => {
    return QUESTION_TYPE_CONFIG[formData.questionType] || QUESTION_TYPE_CONFIG[UI_CONSTANTS.VALIDATION.QUESTION_TYPES.SINGLE_SELECT];
  }, [formData.questionType]);

  return (
    <section className={styles.createForm}>
      <Form noValidate validated={uiState.validated} onSubmit={handleSubmit}>
        <Row>
          <Col>
            <p className={styles.fillUpTheForm}>Fill up the form to</p>
            <h1 className={styles.h1}>Create a custom dispute</h1>
          </Col>
        </Row>
        
        <hr />
        
        {/* Court Selection */}
        <Row>
          <Col xl={6} md={12} sm={24} xs={24}>
            <Form.Group>
              <Form.Label htmlFor="subcourt-dropdown">Court</Form.Label>
              <Dropdown onSelect={handleSubcourtSelect}>
                <Dropdown.Toggle 
                  id="subcourt-dropdown" 
                  block 
                  disabled={subcourtsLoading}
                  className={styles.dropdownToggle}
                >
                  <ScalesSVG className={styles.scales} />
                  <span className="font-weight-normal">
                    {subcourtsLoading 
                      ? "Loading..." 
                      : (subcourtDetails?.[formData.selectedSubcourt]?.name || "Please select a court")
                    }
                  </span>
                </Dropdown.Toggle>

                <Dropdown.Menu>
                  {subcourtDetails?.map((subcourt, index) => (
                    <Dropdown.Item 
                      key={`subcourt-${subcourt?.name || index}`} 
                      eventKey={index}
                      className={index == formData.selectedSubcourt ? "selectedDropdownItem" : ""}
                    >
                      {subcourt?.name || `Court ${index}`}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
              {getFieldError('selectedSubcourt') && (
                <Form.Control.Feedback type="invalid" style={{ display: 'block' }}>
                  {getFieldError('selectedSubcourt')}
                </Form.Control.Feedback>
              )}
            </Form.Group>
          </Col>

          {/* Arbitration Cost Display */}
          <Col xl={6} md={12} sm={24} xs={24}>
            <Form.Group className={styles.arbitrationFeeGroup}>
              <Form.Label htmlFor="arbitrationFee">Arbitration Cost</Form.Label>
              <Form.Control className={styles.spanWithSvgInside} as="span">
                <EthereumSVG />
                <span className={styles.arbitrationFee}>
                  {uiState.calculatingCost 
                    ? "Calculating..." 
                    : `${formData.arbitrationCost || "0"} ${networkMap[network]?.CURRENCY_SHORT || "ETH"}`
                  }
                </span>
              </Form.Control>
            </Form.Group>
          </Col>
        </Row>

        {/* Error Display */}
        {uiState.uploadError && (
          <Row>
            <Col>
              <div className="alert alert-danger" role="alert">
                {uiState.uploadError}
              </div>
            </Col>
          </Row>
        )}

        {/* Form Fields */}
        <Row>
          <Col>
            <Form.Group>
              <Form.Label htmlFor="title">Title *</Form.Label>
              <Form.Control
                required
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter dispute title"
                isInvalid={!!getFieldError('title')}
                maxLength={UI_CONSTANTS.FORM_VALIDATION.MAX_TITLE_LENGTH}
              />
              <Form.Control.Feedback type="invalid">
                {getFieldError('title')}
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                {formData.title.length}/{UI_CONSTANTS.FORM_VALIDATION.MAX_TITLE_LENGTH} characters
              </Form.Text>
            </Form.Group>
          </Col>
        </Row>

        <Row>
          <Col>
            <Form.Group>
              <Form.Label htmlFor="description">Description (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={5}
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                isInvalid={!!getFieldError('description')}
                placeholder="Describe the dispute"
              />
              <Form.Control.Feedback type="invalid">
                {getFieldError('description')}
              </Form.Control.Feedback>
            </Form.Group>
          </Col>
        </Row>

        {/* File Upload */}
        <Row>
          <Col>
            <Form.Group>
              <Form.Label>Primary Document (Optional)</Form.Label>
              <FileUploadDropzone
                onDrop={handleFileUpload}
                uploading={uiState.uploading}
                error={getFieldError('upload')}
                file={formData.primaryDocument}
                maxSize={UI_CONSTANTS.FILE_UPLOAD.MAX_SIZE_BYTES}
                allowedTypes={UI_CONSTANTS.FILE_UPLOAD.ALLOWED_TYPES}
              />
              {getFieldError('primaryDocument') && (
                <Form.Control.Feedback type="invalid" style={{ display: 'block' }}>
                  {getFieldError('primaryDocument')}
                </Form.Control.Feedback>
              )}
            </Form.Group>
          </Col>
        </Row>

        {/* Submit Button */}
        <Row>
          <Col>
            <Button 
              type="submit" 
              variant="primary" 
              disabled={uiState.uploading || uiState.calculatingCost}
              size="lg"
              block
            >
              {uiState.uploading 
                ? "Uploading..." 
                : uiState.calculatingCost 
                  ? "Calculating..." 
                  : "Next"
              }
            </Button>
          </Col>
        </Row>
      </Form>
    </section>
  );
};

export default CreateFormImproved;