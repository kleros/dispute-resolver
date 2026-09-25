import { Button, Spinner } from "react-bootstrap";
import React from "react";
import PropTypes from "prop-types";
import Countdown from "react-countdown";
import * as realitioLibQuestionFormatter from "@reality.eth/reality-eth-lib/formatters/question";
import { ReactComponent as AvatarSVG } from "../assets/images/avatar.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as InfoSVG } from "../assets/images/info.svg";
import { ReactComponent as Hourglass } from "../assets/images/hourglass.svg";
import { ReactComponent as SuccessIcon } from "../assets/images/iconCheckCircle.svg";
import { ReactComponent as FailureIcon } from "../assets/images/iconXCircle.svg";

import DisputeTimeline from "components/disputeTimeline";
import EvidenceTimeline from "components/evidenceTimeline";
import CrowdfundingCard from "components/crowdfundingCard";
import { PERIOD_NAMES, PERIOD_CLASSES, getDisputeTitle, renderCountdown } from "components/ongoing-card";
import { ethers } from "ethers";
import networkMap from "../ethereum/network-contract-mapping";

import AlertMessage from "components/alertMessage";

import styles from "components/styles/disputeDetails.module.css";
import statusStyles from "components/styles/ongoing-card.module.css";

// Constants to avoid magic numbers
const PRECISION_SCALING_FACTOR = 1000n;
const PRECISION_SCALING_DIVISOR = 1000;
const PERCENTAGE_SCALING_FACTOR = 10000n;
const PERCENTAGE_SCALING_DIVISOR = 100;
const DISPUTE_PERIOD_APPEAL = 3;
const DISPUTE_PERIOD_EXECUTION = 4;
const BINARY_PADDING_WIDTH = 4;
const HEX_PREFIX_LENGTH = 2;

const QuestionTypes = Object.freeze({
  "single-select": "Multiple choice: single select",
  "multiple-select": "Multiple choice: multiple select",
  uint: "Non-negative number",
  int: "Number",
  string: "Text",
  datetime: "Date",
  hash: "Hash"
});

//What the page says about a write action while it is pending and once it has succeeded or failed.
const WRITE_FEEDBACK = Object.freeze({
  fund: {
    pending: ["Contribution pending", "Waiting for the transaction to be confirmed."],
    success: ["Contribution sent", "The funding status of the options has been refreshed."],
    failure: ["Contribution failed", "No funds were sent. Check your wallet and try again."],
  },
  withdraw: {
    pending: ["Withdrawal pending", "Waiting for the transaction to be confirmed."],
    success: ["Withdrawal sent", "The transaction has been confirmed."],
    failure: ["Withdrawal failed", "Nothing was withdrawn. Check your wallet and try again."],
  },
  evidence: {
    pending: ["Evidence submission pending", "Waiting for the upload and the transaction to be confirmed."],
    success: ["Evidence submitted", "The evidence has been added to the list below."],
    failure: ["Evidence submission failed", "Nothing was submitted. Check your wallet and try again."],
  },
});

class DisputeDetails extends React.Component {
  componentDidUpdate(previousProperties) {
    if (this.props.network !== previousProperties.network)
      window.location.reload();
  }

  calculateTotalCost = rulingOption => {
    // Unslashed contract violates IDisputeResolver interface by not letting option 0: refuse to rule to be funded.
    // Subsequently, in case of a ruling 0, contract considers remaining ruling options as winners, instead of losers.
    // Therefore we have to make an exception in this function for the following list of irregular contracts.

    const { currentRuling, appealCost, multipliers, exceptionalContractAddresses, arbitrated } = this.props;

    //Means it is an EscrowV1 dispute, for which there are no calculations needed
    if (networkMap[this.props.network].ESCROW_V1_CONTRACTS.includes(arbitrated)) {
      return appealCost;
    }

    let stake;

    if (currentRuling == rulingOption || (exceptionalContractAddresses.includes(arbitrated) && currentRuling == 0)) {
      stake = (appealCost * multipliers.winnerStakeMultiplier) / multipliers.denominator;
    } else {
      return this.calculateAmountRemainsToBeRaisedForLoser();
    }

    return appealCost + stake;
  };

  calculateAmountRemainsToBeRaised = rulingOption => {
    const { contributions } = this.props;
    const raisedSoFar = contributions[rulingOption] ?? 0;

    return this.calculateTotalCost(rulingOption) - BigInt(raisedSoFar);
  };

  calculateAmountRemainsToBeRaisedForLoser = () => {
    const { appealCost, multipliers } = this.props;
    const stake = (appealCost * multipliers.loserStakeMultiplier) / multipliers.denominator;

    return BigInt(appealCost) + BigInt(stake);
  };

  calculateReturnOfInvestmentRatio = rulingOption => {
    // Unslashed contract violates IDisputeResolver interface by not letting option 0: refuse to rule to be funded.
    // Subsequently, in case of a ruling 0, contract considers remaining ruling options as winners, instead of losers.
    // Therefore we have to make an exception in this function for the following list of irregular contracts.

    const { currentRuling, multipliers, exceptionalContractAddresses, arbitrated } = this.props;

    const winner = multipliers.winnerStakeMultiplier;
    const loser = multipliers.loserStakeMultiplier;
    const divisor = multipliers.denominator;

    if (currentRuling == rulingOption || (exceptionalContractAddresses.includes(arbitrated) && currentRuling == 0)) {
      return Number((winner + loser + divisor) * PRECISION_SCALING_FACTOR / (winner + divisor)) / PRECISION_SCALING_DIVISOR;
    } else {
      return Number((winner + loser + divisor) * PRECISION_SCALING_FACTOR / (loser + divisor)) / PRECISION_SCALING_DIVISOR;
    }
  };

  calculateReturnOfInvestmentRatioForLoser = () => {
    const { multipliers } = this.props;
    const winner = multipliers.winnerStakeMultiplier;
    const loser = multipliers.loserStakeMultiplier;
    const divisor = multipliers.denominator;

    return Number((winner + loser + divisor) * PRECISION_SCALING_FACTOR / (loser + divisor)) / PRECISION_SCALING_DIVISOR;
  };

  calculateAppealPeriod = rulingOption => {
    const { currentRuling, multipliers, appealPeriod, exceptionalContractAddresses, arbitrated } = this.props;

    if (currentRuling == rulingOption || (exceptionalContractAddresses.includes(arbitrated) && currentRuling == 0)) {
      return appealPeriod.end;
    }

    const { start, end } = appealPeriod;
    const loserMultiplier = multipliers.loserAppealPeriodMultiplier;
    const denominator = multipliers.denominator;

    return Number(start + (end - start) * loserMultiplier / denominator);
  };

  calculateLoserAppealPeriod = () => {
    const { multipliers, appealPeriod } = this.props;

    const { start, end } = appealPeriod;
    const loserMultiplier = multipliers.loserAppealPeriodMultiplier;
    const denominator = multipliers.denominator;

    return Number(start + (end - start) * loserMultiplier / denominator);
  };

  calculateFundingPercentage = (rulingOption, contributions) => {
    const totalCost = this.calculateTotalCost(rulingOption);
    const raisedSoFar = contributions[rulingOption] ?? 0;

    if (totalCost === 0) return 0;

    const scaled = (BigInt(raisedSoFar) * PERCENTAGE_SCALING_FACTOR) / totalCost;
    return Number(scaled) / PERCENTAGE_SCALING_DIVISOR;
  }

  // Helper method to validate and process hex strings
  processHexValue = hashValue => {
    const hexWithoutPrefix = hashValue.slice(HEX_PREFIX_LENGTH);

    if (hexWithoutPrefix === '') {
      throw new Error('Invalid hex value: empty hex string');
    }

    if (!/^[0-9a-fA-F]+$/.test(hexWithoutPrefix)) {
      throw new Error(`Invalid hex value: contains non-hex characters: ${hashValue}`);
    }

    const numericValue = BigInt('0x' + hexWithoutPrefix);
    return (numericValue - 1n).toString(16);
  };

  // Helper method to process numeric strings
  processNumericValue = hashValue => {
    if (hashValue.includes('e') || hashValue.includes('E')) {
      throw new Error(`Hash value precision lost during processing. Please report this issue.`);
    }

    try {
      const numericValue = BigInt(hashValue);
      return (numericValue - 1n).toString(16);
    } catch (error) {
      throw new Error(`Invalid hash value: not a valid number or hex string: ${hashValue}. ${error.message}`);
    }
  };

  // Helper method to process hash type rulings
  processHashRuling = (currentRuling, metaEvidenceJSON) => {
    const hashValue = currentRuling.toString();
    const isHexString = /^0x/i.test(hashValue);

    const finalHexValue = isHexString
      ? this.processHexValue(hashValue)
      : this.processNumericValue(hashValue);

    return realitioLibQuestionFormatter.getAnswerString(
      {
        decimals: metaEvidenceJSON.rulingOptions.precision,
        outcomes: metaEvidenceJSON.rulingOptions.titles,
        type: "hash",
      },
      realitioLibQuestionFormatter.padToBytes32(finalHexValue)
    );
  };

  // Helper method to process numeric type rulings
  processNumericRuling = (currentRuling, metaEvidenceJSON) => {
    const rulingStr = currentRuling.toString();
    let rulingValue;

    if (rulingStr.includes('e') || rulingStr.includes('E')) {
      const numValue = Number(rulingStr);
      if (!isFinite(numValue)) {
        throw new Error(`Invalid number: ${rulingStr}`);
      }
      rulingValue = BigInt(Math.floor(numValue));
    } else {
      rulingValue = BigInt(rulingStr);
    }

    return realitioLibQuestionFormatter.getAnswerString(
      {
        decimals: metaEvidenceJSON.rulingOptions.precision,
        outcomes: metaEvidenceJSON.rulingOptions.titles,
        type: metaEvidenceJSON.rulingOptions.type,
      },
      realitioLibQuestionFormatter.padToBytes32((rulingValue - 1n).toString(16))
    );
  };

  // Helper to find Reality.eth outcomes from various possible locations
  findRealityOutcomes = (metaEvidenceJSON) => {
    const possiblePaths = [
      metaEvidenceJSON?.dispute?.template?.outcomes,
      metaEvidenceJSON?.template?.outcomes,
      metaEvidenceJSON?.outcomes,
      metaEvidenceJSON?.question?.outcomes
    ];
    return possiblePaths.find(outcomes => outcomes && Array.isArray(outcomes) && outcomes.length > 0);
  };

  convertToRealitioFormat = (currentRuling, metaEvidenceJSON) => {
    try {
      if (!metaEvidenceJSON?.rulingOptions) {
        const realityOutcomes = this.findRealityOutcomes(metaEvidenceJSON);
        if (realityOutcomes) {
          const rulingIndex = parseInt(currentRuling, 10) - 1;
          if (rulingIndex >= 0 && rulingIndex < realityOutcomes.length) {
            return realityOutcomes[rulingIndex];
          }
        }
        return currentRuling.toString();
      }

      const questionType = metaEvidenceJSON.rulingOptions.type;

      // For hash type rulings, preserve precision by handling as hex strings
      // Apply Reality.eth -1 offset consistently for both hex and numeric inputs
      if (questionType === "hash") {
        return this.processHashRuling(currentRuling, metaEvidenceJSON);
      }

      // For numeric types, apply the original logic
      return this.processNumericRuling(currentRuling, metaEvidenceJSON);
    } catch (error) {
      console.error('Error converting ruling to Realitio format:', error, 'currentRuling:', currentRuling);
      // Fallback: return a default string or the original value
      return currentRuling.toString();
    }
  };

  getWinner = (rulingFunded, currentRuling) => {
    if (rulingFunded && rulingFunded.length == 1) return rulingFunded[0];
    else return currentRuling;
  };

  // Helper method to render decision alert messages
  renderDecisionAlerts = (disputePeriod, currentRuling, metaevidenceJSON, rulingFunded, incompatible) => {
    const decisionInfoBoxContent = `This decision can be appealed within appeal period. ${incompatible ? "Go to arbitrable application to appeal this ruling." : ""}`;

    //The current ruling could not be read; showing option 0 instead would look like a real "refuse to arbitrate" decision.
    if ((disputePeriod == DISPUTE_PERIOD_APPEAL || disputePeriod == DISPUTE_PERIOD_EXECUTION) && currentRuling == null) {
      return <AlertMessage type="warning" extraClass={styles.alert} title="Jury decision unavailable" content="The current ruling could not be read from the arbitrator." />;
    }

    const formatRulingForDisplay = ruling => {
      if (ruling == 0) return "invalid / refused to arbitrate / tied";

      if (metaevidenceJSON?.rulingOptions?.type === "hash") {
        // For hash type, display the raw hex value without Reality.eth conversion
        return `0x${BigInt(ruling).toString(16).padStart(64, '0')}`;
      } else {
        return this.convertToRealitioFormat(ruling, metaevidenceJSON);
      }
    };

    if (disputePeriod == DISPUTE_PERIOD_APPEAL) {
      return (
        <AlertMessage
          type="info"
          extraClass={styles.alert}
          title={`Jury decision: ${formatRulingForDisplay(currentRuling)}`}
          content={decisionInfoBoxContent}
        />
      );
    }

    if (disputePeriod == DISPUTE_PERIOD_EXECUTION) {
      return (
        <AlertMessage
          type="info"
          extraClass={styles.alert}
          title={`Winner: ${formatRulingForDisplay(this.getWinner(rulingFunded, currentRuling))}`}
          content={`${rulingFunded && rulingFunded.length == 1 ? "Won by default" : "Won by jury decision"}`}
        />
      );
    }

    return null;
  };

  // Helper method to render dispute info section. Unknown values are shown as unavailable, never as a number.
  renderDisputeInfo = (arbitratorDisputeID, arbitratorDisputeDetails, arbitratorDispute, subcourtDetails, arbitrated) => {
    const numberOfVotes = Number.parseInt(arbitratorDisputeDetails?.votesLengths?.[0], 10);
    const courtName = subcourtDetails?.[arbitratorDispute.subcourtID?.toString()]?.name;
    const hasCourtName = typeof courtName === "string" && courtName.trim() !== "";

    return (
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Dispute</dt>
          <dd id="category">
            <i className="purple-primary">#</i> {arbitratorDisputeID}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Court</dt>
          <dd id="court">
            <ScalesSVG aria-hidden="true" />
            <span>{hasCourtName ? courtName : "Court unavailable"}</span>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Number of votes</dt>
          <dd id="initialNumberOfJurors">
            <AvatarSVG aria-hidden="true" />
            <span>{Number.isNaN(numberOfVotes) ? "Unavailable" : numberOfVotes}</span>
          </dd>
        </div>
        <div className={`${styles.fact} ${styles.contract}`}>
          <dt>Arbitrable contract</dt>
          <dd>{arbitrated}</dd>
        </div>
      </dl>
    );
  };

  //The text of the withdrawal section. An unknown amount is said to be unknown rather than shown as nothing to withdraw.
  getWithdrawalText = totalWithdrawable => {
    if (totalWithdrawable == null) return "The amount you can withdraw could not be read from the arbitrable contract.";
    if (parseInt(totalWithdrawable, 10) != 0) {
      return "If you have contributed to a ruling option and in the end that ruling option was the winner you are eligible for some reward. Also, if you have contributed but appeal did not happen your contribution is refunded.";
    }
    return "You don't have any amount to withdraw. Reason might be that you did not contribute, the ruling option you have contributed did not win, you already withdrew or the ruling is not executed yet by the arbitrator.";
  };

  //Crowdfunding cards need every input of the fee and deadline calculations; a missing one shows the reason instead of wrong amounts.
  renderCrowdfundingUnavailable = multipliers => {
    if (!multipliers) {
      return (
        <AlertMessage
          type="warning"
          extraClass={styles.alert}
          title="Appeal fees could not be calculated"
          content="This arbitrable contract uses an unsupported appeal interface, so the appeal funding amounts and deadlines can't be shown. Please use the arbitrable application to appeal."
        />
      );
    }
    return (
      <AlertMessage
        type="warning"
        extraClass={styles.alert}
        title="Appeal options unavailable"
        content="Some of the data needed to show the appeal funding amounts and deadlines could not be loaded. Please refresh the page or try again later."
      />
    );
  };

  //Feedback of the last write action, next to the section it belongs to. Failures are announced; the rest is polite.
  renderWriteStatus = action => {
    const { writeStatus, onDismissWriteStatus } = this.props;
    if (writeStatus?.action !== action) return null;

    const { status, hash, error } = writeStatus;
    const [title, content] = WRITE_FEEDBACK[action][status];
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
        {status !== "pending" && (
          <button type="button" className={styles.dismiss} onClick={onDismissWriteStatus}>
            Dismiss
          </button>
        )}
      </div>
    );
  };

  //The end of the appeal period for the side of the jury decision and, earlier, for every other option.
  //Same rule as calculateAppealPeriod: on the exceptional contracts a ruling of 0 leaves every option the full period.
  renderAppealDeadlines = () => {
    const { appealPeriod, multipliers, currentRuling, exceptionalContractAddresses, arbitrated, loading } = this.props;

    if (loading) {
      return (
        <div className={styles.deadlines} aria-hidden="true">
          <span className={`skeleton ${styles.skeletonDeadline}`} />
          <span className={`skeleton ${styles.skeletonDeadline}`} />
        </div>
      );
    }

    const everyOptionHasFullPeriod = exceptionalContractAddresses.includes(arbitrated) && currentRuling == 0;
    let otherOptionsDeadline = null;
    if (appealPeriod) otherOptionsDeadline = everyOptionHasFullPeriod ? appealPeriod.end : multipliers && this.calculateLoserAppealPeriod();

    return (
      <dl className={styles.deadlines}>
        {this.renderDeadline("Deadline for the jury decision", appealPeriod?.end ?? null)}
        {this.renderDeadline("Deadline for other options", otherOptionsDeadline)}
      </dl>
    );
  };

  renderDeadline = (label, deadline) => (
    <div className={styles.deadline}>
      <dt>{label}</dt>
      <dd>
        <Hourglass aria-hidden="true" />
        {deadline == null ? <span>Unavailable</span> : <Countdown date={1000 * Number.parseInt(deadline, 10)} now={this.props.now} renderer={renderCountdown} />}
      </dd>
    </div>
  );

  //Crowdfunding needs every input of the fee and deadline calculations.
  canCrowdfund = () => {
    const { metaevidenceJSON, multipliers, appealCost, appealPeriod, currentRuling, contributions } = this.props;
    return Boolean(metaevidenceJSON && multipliers && appealCost != null && appealPeriod != null && currentRuling != null && contributions != null);
  };

  // Helper method to render appeal section
  renderAppealBody = (disputePeriod, totalWithdrawable, metaevidenceJSON, currentRuling, contributions, appealCallback, exceptionalContractAddresses, arbitrated, multipliers) => {
    return (
      <>
        <p className={styles.lead}>
          {disputePeriod == DISPUTE_PERIOD_APPEAL
            && "In order to appeal the decision, you need to fully fund the crowdfunding deposit. The dispute will be sent" +
            " to the jurors when the full deposit is reached. Note that if the previous round loser funds its side, the previous round winner should also fully fund its side in order not to lose the case."
          }
          {disputePeriod == DISPUTE_PERIOD_EXECUTION && this.getWithdrawalText(totalWithdrawable)}
        </p>
        {disputePeriod == DISPUTE_PERIOD_EXECUTION && totalWithdrawable != null && parseInt(totalWithdrawable, 10) > 0 && (
          <div className={styles.actions}>
            <Button onClick={this.props.withdrawCallback}>
              {`Withdraw ${ethers.formatEther(totalWithdrawable)} ETH`}
            </Button>
          </div>
        )}

        {disputePeriod == DISPUTE_PERIOD_APPEAL && (
          this.canCrowdfund() ? (
            <div className={styles.fundingGrid}>
              {this.renderCrowdfundingCards(metaevidenceJSON, currentRuling, contributions, appealCallback, exceptionalContractAddresses, arbitrated)}
              {this.renderVariableTypeCrowdfundingCards(metaevidenceJSON, currentRuling, contributions, appealCallback)}
            </div>
          ) : this.renderCrowdfundingUnavailable(multipliers)
        )}
      </>
    );
  };

  //The appeal handler reports a rejected transaction as "Contribution failed" itself and rethrows; the click must not leave that rejection unhandled.
  handleEscrowV1AppealClick = async () => {
    const { appealCallback, appealCost } = this.props;
    try {
      await appealCallback(0, ethers.formatEther(appealCost));
    } catch {
      //Already reported by the handler.
    }
  };

  renderEscrowV1AppealBody = (disputePeriod, appealCost) => (
    <>
      {disputePeriod == DISPUTE_PERIOD_APPEAL && <p className={styles.lead}>In order to appeal the decision, you need to pay the appeal cost.</p>}
      {disputePeriod == DISPUTE_PERIOD_APPEAL && appealCost == null && (
        <AlertMessage type="warning" extraClass={styles.alert} title="Appeal cost unavailable" content="The appeal cost could not be read from the arbitrator. Please refresh the page or try again later." />
      )}
      {disputePeriod == DISPUTE_PERIOD_APPEAL && appealCost != null && (
        <div className={styles.actions}>
          <Button onClick={this.handleEscrowV1AppealClick}>
            Appeal - {ethers.formatEther(appealCost)} ETH
          </Button>
        </div>
      )}
    </>
  );

  //Ruling options of a well-formed meta-evidence, or null when they are missing or not an object (some non-standard arbitrables use a string).
  getRulingOptions = metaevidenceJSON => {
    const rulingOptions = metaevidenceJSON?.rulingOptions;
    return rulingOptions && typeof rulingOptions === "object" ? rulingOptions : null;
  };

  renderVotingOption = (code, title, description) => (
    <li key={code}>
      <span className={styles.optionCode}>Option {code}</span>
      <span className={styles.optionTitle}>{`${title}`}</span>
      {description != null && <span className={styles.optionDescription}>{`${description}`}</span>}
    </li>
  );

  // Helper method to render question section. A missing or malformed meta-evidence leaves the question unavailable.
  renderQuestionSection = (metaevidenceJSON, courtURL) => {
    const rulingOptions = this.getRulingOptions(metaevidenceJSON);
    const question = typeof metaevidenceJSON?.question === "string" ? metaevidenceJSON.question : null;
    const titles = Array.isArray(rulingOptions?.titles) ? rulingOptions.titles : [];
    const descriptions = rulingOptions?.descriptions && typeof rulingOptions.descriptions === "object" ? rulingOptions.descriptions : {};
    const reserved = rulingOptions?.reserved && typeof rulingOptions.reserved === "object" ? rulingOptions.reserved : null;
    const questionType = QuestionTypes[rulingOptions?.type];

    return (
      <section className={styles.section} id="question">
        <h2>Question</h2>
        {questionType && <p className={styles.questionType}>{questionType}</p>}
        <p className={styles.questionText}>{question ?? "Question unavailable."}</p>
        {(rulingOptions?.type == "single-select" || rulingOptions?.type == "multiple-select") && (
          <>
            <h3 className={styles.optionsHeading}>Voting options</h3>
            <ul className={styles.options}>
              {this.renderVotingOption(0, "Refuse to Arbitrate / Invalid")}
              {titles.map((title, index) => this.renderVotingOption(index + 1, title, descriptions[index]))}
              {reserved &&
                Object.entries(reserved).map(([rulingCode, title]) => {
                  const displayCode = rulingCode.length > 12 ? `${rulingCode.slice(0, 6)}...${rulingCode.slice(-6)}` : rulingCode;
                  return this.renderVotingOption(displayCode, title, descriptions[rulingCode]);
                })}
            </ul>
            <p className={styles.note}>
              <InfoSVG aria-hidden="true" />
              <span>
                Note that you can only view the voting options. Selected jurors can vote using{" "}
                <a href={courtURL} target="_blank" rel="noreferrer noopener">
                  Court
                </a>
                .
              </span>
            </p>
          </>
        )}
      </section>
    );
  };

  // Helper method to render evidence section
  renderEvidenceSection = ({ incompatible, metaevidenceJSON, evidences, disputeEvent, disputePeriod, publishCallback, submitEvidenceCallback, isAuthenticated, isSigningIn, onSignIn }) => (
    <section className={styles.section} id="evidence">
      <h2>Evidence</h2>
      {this.renderWriteStatus("evidence")}
      <EvidenceTimeline
        evidenceSubmissionEnabled={!incompatible}
        metaevidence={metaevidenceJSON}
        evidences={evidences}
        dispute={disputeEvent}
        disputePeriod={disputePeriod}
        publishCallback={publishCallback}
        submitEvidenceCallback={submitEvidenceCallback}
        appealDecisions={this.props.appealDecisions}
        isAuthenticated={isAuthenticated}
        isSigningIn={isSigningIn}
        onSignIn={onSignIn}
      />
    </section>
  );

  //The appeal section: its heading and deadlines stay at the top of the viewport while the funding options scroll by.
  renderAppealSection = (disputePeriod, isEscrowV1Dispute) => {
    const { contributions, multipliers, appealCost, arbitrated, totalWithdrawable, metaevidenceJSON, currentRuling, appealCallback, exceptionalContractAddresses, loading } = this.props;

    let heading = "Withdraw crowdfunding rewards and refunds";
    if (disputePeriod === DISPUTE_PERIOD_APPEAL) heading = "Appeal the decision";
    else if (isEscrowV1Dispute) heading = "Appeal period ended";

    let body;
    if (loading) {
      body = (
        <div className={styles.sectionStatus} role="status">
          <Spinner as="span" animation="border" size="sm" aria-hidden="true" />
          <span>Loading the appeal data…</span>
        </div>
      );
    } else if (isEscrowV1Dispute) {
      body = this.renderEscrowV1AppealBody(disputePeriod, appealCost);
    } else {
      body = this.renderAppealBody(disputePeriod, totalWithdrawable, metaevidenceJSON, currentRuling, contributions, appealCallback, exceptionalContractAddresses, arbitrated, multipliers);
    }

    return (
      <section className={styles.section} id="appeal" aria-busy={loading}>
        <div className={styles.appealBar}>
          <div className={styles.appealBarRow}>
            <h2>{heading}</h2>
            {disputePeriod === DISPUTE_PERIOD_APPEAL && this.renderAppealDeadlines()}
          </div>
          {this.renderWriteStatus("fund")}
          {this.renderWriteStatus("withdraw")}
        </div>
        {body}
      </section>
    );
  };

  // Helper method to render crowdfunding cards for different question types
  renderCrowdfundingCards = (metaevidenceJSON, currentRuling, contributions, appealCallback, exceptionalContractAddresses, arbitrated) => {
    const cards = [];
    const rulingOptions = this.getRulingOptions(metaevidenceJSON);
    const titles = Array.isArray(rulingOptions?.titles) ? rulingOptions.titles : null;
    const { now } = this.props;

    // Invalid/Refused option
    if (!exceptionalContractAddresses.includes(arbitrated)) {
      cards.push(
        <CrowdfundingCard
          key={0}
          title={"Invalid / Refused to Arbitrate / Tied"}
          winner={currentRuling == 0}
          fundingPercentage={this.calculateFundingPercentage(0, contributions).toFixed(2)}
          appealPeriodEnd={this.calculateAppealPeriod(0)}
          suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(0))}
          roi={this.calculateReturnOfInvestmentRatio(0).toFixed(2)}
          appealCallback={appealCallback}
          rulingOptionCode={0}
          now={now}
        />
      );
    }

    // Reserved options
    if (rulingOptions?.reserved && typeof rulingOptions.reserved === "object") {
      Object.entries(rulingOptions.reserved).forEach(([rulingCode, title]) => {
        const hexToNumberString = hex => ethers.getBigInt(hex).toString();
        cards.push(
          <CrowdfundingCard
            key={hexToNumberString(rulingCode)}
            title={title}
            winner={currentRuling == hexToNumberString(rulingCode)}
            fundingPercentage={this.calculateFundingPercentage(hexToNumberString(rulingCode), contributions).toFixed(2)}
            appealPeriodEnd={this.calculateAppealPeriod(hexToNumberString(rulingCode))}
            suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(hexToNumberString(rulingCode)))}
            roi={this.calculateReturnOfInvestmentRatio(hexToNumberString(rulingCode)).toFixed(2)}
            appealCallback={appealCallback}
            rulingOptionCode={hexToNumberString(rulingCode)}
            now={now}
          />
        );
      });
    }

    // Type-specific cards
    const questionType = rulingOptions?.type;

    if (questionType === "single-select" && titles) {
      titles.forEach((title, index) => {
        cards.push(
          <CrowdfundingCard
            key={index + 1}
            title={title}
            winner={currentRuling == index + 1}
            fundingPercentage={this.calculateFundingPercentage(index + 1, contributions).toFixed(2)}
            appealPeriodEnd={this.calculateAppealPeriod(index + 1)}
            suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(index + 1))}
            roi={this.calculateReturnOfInvestmentRatio(index + 1).toFixed(2)}
            appealCallback={appealCallback}
            rulingOptionCode={index + 1}
            now={now}
          />
        );
      });
    } else if (questionType === "multiple-select" && titles) {
      Array.from(Array(2 ** titles.length).keys()).forEach(comboValue => {
        const title = comboValue == 0
          ? "None"
          : comboValue
            .toString(2)
            .padStart(BINARY_PADDING_WIDTH, "0")
            .split("")
            .reverse()
            .map((bit, i) => (bit === "1" ? titles[i] : null))
            .join(" ");

        cards.push(
          <CrowdfundingCard
            key={`combo-${comboValue + 1}`}
            title={title}
            winner={currentRuling == comboValue + 1}
            fundingPercentage={this.calculateFundingPercentage(comboValue + 1, contributions).toFixed(2)}
            appealPeriodEnd={this.calculateAppealPeriod(comboValue + 1)}
            roi={this.calculateReturnOfInvestmentRatio(comboValue + 1).toFixed(2)}
            suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(comboValue + 1))}
            appealCallback={appealCallback}
            rulingOptionCode={comboValue + 1}
            now={now}
          />
        );
      });
    } else {
      // Try to use Reality.eth parsed outcomes if available
      const realityOutcomes = this.findRealityOutcomes(metaevidenceJSON);
      const fallbackTitles = realityOutcomes || ["Yes", "No"]; // Basic fallback for Reality.eth questions

      fallbackTitles.forEach((title, index) => {
        cards.push(
          <CrowdfundingCard
            key={`fallback-${index + 1}`}
            title={title}
            winner={currentRuling == index + 1}
            fundingPercentage={this.calculateFundingPercentage(index + 1, contributions).toFixed(2)}
            appealPeriodEnd={this.calculateAppealPeriod(index + 1)}
            suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(index + 1))}
            roi={this.calculateReturnOfInvestmentRatio(index + 1).toFixed(2)}
            appealCallback={appealCallback}
            rulingOptionCode={index + 1}
            now={now}
          />
        );
      });
    }

    return cards;
  };

  // Helper method to render variable type crowdfunding cards
  renderVariableTypeCrowdfundingCards = (metaevidenceJSON, currentRuling, contributions, appealCallback) => {
    const questionType = this.getRulingOptions(metaevidenceJSON)?.type;
    const isVariableType = ["uint", "int", "string", "datetime", "hash"].includes(questionType);

    if (!isVariableType) return null;

    const cards = [];
    const { now } = this.props;

    // Note: For hash type questions, we don't apply Reality.eth conversion (subtracting 1)
    // when displaying contribution keys because they already represent the actual ruling values
    // that were appealed for. This fixes the off-by-one display issue.

    // Other contributions (not current ruling)
    Object.keys(contributions)
      .filter(key => key !== this.props.currentRuling.toString())
      .forEach(key => {
        let title;
        if (questionType === "string") {
          title = ethers.toUtf8String(ethers.hexlify(key));
        } else if (questionType === "hash") {
          // For hash type, display the raw hex value without Reality.eth conversion
          title = `0x${BigInt(key).toString(16).padStart(64, '0')}`;
        } else {
          title = this.convertToRealitioFormat(key, metaevidenceJSON);
        }

        cards.push(
          <CrowdfundingCard
            key={key}
            title={title}
            rulingOptionCode={key.toString()}
            winner={currentRuling == key}
            fundingPercentage={this.calculateFundingPercentage(key, contributions).toFixed(2)}
            suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(key))}
            appealPeriodEnd={this.calculateAppealPeriod(key)}
            roi={this.calculateReturnOfInvestmentRatio(key).toFixed(2)}
            appealCallback={appealCallback}
            metaevidenceJSON={metaevidenceJSON}
            now={now}
          />
        );
      });

    // Current ruling card (if not 0)
    if (this.props.currentRuling != 0) {
      let currentRulingTitle;
      if (questionType === "hash") {
        // For hash type, display the raw hex value without Reality.eth conversion
        currentRulingTitle = `0x${BigInt(currentRuling).toString(16).padStart(64, '0')}`;
      } else {
        currentRulingTitle = this.convertToRealitioFormat(currentRuling, metaevidenceJSON);
      }

      cards.push(
        <CrowdfundingCard
          key="current-ruling"
          title={currentRulingTitle}
          rulingOptionCode={currentRuling.toString()}
          winner={true}
          fundingPercentage={this.calculateFundingPercentage(currentRuling, contributions).toFixed(2)}
          appealPeriodEnd={this.calculateAppealPeriod(currentRuling)}
          roi={this.calculateReturnOfInvestmentRatio(currentRuling).toFixed(2)}
          suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaisedForLoser())}
          appealCallback={appealCallback}
          metaevidenceJSON={metaevidenceJSON}
          now={now}
        />
      );
    }

    // Variable input card
    cards.push(
      <CrowdfundingCard
        key="variable-input"
        variable={questionType}
        winner={false}
        fundingPercentage={0}
        appealPeriodEnd={this.calculateLoserAppealPeriod()}
        roi={this.calculateReturnOfInvestmentRatioForLoser().toFixed(2)}
        suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaisedForLoser())}
        appealCallback={appealCallback}
        metaevidenceJSON={metaevidenceJSON}
        now={now}
      />
    );

    return cards;
  };

  //The timeline needs a readable period; the durations of an unknown court are shown as unavailable by the timeline itself.
  renderTimeline = (arbitratorDispute, disputePeriod, subcourts) => {
    if (!Number.isInteger(disputePeriod) || disputePeriod < 0) {
      return <p className={styles.unavailable}>Timeline unavailable: the dispute period could not be read.</p>;
    }

    const timesPerPeriod = subcourts?.[arbitratorDispute.subcourtID?.toString()]?.[1] ?? null;
    return (
      <DisputeTimeline
        period={disputePeriod}
        lastPeriodChange={arbitratorDispute.lastPeriodChange?.toString() ?? null}
        timesPerPeriod={Array.isArray(timesPerPeriod) ? timesPerPeriod : null}
        now={this.props.now}
      />
    );
  };

  //Placeholders for the facts and the timeline while the subcourts, which name the court and time the periods, are loading.
  renderHeaderPlaceholder = () => (
    <div className={styles.headerPlaceholder} aria-hidden="true">
      <div className={styles.facts}>
        <span className={`skeleton ${styles.skeletonFact}`} />
        <span className={`skeleton ${styles.skeletonFact}`} />
        <span className={`skeleton ${styles.skeletonFact}`} />
      </div>
      <span className={`skeleton ${styles.skeletonLine}`} />
    </div>
  );

  //One link per action the visitor can take on this page, each pointing at the section with its control:
  //funding while the appeal section shows funding options, withdrawing while it shows a withdrawal, evidence while it can be submitted here.
  renderActions = (disputePeriod, isEscrowV1Dispute) => {
    const { incompatible, totalWithdrawable, appealCost } = this.props;
    const actions = [];

    if (disputePeriod === DISPUTE_PERIOD_APPEAL && !incompatible && (isEscrowV1Dispute ? appealCost != null : this.canCrowdfund())) actions.push(["appeal", "Fund an appeal"]);
    if (disputePeriod === DISPUTE_PERIOD_EXECUTION && totalWithdrawable != null && parseInt(totalWithdrawable, 10) > 0) actions.push(["appeal", "Withdraw"]);
    if (disputePeriod >= 0 && disputePeriod < DISPUTE_PERIOD_EXECUTION && !incompatible) actions.push(["evidence", "Submit evidence"]);

    return actions.map(([target, label]) => (
      <a key={label} className={styles.actionLink} href={`#${target}`}>
        {label}
        <span aria-hidden="true"> ↓</span>
      </a>
    ));
  };

  //The status, title, facts and timeline of the case. The facts and the timeline wait for the subcourts.
  renderHeader = (disputePeriod, isEscrowV1Dispute, courtURL) => {
    const { arbitratorDisputeID, arbitratorDisputeDetails, arbitratorDispute, subcourts, subcourtDetails, subcourtsLoading, currentRuling, metaevidenceJSON, rulingFunded, incompatible, arbitrated } = this.props;

    return (
      <article className={styles.header}>
        <div className={styles.headerTop}>
          <span className={`${statusStyles.status} ${statusStyles[PERIOD_CLASSES[disputePeriod]] || ""}`}>{PERIOD_NAMES[disputePeriod] || "Status unavailable"}</span>
          <div className={styles.headerLinks}>
            {this.renderActions(disputePeriod, isEscrowV1Dispute)}
            <a className={styles.courtLink} href={courtURL} target="_blank" rel="noreferrer noopener">
              View on Court<span aria-hidden="true"> ↗</span>
            </a>
          </div>
        </div>
        <h1 className={styles.title}>{getDisputeTitle(metaevidenceJSON?.title)}</h1>
        {subcourtsLoading ? (
          this.renderHeaderPlaceholder()
        ) : (
          <>
            {this.renderDisputeInfo(arbitratorDisputeID, arbitratorDisputeDetails, arbitratorDispute, subcourtDetails, arbitrated)}
            <div className={styles.timeline}>{this.renderTimeline(arbitratorDispute, disputePeriod, subcourts)}</div>
          </>
        )}
        {this.renderDecisionAlerts(disputePeriod, currentRuling, metaevidenceJSON, rulingFunded, incompatible)}
      </article>
    );
  };

  render() {
    const {
      arbitrated,
      network,
      metaevidenceJSON,
      evidences,
      arbitratorDisputeID,
      arbitratorDispute,
      incompatible,
      disputeEvent,
      publishCallback,
      submitEvidenceCallback,
      isAuthenticated,
      isSigningIn,
      onSignIn,
      summary,
    } = this.props;

    //The dispute struct is the one thing every section needs; each section copes with its own missing data.
    if (!arbitratorDispute || !arbitrated) {
      return null;
    }

    const disputePeriod = parseInt(arbitratorDispute.period, 10);
    const isEscrowV1Dispute = networkMap[network].ESCROW_V1_CONTRACTS.includes(arbitrated);
    //A period that could not be read (NaN) never reaches the appeal stage.
    const hasAppealSection = disputePeriod >= DISPUTE_PERIOD_APPEAL;
    const courtURL = new URL(`https://court.kleros.io/cases/${encodeURIComponent(arbitratorDisputeID)}`);
    courtURL.searchParams.set("requiredChainId", network ?? "1");

    return (
      <div className={styles.disputeDetails}>
        {this.renderHeader(disputePeriod, isEscrowV1Dispute, courtURL.toString())}
        {/*The outcome of a contribution or withdrawal stays visible when the case has moved on and the appeal section is gone.*/}
        {!hasAppealSection && this.renderWriteStatus("fund")}
        {!hasAppealSection && this.renderWriteStatus("withdraw")}
        {summary}
        {hasAppealSection && this.renderAppealSection(disputePeriod, isEscrowV1Dispute)}
        {this.renderQuestionSection(metaevidenceJSON, courtURL.toString())}
        {this.renderEvidenceSection({ incompatible, metaevidenceJSON, evidences, disputeEvent, disputePeriod, publishCallback, submitEvidenceCallback, isAuthenticated, isSigningIn, onSignIn })}
      </div>
    );
  }
}

DisputeDetails.propTypes = {
  exceptionalContractAddresses: PropTypes.array,
  isAuthenticated: PropTypes.bool.isRequired,
  isSigningIn: PropTypes.bool.isRequired,
  onSignIn: PropTypes.func.isRequired,
  subcourtsLoading: PropTypes.bool,
  now: PropTypes.func,
  summary: PropTypes.node,
  writeStatus: PropTypes.shape({
    action: PropTypes.oneOf(["fund", "withdraw", "evidence"]).isRequired,
    status: PropTypes.oneOf(["pending", "success", "failure"]).isRequired,
    hash: PropTypes.string,
    error: PropTypes.string,
  }),
  onDismissWriteStatus: PropTypes.func,
};

export default DisputeDetails;
