import React from "react";
import PropTypes from "prop-types";
import { Spinner } from "react-bootstrap";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { ReactComponent as SuccessIcon } from "../assets/images/iconCheckCircle.svg";
import { ReactComponent as FailureIcon } from "../assets/images/iconXCircle.svg";
import networkMap from "../ethereum/network-contract-mapping";
import { urlNormalize } from "../utils/urlNormalizer";
import SignIn from "./signIn";
import { QuestionTypes, hasRulingOptions } from "./createForm";

import styles from "containers/styles/create.module.css";

//What the page says about the creation while it is pending and once it has succeeded or failed.
const WRITE_FEEDBACK = {
  pending: ["Creating the dispute", "Waiting for the upload and the transaction to be confirmed."],
  success: ["Dispute created", "Opening the case…"],
  failure: ["Dispute creation failed", "Check you have the necessary funds and try again. If the error persists, contact support."],
};

//The options App.createDispute receives, built from the form as before: a multiple-select question registers one ruling
//per combination of its options, and the aliases map each address to the name given next to it.
export const buildCreateDisputeOptions = formData => {
  const rulingTitles = formData.rulingTitles ?? [];
  const numberOfRulingOptions = formData.questionType.code === QuestionTypes.MULTIPLE_SELECT.code ? Math.pow(2, rulingTitles.length) : rulingTitles.length;
  const aliases = {};
  (formData.names ?? []).forEach((name, index) => {
    if (typeof name === "string" && name.trim() !== "") aliases[formData.addresses?.[index]] = name;
  });

  return {
    selectedSubcourt: formData.selectedSubcourt,
    initialNumberOfJurors: formData.initialNumberOfJurors,
    title: formData.title,
    category: formData.category,
    description: formData.description,
    aliases,
    question: formData.question,
    primaryDocument: formData.primaryDocument,
    numberOfRulingOptions,
    rulingOptions: {
      type: formData.questionType.code,
      titles: rulingTitles,
      descriptions: formData.rulingDescriptions ?? [],
    },
  };
};

//How many rulings the court will accept, in words.
const describeRulings = (questionType, numberOfRulingOptions, optionCount) => {
  if (!hasRulingOptions(questionType)) return questionType.code === QuestionTypes.UINT.code ? "Any non-negative number" : "Any date";
  if (questionType.code === QuestionTypes.MULTIPLE_SELECT.code) return `${numberOfRulingOptions} rulings: any combination of the ${optionCount} options`;
  return `${numberOfRulingOptions} ruling options`;
};

class CreateSummary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { writeStatus: null };
  }

  componentWillUnmount() {
    this.unmounted = true;
  }

  setWriteStatus = writeStatus => {
    if (!this.unmounted) this.setState({ writeStatus });
  };

  dismissWriteStatus = () => this.setWriteStatus(null);

  //The App handler resolves null when the transaction fails and a receipt without an ID when the DisputeCreation event is missing.
  onCreateButtonClick = async () => {
    const { formData, createDisputeCallback, onDisputeCreated, isAuthenticated } = this.props;
    if (!isAuthenticated) return;

    this.setWriteStatus({ status: "pending" });
    try {
      const result = await createDisputeCallback(buildCreateDisputeOptions(formData));
      if (result == null) {
        this.setWriteStatus({ status: "failure" });
        return;
      }

      this.setWriteStatus({ status: "success", disputeID: result.disputeID, hash: result.receipt?.hash });
      if (result.disputeID != null) onDisputeCreated(result.disputeID);
    } catch (error) {
      console.error("Error creating dispute:", error);
      this.setWriteStatus({ status: "failure", error: error?.message });
    }
  };

  renderWriteStatus() {
    const { writeStatus } = this.state;
    if (!writeStatus) return null;

    const { status, disputeID, hash, error } = writeStatus;
    let [title, content] = WRITE_FEEDBACK[status];
    if (status === "success" && disputeID != null) title = `Dispute ${disputeID} created`;
    if (status === "success" && disputeID == null) content = "The dispute ID could not be read from the transaction. The new case is listed on the Ongoing Disputes page.";
    const Icon = status === "success" ? SuccessIcon : FailureIcon;

    return (
      <div className={`${styles.writeStatus} ${styles[status]}`} role={status === "failure" ? "alert" : "status"}>
        {status === "pending" ? <Spinner as="span" animation="border" size="sm" aria-hidden="true" /> : <Icon aria-hidden="true" />}
        <div className={styles.writeStatusText}>
          <strong>{title}</strong>
          <span>{content}</span>
          {hash && <small>Transaction {`${hash.slice(0, 10)}…${hash.slice(-8)}`}</small>}
          {error && <small>{error}</small>}
        </div>
        {status === "failure" && (
          <button type="button" className={styles.dismiss} onClick={this.dismissWriteStatus}>
            Dismiss
          </button>
        )}
      </div>
    );
  }

  renderDisputeCard() {
    const { formData, network } = this.props;
    const courtName = formData.subcourtDetails?.[Number(formData.selectedSubcourt)]?.name ?? `Court ${formData.selectedSubcourt}`;
    const currency = networkMap[network]?.CURRENCY_SHORT ?? "";

    return (
      <section className={styles.card} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>
          {formData.title}
        </h2>
        {formData.description && <p className={styles.description}>{formData.description}</p>}
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Court</dt>
            <dd id="summary-court">
              <ScalesSVG aria-hidden="true" />
              <span>{courtName}</span>
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>Number of votes</dt>
            <dd id="summary-votes">{formData.initialNumberOfJurors}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Category</dt>
            <dd id="summary-category">{formData.category || "None"}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Arbitration cost</dt>
            <dd id="summary-cost">{formData.arbitrationCost ? `${formData.arbitrationCost} ${currency}` : "Not read"}</dd>
          </div>
        </dl>
      </section>
    );
  }

  renderQuestionCard() {
    const { formData } = this.props;
    const options = buildCreateDisputeOptions(formData);
    const titles = formData.rulingTitles ?? [];

    return (
      <section className={styles.card} aria-labelledby="summary-question-heading">
        <h2 id="summary-question-heading">Question</h2>
        <p className={styles.questionType}>{formData.questionType.humanReadable}</p>
        <p className={styles.questionText} id="summary-question">
          {formData.question}
        </p>
        {titles.length > 0 && (
          <ol className={styles.options}>
            {titles.map((title, index) => (
              <li key={`ruling-${index}`}>
                <span className={styles.optionCode}>Option {index + 1}</span>
                <span className={styles.optionTitle}>{title}</span>
                {formData.rulingDescriptions?.[index] && <span className={styles.optionDescription}>{formData.rulingDescriptions[index]}</span>}
              </li>
            ))}
          </ol>
        )}
        <p className={styles.note} id="summary-rulings">
          Rulings registered with the court: {describeRulings(formData.questionType, options.numberOfRulingOptions, titles.length)}.
        </p>
      </section>
    );
  }

  //Every party with an alias, in the order of the form. The form refuses two parties with one address, so this list is
  //exactly what the aliases of the meta-evidence will hold.
  renderPartiesCard() {
    const { formData } = this.props;
    const parties = (formData.names ?? [])
      .map((name, index) => ({ name, address: formData.addresses?.[index] ?? "" }))
      .filter(party => typeof party.name === "string" && party.name.trim() !== "");
    if (parties.length === 0) return null;

    return (
      <section className={styles.card} aria-labelledby="summary-parties-heading">
        <h2 id="summary-parties-heading">Parties</h2>
        <dl className={styles.facts}>
          {parties.map((party, index) => (
            <div key={`party-${index}`} className={`${styles.fact} ${styles.party}`}>
              <dt>{party.name}</dt>
              <dd>{party.address}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  renderDocumentCard() {
    const { formData } = this.props;
    if (!formData.primaryDocument) return null;
    const fileName = formData.fileInput?.name ?? formData.primaryDocument.split("/").slice(-1)[0];

    return (
      <section className={styles.card} aria-labelledby="summary-document-heading">
        <h2 id="summary-document-heading">Primary document</h2>
        <a href={urlNormalize(formData.primaryDocument)} target="_blank" rel="noopener noreferrer" className={styles.document}>
          <AttachmentSVG aria-hidden="true" />
          <span>{fileName}</span>
        </a>
      </section>
    );
  }

  render() {
    const { formData, onReturnButtonClickCallback, isAuthenticated, isSigningIn, onSignIn } = this.props;
    const { writeStatus } = this.state;
    const pending = writeStatus?.status === "pending";
    const created = writeStatus?.status === "success";

    return (
      <div>
        {this.renderDisputeCard()}
        {this.renderQuestionCard()}
        {this.renderPartiesCard()}
        {this.renderDocumentCard()}
        <section className={styles.card} aria-labelledby="summary-create-heading">
          <h2 id="summary-create-heading">Create the dispute</h2>
          <p className={styles.cardHint}>The details above are published to IPFS as the meta-evidence, then the dispute is created and the arbitration cost is paid.</p>
          {!isAuthenticated && <SignIn onSignIn={onSignIn} isSigningIn={isSigningIn} message="Sign in with Ethereum to publish the dispute data to IPFS and create the dispute." />}
          {this.renderWriteStatus()}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryAction} onClick={onReturnButtonClickCallback} disabled={pending || created}>
              Back
            </button>
            <button type="button" className={styles.action} onClick={this.onCreateButtonClick} disabled={pending || created || !isAuthenticated}>
              {pending ? "Creating…" : "Create dispute"}
            </button>
          </div>
        </section>
      </div>
    );
  }
}

CreateSummary.propTypes = {
  formData: PropTypes.shape({
    subcourtDetails: PropTypes.array,
    selectedSubcourt: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    initialNumberOfJurors: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string,
    category: PropTypes.string,
    description: PropTypes.string,
    question: PropTypes.string,
    questionType: PropTypes.shape({ code: PropTypes.string, humanReadable: PropTypes.string }),
    rulingTitles: PropTypes.array,
    rulingDescriptions: PropTypes.array,
    names: PropTypes.array,
    addresses: PropTypes.array,
    primaryDocument: PropTypes.string,
    fileInput: PropTypes.object,
    arbitrationCost: PropTypes.string,
  }).isRequired,
  network: PropTypes.string,
  createDisputeCallback: PropTypes.func.isRequired,
  onReturnButtonClickCallback: PropTypes.func.isRequired,
  onDisputeCreated: PropTypes.func.isRequired,
  isAuthenticated: PropTypes.bool.isRequired,
  isSigningIn: PropTypes.bool.isRequired,
  onSignIn: PropTypes.func.isRequired,
};

export default CreateSummary;
