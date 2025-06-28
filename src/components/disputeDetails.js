import { Card, Row, Col, Form, Accordion, Dropdown, Button } from "react-bootstrap";
import React from "react";
import * as realitioLibQuestionFormatter from "@reality.eth/reality-eth-lib/formatters/question";
import { ReactComponent as AvatarSVG } from "../assets/images/avatar.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as InfoSVG } from "../assets/images/info.svg";

import DisputeTimeline from "components/disputeTimeline";
import EvidenceTimeline from "components/evidenceTimeline";
import CrowdfundingCard from "components/crowdfundingCard";
import { ethers } from "ethers";

import AlertMessage from "components/alertMessage";

import styles from "components/styles/disputeDetails.module.css";

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

class DisputeDetails extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      activeKey: 0,
    };
  }

  componentDidUpdate(previousProperties) {
    if( this.props.network !== previousProperties.network )
      window.location.reload();
    
    if (this.props.arbitratorDisputeID !== previousProperties.arbitratorDisputeID) {
      this.setState({ activeKey: 0 });
    }
  }

  componentDidMount() {
    // Component initialization complete
  }

  calculateTotalCost = (rulingOption) => {
    // Unslashed contract violates IDisputeResolver interface by not letting option 0: refuse to rule to be funded.
    // Subsequently, in case of a ruling 0, contract considers remaining ruling options as winners, instead of losers.
    // Therefore we have to make an exception in this function for the following list of irregular contracts.

    const { currentRuling, appealCost, multipliers, exceptionalContractAddresses, arbitrated } = this.props;

    let stake;

    if (currentRuling == rulingOption || (exceptionalContractAddresses.includes(arbitrated) && currentRuling == 0)) {
      stake = (appealCost * multipliers.winnerStakeMultiplier) / multipliers.denominator;
    } else {
      return this.calculateAmountRemainsToBeRaisedForLoser();
    }

    return appealCost + stake;
  };

  calculateAmountRemainsToBeRaised = (rulingOption) => {
    const { contributions } = this.props;
    const raisedSoFar = contributions[rulingOption] ?? 0;

    return this.calculateTotalCost(rulingOption) - BigInt(raisedSoFar);
  };

  calculateAmountRemainsToBeRaisedForLoser = () => {
    const { appealCost,multipliers } = this.props;
    const stake = (appealCost * multipliers.loserStakeMultiplier) / multipliers.denominator;
    
    return BigInt(appealCost) + BigInt(stake);
  };

  calculateReturnOfInvestmentRatio = (rulingOption) => {
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

  calculateAppealPeriod = (rulingOption) => {
    const { currentRuling, multipliers, appealPeriod, exceptionalContractAddresses, arbitrated } = this.props;

    if (currentRuling == rulingOption || (exceptionalContractAddresses.includes(arbitrated) && currentRuling == 0)) {
      return appealPeriod.end;
    }

    const start = appealPeriod.start;
    const end = appealPeriod.end;
    const loserMultiplier = multipliers.loserAppealPeriodMultiplier;
    const denominator = multipliers.denominator;

    return Number(start + (end - start) * (loserMultiplier / denominator));
  };

  calculateLoserAppealPeriod = () => {
    const { multipliers, appealPeriod } = this.props;

    const start = appealPeriod.start;
    const end = appealPeriod.end;
    const loserMultiplier = multipliers.loserAppealPeriodMultiplier;
    const denominator = multipliers.denominator;

    return Number(start + (end - start) * (loserMultiplier / denominator));
  };

  calculateFundingPercentage = (rulingOption, contributions) => {
    const totalCost = this.calculateTotalCost(rulingOption);
    const raisedSoFar = contributions[rulingOption] ?? 0;

    if (totalCost === 0) return 0;

    const scaled = (BigInt(raisedSoFar) * PERCENTAGE_SCALING_FACTOR) / totalCost;
    return Number(scaled) / PERCENTAGE_SCALING_DIVISOR;
  }

  // Helper method to validate and process hex strings
  processHexValue = (hashValue) => {
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
  processNumericValue = (hashValue) => {
    if (hashValue.includes('e') || hashValue.includes('E')) {
      throw new Error(`Hash value precision lost during processing. Please report this issue.`);
    }
    
    try {
      const numericValue = BigInt(hashValue);
      return (numericValue - 1n).toString(16);
    } catch (error) {
      throw new Error(`Invalid hash value: not a valid number or hex string: ${hashValue}`);
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

  convertToRealitioFormat = (currentRuling, metaEvidenceJSON) => {
    try {
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
    
    if (disputePeriod == DISPUTE_PERIOD_APPEAL) {
      return (
        <AlertMessage
          type="info"
          title={`Jury decision: ${currentRuling == 0 ? "invalid / refused to arbitrate / tied" : this.convertToRealitioFormat(currentRuling, metaevidenceJSON)}`}
          content={decisionInfoBoxContent}
        />
      );
    }
    
    if (disputePeriod == DISPUTE_PERIOD_EXECUTION) {
      return (
        <AlertMessage
          type="info"
          title={`Winner: ${currentRuling == 0 ? "invalid / refused to arbitrate / tied" : this.convertToRealitioFormat(this.getWinner(rulingFunded, currentRuling), metaevidenceJSON)}`}
          content={`${rulingFunded && rulingFunded.length == 1 ? "Won by default" : "Won by jury decision"}`}
        />
      );
    }
    
    return null;
  };

  // Helper method to render crowdfunding cards for different question types
  renderCrowdfundingCards = (metaevidenceJSON, currentRuling, contributions, appealCallback, exceptionalContractAddresses, arbitrated) => {
    const cards = [];

    // Invalid/Refused option
    if (!exceptionalContractAddresses.includes(arbitrated)) {
      cards.push(
        <Col key={0} className="pb-4" xl={8} lg={12} xs={24}>
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
          />
        </Col>
      );
    }

    // Reserved options
    if (metaevidenceJSON.rulingOptions?.reserved) {
      Object.entries(metaevidenceJSON.rulingOptions.reserved).forEach(([rulingCode, title]) => {
        const hexToNumberString = (hex) => ethers.getBigInt(hex).toString();
        cards.push(
          <Col key={hexToNumberString(rulingCode)} className="pb-4" xl={8} lg={12} xs={24}>
            <CrowdfundingCard
              key={hexToNumberString(rulingCode)}
              title={title}
              winner={currentRuling == hexToNumberString(rulingCode)}
              fundingPercentage={this.calculateFundingPercentage(hexToNumberString(rulingCode), contributions).toFixed(2)}
              appealPeriodEnd={this.calculateAppealPeriod(hexToNumberString(rulingCode))}
              suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(hexToNumberString(rulingCode)))}
              roi={this.calculateReturnOfInvestmentRatio(hexToNumberString(rulingCode)).toFixed(2)}
              appealCallback={appealCallback}
              rulingOptionCode={rulingCode}
            />
          </Col>
        );
      });
    }

    // Type-specific cards
    const questionType = metaevidenceJSON.rulingOptions?.type;
    
    if (questionType === "single-select") {
      metaevidenceJSON.rulingOptions.titles.forEach((title, index) => {
        cards.push(
          <Col key={index + 1} className="pb-4" xl={8} lg={12} xs={24}>
            <CrowdfundingCard
              title={title}
              winner={currentRuling == index + 1}
              fundingPercentage={this.calculateFundingPercentage(index + 1, contributions).toFixed(2)}
              appealPeriodEnd={this.calculateAppealPeriod(index + 1)}
              suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(index + 1))}
              roi={this.calculateReturnOfInvestmentRatio(index + 1).toFixed(2)}
              appealCallback={appealCallback}
              rulingOptionCode={index + 1}
            />
          </Col>
        );
      });
    }

    if (questionType === "multiple-select") {
      Array.from(Array(2 ** metaevidenceJSON.rulingOptions.titles.length).keys()).forEach((_key, index) => {
        const title = index == 0 
          ? "None"
          : index
              .toString(2)
              .padStart(BINARY_PADDING_WIDTH, "0")
              .split("")
              .reverse()
              .map((bit, i) => (bit === 1 ? metaevidenceJSON.rulingOptions.titles[i] : null))
              .join(" ");
        
        cards.push(
          <Col key={index} className="pb-4" xl={8} lg={12} xs={24}>
            <CrowdfundingCard
              title={title}
              winner={currentRuling == index + 1}
              fundingPercentage={this.calculateFundingPercentage(index + 1, contributions).toFixed(2)}
              appealPeriodEnd={this.calculateAppealPeriod(index + 1)}
              roi={this.calculateReturnOfInvestmentRatio(index + 1).toFixed(2)}
              suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(index + 1))}
              appealCallback={appealCallback}
              rulingOptionCode={index + 1}
            />
          </Col>
        );
      });
    }

    return cards;
  };

  // Helper method to render variable type crowdfunding cards
  renderVariableTypeCrowdfundingCards = (metaevidenceJSON, currentRuling, contributions, appealCallback) => {
    const questionType = metaevidenceJSON.rulingOptions?.type;
    const isVariableType = ["uint", "int", "string", "datetime"].includes(questionType);
    
    if (!isVariableType) return null;

    const cards = [];

    // Other contributions (not current ruling)
    Object.keys(contributions)
      .filter((key) => key !== this.props.currentRuling.toString())
      .forEach((key) => {
        const title = questionType === "string" 
          ? ethers.toUtf8String(ethers.hexlify(key)) 
          : this.convertToRealitioFormat(key, metaevidenceJSON);
        
        cards.push(
          <Col key={key} className="pb-4" xl={8} lg={12} xs={24}>
            <CrowdfundingCard
              title={title}
              rulingOptionCode={key}
              winner={currentRuling == key}
              fundingPercentage={this.calculateFundingPercentage(key, contributions).toFixed(2)}
              suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaised(key))}
              appealPeriodEnd={this.calculateAppealPeriod(key)}
              roi={this.calculateReturnOfInvestmentRatio(key).toFixed(2)}
              appealCallback={appealCallback}
              metaevidenceJSON={metaevidenceJSON}
            />
          </Col>
        );
      });

    // Current ruling card (if not 0)
    if (this.props.currentRuling != 0) {
      cards.push(
        <Col key="current-ruling" className="pb-4" xl={8} lg={12} xs={24}>
          <CrowdfundingCard
            title={`${this.convertToRealitioFormat(currentRuling, metaevidenceJSON)}`}
            rulingOptionCode={currentRuling}
            winner={true}
            fundingPercentage={this.calculateFundingPercentage(currentRuling, contributions).toFixed(2)}
            appealPeriodEnd={this.calculateAppealPeriod(currentRuling)}
            roi={this.calculateReturnOfInvestmentRatio(currentRuling).toFixed(2)}
            suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaisedForLoser())}
            appealCallback={appealCallback}
            metaevidenceJSON={metaevidenceJSON}
          />
        </Col>
      );
    }

    // Variable input card
    cards.push(
      <Col key="variable-input" className="pb-4" xl={8} lg={12} xs={24}>
        <CrowdfundingCard
          variable={questionType}
          winner={false}
          fundingPercentage={0}
          appealPeriodEnd={this.calculateLoserAppealPeriod()}
          roi={this.calculateReturnOfInvestmentRatioForLoser().toFixed(2)}
          suggestedContribution={ethers.formatEther(this.calculateAmountRemainsToBeRaisedForLoser())}
          appealCallback={appealCallback}
          metaevidenceJSON={metaevidenceJSON}
        />
      </Col>
    );

    return cards;
  };

  render() {
    const {
      arbitrated,
      metaevidenceJSON,
      evidences,
      arbitratorDisputeID,
      arbitratorDispute,
      incompatible,
      subcourts,
      subcourtDetails,
      arbitratorDisputeDetails,
      currentRuling,
      disputeEvent,
      publishCallback,
      submitEvidenceCallback,
      appealCost,
      appealPeriod,
      appealCallback,
      contributions,
      rulingFunded,
      multipliers,
      totalWithdrawable,
      exceptionalContractAddresses
    } = this.props;

    const { activeKey } = this.state;

    // Early return if required data is not available
    if (!metaevidenceJSON || !arbitratorDispute || subcourts.length === 0 || 
        subcourtDetails.length === 0 || !arbitratorDisputeDetails) {
      return <div></div>;
    }

    const disputePeriod = parseInt(arbitratorDispute.period);

      return (
        <section className={styles.disputeDetails}>
          <DisputeTimeline
            period={disputePeriod}
            lastPeriodChange={arbitratorDispute.lastPeriodChange.toString()}
            timesPerPeriod={subcourts[arbitratorDispute.subcourtID.toString()]?.[1]}
          />
          <hr className="mt-4" />
          <Row>
            <Col xl={6} md="auto" sm={true} xs={24}>
              <Form.Group>
                <Form.Label htmlFor="category">Dispute</Form.Label>
                <Form.Control id="category" as="span" title="" className="mr-4">
                  <i className="purple-primary">#</i> {arbitratorDisputeID}
                </Form.Control>
              </Form.Group>
            </Col>
            <Col xl={6} md="auto" sm={true} xs={24}>
              <Form.Group className="">
                <Form.Label htmlFor="initialNumberOfJurors">Number of Votes</Form.Label>
                <Form.Control className={`mr-4 ${styles.spanWithSvgInside}`} id="initialNumberOfJurors" as="span">
                  <AvatarSVG />
                  <span>{parseInt(arbitratorDisputeDetails.votesLengths[0])}</span>
                </Form.Control>
              </Form.Group>
            </Col>
            <Col md={true} sm={24}>
              <Form.Group>
                <Form.Label htmlFor="court">Court</Form.Label>
                <Form.Control className={styles.spanWithSvgInside} id="court" as="span">
                  <ScalesSVG className={styles.scales} />
                  <span>{subcourtDetails[arbitratorDispute.subcourtID]?.name}</span>
                </Form.Control>
              </Form.Group>
            </Col>
          </Row>

          {this.renderDecisionAlerts(disputePeriod, currentRuling, metaevidenceJSON, rulingFunded, incompatible)}

          <Accordion
            className={`mt-4 ${styles.accordion}`}
            onSelect={(e) => {
              this.setState({ activeKey: e });
            }}
          >
            <Card>
              {arbitratorDispute && disputePeriod >= DISPUTE_PERIOD_APPEAL && contributions && multipliers && appealCost && appealPeriod && arbitrated && (
                <>
                  <Accordion.Toggle className={activeKey == 1 ? "open" : "closed"} as={Card.Header} eventKey="1">
                    Appeal
                  </Accordion.Toggle>
                  <Accordion.Collapse eventKey="1">
                    <Card.Body>
                      <div className="h1">{disputePeriod == DISPUTE_PERIOD_APPEAL ? "Appeal the decision" : "Withdraw crowdfunding rewards and refunds"}</div>
                      <p className="label">
                        {disputePeriod == DISPUTE_PERIOD_APPEAL
                          && "In order to appeal the decision, you need to fully fund the crowdfunding deposit. The dispute will be sent" +
                          " to the jurors when the full deposit is reached. Note that if the previous round loser funds its side, the previous round winner should also fully fund its side in order not to lose the case."
                        }
                        {disputePeriod == DISPUTE_PERIOD_EXECUTION && parseInt(totalWithdrawable) != 0 ? "If you have contributed to a ruling option and in the end that ruling option was the winner you are eligible for some reward. Also, if you have contributed but appeal did not happen your contribution is refunded."
                          : "You don't have any amount to withdraw. Reason might be that you did not contribute, the ruling option you have contributed did not win, you already withdrew or the ruling is not executed yet by the arbitrator."}
                      </p>
                      {disputePeriod == DISPUTE_PERIOD_EXECUTION && parseInt(totalWithdrawable) > 0 && (
                        <Row className="mt-5">
                          <Col className="text-right">
                            <Button className="ml-auto" onClick={this.props.withdrawCallback}>
                              {`Withdraw ${ethers.formatEther(totalWithdrawable)} ETH`}
                            </Button>
                          </Col>
                        </Row>
                      )}

                      {disputePeriod == DISPUTE_PERIOD_APPEAL && (
                        <Row className="mt-3">
                          {this.renderCrowdfundingCards(metaevidenceJSON, currentRuling, contributions, appealCallback, exceptionalContractAddresses, arbitrated)}

                          {this.renderVariableTypeCrowdfundingCards(metaevidenceJSON, currentRuling, contributions, appealCallback)}
                        </Row>
                      )}
                    </Card.Body>
                  </Accordion.Collapse>
                </>
              )}
            </Card>

            <Card>
              <Accordion.Toggle className={activeKey == 2 ? "open" : "closed"} as={Card.Header} eventKey="2">
                Question
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="2">
                <Card.Body className={styles.question}>
                  <p>{QuestionTypes[metaevidenceJSON.rulingOptions?.type]}</p>
                  <p>{metaevidenceJSON.question}</p>
                  {(metaevidenceJSON.rulingOptions?.type == "single-select" || metaevidenceJSON.rulingOptions?.type == "multiple-select") && (
                    <>
                      <Dropdown>
                        <Dropdown.Toggle block className={styles.dropdownToggle}>
                          <span className="font-weight-normal">View Voting Options</span>
                        </Dropdown.Toggle>

                        <Dropdown.Menu dir="">
                          <Dropdown.Item key={0} disabled >Option 0 Refuse to Arbitrate</Dropdown.Item>
                          {metaevidenceJSON.rulingOptions.titles.map((title, index) => (
                            <Dropdown.Item key={index} disabled>{`Option ${index + 1} ${title}${metaevidenceJSON.rulingOptions.descriptions && metaevidenceJSON.rulingOptions.descriptions[index] != undefined ? ":" : ""
                              } ${metaevidenceJSON.rulingOptions.descriptions && metaevidenceJSON.rulingOptions.descriptions[index] != undefined
                                ? metaevidenceJSON.rulingOptions.descriptions[index]
                                : ""
                              }`}</Dropdown.Item>
                          ))}
                          {metaevidenceJSON.rulingOptions?.reserved &&
                            Object.entries(metaevidenceJSON.rulingOptions.reserved).map(([rulingCode, title]) => (
                              <Dropdown.Item key={rulingCode} disabled>{`Option ${rulingCode.length > 12 ? (rulingCode.slice(0, 6) + "..." + rulingCode.slice(-6)) : rulingCode} ${title}${metaevidenceJSON.rulingOptions.descriptions && metaevidenceJSON.rulingOptions.descriptions[rulingCode] != undefined ? ":" : ""
                                } ${metaevidenceJSON.rulingOptions.descriptions && metaevidenceJSON.rulingOptions.descriptions[rulingCode] != undefined
                                  ? metaevidenceJSON.rulingOptions.descriptions[rulingCode]
                                  : ""
                                }`}</Dropdown.Item>
                            ))}

                        </Dropdown.Menu>
                      </Dropdown>
                      <p className={styles.questionInfo}>
                        <InfoSVG />
                        Note that you can only view the voting options. Selected jurors can vote using{" "}
                        <a href={`https://court.kleros.io/cases/${arbitratorDisputeID}`} target="_blank" rel="noreferrer noopener">
                          Court
                        </a>
                        .
                      </p>
                    </>
                  )}
                </Card.Body>
              </Accordion.Collapse>
            </Card>

            <Card>
              <Accordion.Toggle className={activeKey == 3 ? "open" : "closed"} as={Card.Header} eventKey="3">
                Evidence
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="3">
                <Card.Body>
                  <EvidenceTimeline
                    evidenceSubmissionEnabled={!incompatible}
                    metaevidence={metaevidenceJSON}
                    evidences={evidences}
                    dispute={disputeEvent}
                    disputePeriod={disputePeriod}
                    publishCallback={publishCallback}
                    submitEvidenceCallback={submitEvidenceCallback}
                    appealDecisions={this.state.appealDecisions}
                  />
                </Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
        </section>
      );
  }
}

export default DisputeDetails;