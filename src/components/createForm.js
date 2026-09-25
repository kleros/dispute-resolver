import React from "react";
import PropTypes from "prop-types";
import { Form, Dropdown } from "react-bootstrap";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import networkMap from "../ethereum/network-contract-mapping";
import FileUploadDropzone from "./FileUploadDropzone";
import SignIn from "./signIn";

import styles from "containers/styles/create.module.css";

export const QuestionTypes = Object.freeze({
  SINGLE_SELECT: { code: "single-select", humanReadable: "Multiple choice: single select" },
  MULTIPLE_SELECT: { code: "multiple-select", humanReadable: "Multiple choice: multiple select" },
  //INT (number) and STRING (text) are not implemented in Court, so they are not offered.
  UINT: { code: "uint", humanReadable: "Non-negative number" },
  DATETIME: { code: "datetime", humanReadable: "Date" },
});

//Only the multiple choice questions have a fixed list of ruling options; the others accept any value.
export const hasRulingOptions = questionType => questionType?.code === QuestionTypes.SINGLE_SELECT.code || questionType?.code === QuestionTypes.MULTIPLE_SELECT.code;

//Marks a label of a field that must be filled; the inputs carry the required attribute for assistive technology.
const Required = () => (
  <span className={styles.required} aria-hidden="true">
    *
  </span>
);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_RULING_OPTIONS = 32;
const ADDRESS_PATTERN = "0x[a-fA-F0-9]{40}";

const INITIAL_STATE = {
  selectedSubcourt: "0",
  initialNumberOfJurors: "3",
  category: "",
  title: "",
  description: "",
  questionType: QuestionTypes.SINGLE_SELECT,
  numberOfRulingOptions: 2,
  question: "",
  rulingTitles: ["", ""],
  rulingDescriptions: [""],
  numberOfParties: 1,
  names: [],
  addresses: [],
  primaryDocument: "",
  fileInput: null,
  uploading: false,
  uploadError: "",
  arbitrationCost: "",
  //idle until a court and a number of votes are known, then loading, ready or failed.
  costStatus: "idle",
  validated: false,
};

//The values the form restores when the user comes back from the review step.
const stateFromFormData = formData => ({
  selectedSubcourt: formData.selectedSubcourt == null ? "0" : String(formData.selectedSubcourt),
  initialNumberOfJurors: formData.initialNumberOfJurors || "3",
  category: formData.category || "",
  title: formData.title || "",
  description: formData.description || "",
  question: formData.question || "",
  primaryDocument: formData.primaryDocument || "",
  fileInput: formData.fileInput || null,
  questionType: formData.questionType?.code ? formData.questionType : QuestionTypes.SINGLE_SELECT,
  numberOfRulingOptions: formData.numberOfRulingOptions ?? (formData.rulingTitles?.length || 2),
  rulingTitles: formData.rulingTitles?.length > 0 ? formData.rulingTitles : ["", ""],
  rulingDescriptions: formData.rulingDescriptions?.length > 0 ? formData.rulingDescriptions : [""],
  names: formData.names?.length > 0 ? formData.names : [],
  addresses: formData.addresses?.length > 0 ? formData.addresses : [],
  numberOfParties: formData.numberOfParties ?? Math.max(1, formData.names?.length ?? 0, formData.addresses?.length ?? 0),
  arbitrationCost: formData.arbitrationCost || "",
});

class CreateForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = props.formData ? { ...INITIAL_STATE, ...stateFromFormData(props.formData) } : INITIAL_STATE;
    this.costVersion = 0;
    this.formRef = React.createRef();
  }

  componentDidMount() {
    this.refreshArbitrationCost();
    this.syncAddressValidity();
  }

  //The subcourts are enumerated by the app and can arrive after the form mounts; only the cost depends on them.
  componentDidUpdate(prevProps, prevState) {
    if (prevProps.subcourtsLoading !== this.props.subcourtsLoading || prevProps.subcourtDetails !== this.props.subcourtDetails) this.refreshArbitrationCost();
    if (prevState.addresses !== this.state.addresses || prevState.numberOfParties !== this.state.numberOfParties) this.syncAddressValidity();
  }

  //The party before this one that already uses its address, or null. The aliases are keyed by address, so two parties
  //cannot share one: the second would silently replace the first in the review and in the meta-evidence.
  duplicateAddressOwner = index => {
    const { addresses } = this.state;
    const address = (addresses[index] ?? "").trim().toLowerCase();
    if (!address) return null;
    const owner = addresses.findIndex((other, position) => position < index && (other ?? "").trim().toLowerCase() === address);
    return owner === -1 ? null : owner;
  };

  //Keeps the browser's validity of every address input in step with the duplicate check, so the form cannot be submitted with one.
  syncAddressValidity = () => {
    const form = this.formRef.current;
    if (!form) return;
    Array.from({ length: this.state.numberOfParties }, (_, index) => form.querySelector(`#address${index}`)).forEach((input, index) => {
      input?.setCustomValidity(this.duplicateAddressOwner(index) == null ? "" : "Each party needs its own address.");
    });
  };

  componentWillUnmount() {
    this.costVersion++;
  }

  hasCourts = () => !this.props.subcourtsLoading && Array.isArray(this.props.subcourtDetails) && this.props.subcourtDetails.length > 0;

  refreshArbitrationCost = () => {
    const { selectedSubcourt, initialNumberOfJurors } = this.state;
    if (this.hasCourts()) this.calculateArbitrationCost(selectedSubcourt, initialNumberOfJurors);
  };

  //A failed read (a rejection, or the null the App handler resolves on an error) shows an error with a retry. A result of an
  //earlier request, such as a court selected before the previous cost arrived, is ignored.
  calculateArbitrationCost = async (subcourtID, noOfJurors) => {
    const version = ++this.costVersion;

    if (subcourtID == null || subcourtID === "" || !(Number(noOfJurors) >= 1)) {
      this.setState({ arbitrationCost: "", costStatus: "idle" });
      return;
    }

    this.setState({ costStatus: "loading" });
    let cost = null;
    try {
      cost = await this.props.getArbitrationCostCallback(subcourtID, noOfJurors);
    } catch (error) {
      console.error(`Error fetching arbitration cost for court ${subcourtID}:`, error);
    }

    if (version !== this.costVersion) return;
    if (cost == null) this.setState({ arbitrationCost: "", costStatus: "failed" });
    else this.setState({ arbitrationCost: String(cost), costStatus: "ready" });
  };

  onSubcourtSelect = subcourtID => {
    const selectedSubcourt = String(subcourtID);
    this.setState({ selectedSubcourt });
    this.calculateArbitrationCost(selectedSubcourt, this.state.initialNumberOfJurors);
  };

  onQuestionTypeChange = code => {
    const questionType = Object.values(QuestionTypes).find(type => type.code === code) ?? QuestionTypes.SINGLE_SELECT;
    //0 means the maximum at the smart contract, for questions without a fixed set of options.
    this.setState({ questionType, numberOfRulingOptions: hasRulingOptions(questionType) ? 2 : 0 });
  };

  onControlChange = event => {
    const { id, value } = event.target;
    this.setState({ [id]: value });
    if (id === "initialNumberOfJurors") this.calculateArbitrationCost(this.state.selectedSubcourt, value);
  };

  onNumberOfRulingOptionsChange = event => this.setState({ numberOfRulingOptions: event.target.value });

  onArrayStateVariableChange = (variable, index, value) =>
    this.setState(prevState => {
      const values = [...prevState[variable]];
      while (values.length < index) values.push("");
      values[index] = value;
      return { [variable]: values };
    });

  onRulingTitleChange = index => event => this.onArrayStateVariableChange("rulingTitles", index, event.target.value);

  onRulingDescriptionChange = index => event => this.onArrayStateVariableChange("rulingDescriptions", index, event.target.value);

  onAddParty = () => this.setState(prevState => ({ numberOfParties: prevState.numberOfParties + 1 }));

  //Drops the party's alias and address; the parties after it move up one row.
  onRemoveParty = index => () =>
    this.setState(prevState => ({
      numberOfParties: Math.max(prevState.numberOfParties - 1, 1),
      names: prevState.names.filter((_, position) => position !== index),
      addresses: prevState.addresses.filter((_, position) => position !== index),
    }));

  onNameChange = index => event => this.onArrayStateVariableChange("names", index, event.target.value);

  onAddressChange = index => event => this.onArrayStateVariableChange("addresses", index, event.target.value);

  onDrop = async acceptedFiles => {
    const file = acceptedFiles[0];
    if (!file) return;

    this.setState({ uploadError: "", fileInput: null, primaryDocument: "" });

    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.setState({ uploadError: "File is too large. Maximum size is 20MB." });
      return;
    }

    this.setState({ uploading: true });
    try {
      const primaryDocument = await this.props.publishCallback(file.name, file);
      this.setState({ primaryDocument, fileInput: file, uploading: false });
    } catch (error) {
      console.error("Upload error:", error);
      this.setState({ uploadError: "An error occurred while uploading the file. Please try again.", uploading: false });
    }
  };

  //The number of ruling option rows shown: a whole number between 1 and the maximum, otherwise none.
  rulingOptionCount = () => {
    const count = Number.parseInt(this.state.numberOfRulingOptions, 10);
    return Number.isInteger(count) && count > 0 ? Math.min(count, MAX_RULING_OPTIONS) : 0;
  };

  onNextButtonClick = event => {
    event.preventDefault();
    event.stopPropagation();

    const form = event.currentTarget;
    this.syncAddressValidity();
    const valid = form.checkValidity();
    this.setState({ validated: !valid });

    if (!valid) {
      Array.from(form.elements)
        .find(element => typeof element.checkValidity === "function" && !element.checkValidity())
        ?.focus();
      return;
    }

    const { subcourtDetails } = this.props;
    const { selectedSubcourt, initialNumberOfJurors, title, category, description, question, questionType, rulingTitles, rulingDescriptions, names, addresses, numberOfParties, primaryDocument, fileInput, arbitrationCost } = this.state;
    const withOptions = hasRulingOptions(questionType);
    const count = withOptions ? this.rulingOptionCount() : 0;
    const shown = values => Array.from({ length: count }, (_, index) => values[index] ?? "");

    this.props.onNextButtonClickCallback({
      subcourtDetails,
      selectedSubcourt,
      initialNumberOfJurors,
      title,
      category,
      description,
      question,
      questionType,
      numberOfRulingOptions: count,
      rulingTitles: shown(rulingTitles),
      rulingDescriptions: shown(rulingDescriptions),
      names,
      addresses,
      numberOfParties,
      primaryDocument,
      fileInput,
      arbitrationCost,
    });
  };

  renderArbitrationCost() {
    const { network, subcourtsLoading } = this.props;
    const { arbitrationCost, costStatus } = this.state;
    const currency = networkMap[network]?.CURRENCY_SHORT ?? "";
    const loading = costStatus === "loading" || (costStatus === "idle" && subcourtsLoading);
    const noCourts = !subcourtsLoading && !this.hasCourts();
    const failed = costStatus === "failed" || (costStatus === "idle" && noCourts);

    return (
      <div className={styles.field}>
        <span className={styles.label} id="arbitration-cost-label">
          Arbitration cost
        </span>
        <div id="arbitrationCost" className={`${styles.cost} ${failed ? styles.costFailed : ""}`} aria-labelledby="arbitration-cost-label" aria-live="polite" aria-busy={loading}>
          {loading && (
            <>
              <span className={`skeleton ${styles.costSkeleton}`} aria-hidden="true" />
              <span className={styles.srOnly}>Calculating the arbitration cost</span>
            </>
          )}
          {costStatus === "ready" && (
            <>
              <strong className={styles.costValue}>
                {arbitrationCost} {currency}
              </strong>
              <span className={styles.costHint}>Paid to the court when the dispute is created.</span>
            </>
          )}
          {costStatus === "failed" && (
            <div className={styles.costError} role="alert">
              <span>The arbitration cost could not be read.</span>
              <button type="button" className={styles.retry} onClick={this.refreshArbitrationCost}>
                Try again
              </button>
            </div>
          )}
          {!loading && costStatus === "idle" && noCourts && (
            <div className={styles.costError} role="alert">
              <span>The courts could not be loaded, so the cost is unknown. Reload the page to try again.</span>
            </div>
          )}
          {!loading && costStatus === "idle" && !noCourts && <span className={styles.costHint}>Enter at least 1 vote to see the cost.</span>}
        </div>
      </div>
    );
  }

  renderCourtSection() {
    const { subcourtsLoading, subcourtDetails } = this.props;
    const { selectedSubcourt, initialNumberOfJurors, category } = this.state;
    const courts = Array.isArray(subcourtDetails) ? subcourtDetails : [];
    const courtName = courts[Number(selectedSubcourt)]?.name;
    let toggleText = "No courts loaded";
    if (subcourtsLoading) toggleText = "Loading courts…";
    else if (courtName) toggleText = courtName;
    else if (courts.length > 0) toggleText = "Select a court";

    return (
      <section className={styles.card} aria-labelledby="create-court-heading">
        <h2 id="create-court-heading">Court</h2>
        <p className={styles.cardHint}>The court that draws the jurors and the number of votes in the first round set the arbitration cost.</p>
        <div className={styles.fieldGrid}>
          <Form.Group className={styles.field}>
            <Form.Label htmlFor="subcourt-dropdown">
              Court <Required />
            </Form.Label>
            <Dropdown className={styles.dropdown} onSelect={this.onSubcourtSelect}>
              <Dropdown.Toggle id="subcourt-dropdown" disabled={subcourtsLoading || courts.length === 0}>
                <ScalesSVG aria-hidden="true" />
                <span className={styles.dropdownText}>{toggleText}</span>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {courts.map((subcourt, index) => (
                  <Dropdown.Item key={`subcourt-${index}`} eventKey={String(index)} active={String(index) === selectedSubcourt}>
                    {subcourt?.name || `Court ${index}`}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </Form.Group>
          <Form.Group className={styles.field}>
            <Form.Label htmlFor="initialNumberOfJurors">
              Number of votes <Required />
            </Form.Label>
            <Form.Control required id="initialNumberOfJurors" type="number" min="1" step="1" value={initialNumberOfJurors} onChange={this.onControlChange} />
            <Form.Control.Feedback type="invalid">Enter a whole number of votes, at least 1.</Form.Control.Feedback>
          </Form.Group>
          <Form.Group className={styles.field}>
            <Form.Label htmlFor="category">Category</Form.Label>
            <Form.Control id="category" value={category} onChange={this.onControlChange} placeholder="For example: Escrow" />
          </Form.Group>
          {this.renderArbitrationCost()}
        </div>
      </section>
    );
  }

  renderDisputeSection() {
    const { title, description } = this.state;

    return (
      <section className={styles.card} aria-labelledby="create-dispute-heading">
        <h2 id="create-dispute-heading">Dispute</h2>
        <p className={styles.cardHint}>The title and the description are shown to the jurors and on the case page.</p>
        <div className={styles.stack}>
          <Form.Group className={styles.field}>
            <Form.Label htmlFor="title">
              Title <Required />
            </Form.Label>
            <Form.Control required id="title" value={title} onChange={this.onControlChange} placeholder="What the dispute is about, in one line" />
            <Form.Control.Feedback type="invalid">Enter a title that sums up the dispute.</Form.Control.Feedback>
          </Form.Group>
          <Form.Group className={styles.field}>
            <Form.Label htmlFor="description">Description</Form.Label>
            <Form.Control id="description" as="textarea" rows="5" value={description} onChange={this.onControlChange} placeholder="The context the jurors need to rule" />
          </Form.Group>
        </div>
      </section>
    );
  }

  renderRulingOptions() {
    const { questionType, rulingTitles, rulingDescriptions } = this.state;
    if (!hasRulingOptions(questionType)) return null;

    return (
      <div className={styles.rows}>
        {Array.from({ length: this.rulingOptionCount() }, (_, index) => (
          <div key={`ruling-${index}`} className={styles.row}>
            <Form.Group className={styles.field}>
              <Form.Label htmlFor={`rulingOption${index}Title`}>
                Ruling option {index + 1} <Required />
              </Form.Label>
              <Form.Control required id={`rulingOption${index}Title`} value={rulingTitles[index] ?? ""} onChange={this.onRulingTitleChange(index)} placeholder={`Ruling option ${index + 1}`} />
              <Form.Control.Feedback type="invalid">Enter ruling option {index + 1}, for example "Yes".</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className={styles.field}>
              <Form.Label htmlFor={`rulingOption${index}Description`}>Description</Form.Label>
              <Form.Control id={`rulingOption${index}Description`} value={rulingDescriptions[index] ?? ""} onChange={this.onRulingDescriptionChange(index)} placeholder={`What ruling option ${index + 1} means`} />
            </Form.Group>
          </div>
        ))}
      </div>
    );
  }

  renderQuestionSection() {
    const { questionType, numberOfRulingOptions, question } = this.state;

    return (
      <section className={styles.card} aria-labelledby="create-question-heading">
        <h2 id="create-question-heading">Question</h2>
        <p className={styles.cardHint}>The jurors answer this question with one of the ruling options.</p>
        <div className={styles.stack}>
          <div className={styles.fieldGrid}>
            <Form.Group className={styles.field}>
              <Form.Label htmlFor="questionType">
                Question type <Required />
              </Form.Label>
              <Dropdown className={styles.dropdown} onSelect={this.onQuestionTypeChange}>
                <Dropdown.Toggle id="questionType">
                  <span className={styles.dropdownText}>{questionType.humanReadable}</span>
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {Object.values(QuestionTypes).map(type => (
                    <Dropdown.Item key={`questionType-${type.code}`} eventKey={type.code} active={type.code === questionType.code}>
                      {type.humanReadable}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            </Form.Group>
            {hasRulingOptions(questionType) && (
              <Form.Group className={styles.field}>
                <Form.Label htmlFor="numberOfRulingOptions">
                  Number of options <Required />
                </Form.Label>
                <Form.Control required id="numberOfRulingOptions" type="number" min="2" max={MAX_RULING_OPTIONS} step="1" value={numberOfRulingOptions} onChange={this.onNumberOfRulingOptionsChange} />
                <Form.Control.Feedback type="invalid">Enter a whole number between 2 and {MAX_RULING_OPTIONS}.</Form.Control.Feedback>
              </Form.Group>
            )}
          </div>
          <Form.Group className={styles.field}>
            <Form.Label htmlFor="question">
              Question <Required />
            </Form.Label>
            <Form.Control required id="question" value={question} onChange={this.onControlChange} placeholder="The question the jurors will answer" />
            <Form.Control.Feedback type="invalid">Enter the question the jurors will answer.</Form.Control.Feedback>
          </Form.Group>
          {this.renderRulingOptions()}
        </div>
      </section>
    );
  }

  renderPartiesSection() {
    const { numberOfParties, names, addresses } = this.state;

    return (
      <section className={styles.card} aria-labelledby="create-parties-heading">
        <h2 id="create-parties-heading">Parties</h2>
        <p className={styles.cardHint}>An alias replaces the address of a party wherever the case is shown. Each alias needs its address, and each address its alias.</p>
        <div className={styles.parties}>
          {Array.from({ length: numberOfParties }, (_, index) => (
            <div key={`party-${index}`} className={styles.partyBlock}>
              <div className={styles.partyHeader}>
                <h3>Party {index + 1}</h3>
                {numberOfParties > 1 && (
                  <button type="button" className={styles.removeParty} onClick={this.onRemoveParty(index)} aria-label={`Remove party ${index + 1}`}>
                    Remove
                  </button>
                )}
              </div>
              <div className={styles.row}>
                <Form.Group className={styles.field}>
                  <Form.Label htmlFor={`name${index}`}>Alias</Form.Label>
                  <Form.Control required={Boolean(addresses[index])} id={`name${index}`} value={names[index] ?? ""} onChange={this.onNameChange(index)} placeholder="For example: Buyer" />
                  <Form.Control.Feedback type="invalid">Enter an alias for this address.</Form.Control.Feedback>
                </Form.Group>
                <Form.Group className={styles.field}>
                  <Form.Label htmlFor={`address${index}`}>Address</Form.Label>
                  <Form.Control required={Boolean(names[index])} pattern={ADDRESS_PATTERN} id={`address${index}`} value={addresses[index] ?? ""} onChange={this.onAddressChange(index)} placeholder="0x…" />
                  <Form.Control.Feedback type="invalid">
                  {this.duplicateAddressOwner(index) == null
                    ? "Enter the address of this party: 0x followed by 40 hexadecimal characters."
                    : `Party ${this.duplicateAddressOwner(index) + 1} already uses this address. Each party needs its own address.`}
                </Form.Control.Feedback>
                </Form.Group>
              </div>
            </div>
          ))}
          <div className={styles.rowActions}>
            <button type="button" className={styles.secondaryAction} onClick={this.onAddParty}>
              Add another party
            </button>
          </div>
        </div>
      </section>
    );
  }

  renderDocumentSection() {
    const { fileInput, uploading, uploadError, primaryDocument } = this.state;
    const { isAuthenticated, isSigningIn, onSignIn } = this.props;
    const fileName = fileInput?.name ?? (primaryDocument ? primaryDocument.split("/").slice(-1)[0] : "");

    return (
      <section className={styles.card} aria-labelledby="create-document-heading">
        <h2 id="create-document-heading">Primary document</h2>
        <p className={styles.cardHint}>The agreement or the main evidence the jurors should read, published to IPFS.</p>
        {!isAuthenticated && <SignIn onSignIn={onSignIn} isSigningIn={isSigningIn} />}
        <FileUploadDropzone onDrop={this.onDrop} uploadingToIPFS={uploading} uploadError={uploadError} disabled={!isAuthenticated || uploading} />
        {fileName && (
          <p className={styles.selectedFile}>
            <AttachmentSVG aria-hidden="true" />
            <span>
              <strong>Selected file:</strong> {fileName}
            </span>
          </p>
        )}
      </section>
    );
  }

  render() {
    const { validated } = this.state;

    return (
      <Form ref={this.formRef} noValidate validated={validated} onSubmit={this.onNextButtonClick} className={styles.form}>
        <p className={styles.requiredNote}>
          Fields marked <Required /> are required.
        </p>
        {this.renderCourtSection()}
        {this.renderDisputeSection()}
        {this.renderQuestionSection()}
        {this.renderPartiesSection()}
        {this.renderDocumentSection()}
        <div className={styles.actions}>
          <button type="submit" className={styles.action}>
            Continue to review
          </button>
        </div>
      </Form>
    );
  }
}

CreateForm.propTypes = {
  getArbitrationCostCallback: PropTypes.func.isRequired,
  publishCallback: PropTypes.func,
  onNextButtonClickCallback: PropTypes.func.isRequired,
  subcourtDetails: PropTypes.array,
  subcourtsLoading: PropTypes.bool,
  formData: PropTypes.object,
  network: PropTypes.string,
  isAuthenticated: PropTypes.bool.isRequired,
  isSigningIn: PropTypes.bool.isRequired,
  onSignIn: PropTypes.func.isRequired,
};

export default CreateForm;
