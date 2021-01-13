import { Card, Row, Col, Form, Container, Accordion, Dropdown, Button } from "react-bootstrap";
import React from "react";
import BigNumber from "bignumber.js";
const DECIMALS = BigNumber(10).pow(BigNumber(18));

import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { ReactComponent as AvatarSVG } from "../assets/images/avatar.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as InfoSVG } from "../assets/images/info.svg";

import DisputeTimeline from "components/disputeTimeline";
import EvidenceTimeline from "components/evidenceTimeline";
import CrowdfundingCard from "components/crowdfundingCard";
import { combinations } from "utils/combinations";

import AlertMessage from "components/alertMessage";

import styles from "components/styles/disputeDetails.module.css";

const QuestionTypes = Object.freeze({
  "single-select": "Multiple choice: single select",
  "multiple-select": "Multiple choice: multiple select",
  uint: "Non-negative number",
  int: "Number",
  string: "Text",
});

class DisputeDetails extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      activeKey: 0,
    };
  }

  calculateReturnOfInvestmentRatio = (party) => {
    const { currentRuling, multipliers } = this.props;

    const winner = BigNumber(multipliers.winner);
    const loser = BigNumber(multipliers.loser);
    const shared = BigNumber(multipliers.shared);
    const divisor = BigNumber(multipliers.divisor);
    if (currentRuling == party) {
      return winner.plus(loser).plus(divisor).div(winner.plus(divisor));
    } else {
      return winner.plus(loser).plus(divisor).div(loser.plus(divisor));
    }
  };

  calculateReturnOfInvestmentRatioForLoser = () => {
    const { currentRuling, multipliers } = this.props;
    const winner = BigNumber(multipliers.winner);
    const loser = BigNumber(multipliers.loser);
    const shared = BigNumber(multipliers.shared);
    const divisor = BigNumber(multipliers.divisor);

    return winner.plus(loser).plus(divisor).div(loser.plus(divisor));
  };

  componentDidMount() {}

  multipleSelectRulingTitleCombinations = (metaevidenceJSON) => {
    const combs = combinations(Array.from(Array(metaevidenceJSON.rulingOptions.titles.length).keys()));
    let combsInTitles = combs.map((rulingCombination) => rulingCombination.map((rulingCode) => metaevidenceJSON.rulingOptions.titles[rulingCode] + " "));
    combsInTitles[0] = "None";
    return combsInTitles;
  };

  multipleSelectIsWinner = (metaevidenceJSON, currentRuling, rulingOptionIndexAsInMetaevidence) => {
    const winningCombination = combinations(Array.from(Array(metaevidenceJSON.rulingOptions.titles.length).keys()))[currentRuling - 1];
    return winningCombination.includes(rulingOptionIndexAsInMetaevidence);
  };

  render() {
    const {
      metaevidenceJSON,
      evidences,
      ipfsGateway,
      interfaceValid,
      arbitrated,
      arbitratorDisputeID,
      arbitratorAddress,
      arbitratorDispute,
      subcourts,
      subcourtDetails,
      arbitratorDisputeDetails,
      currentRuling,
      disputeEvent,
      publishCallback,
      submitEvidenceCallback,
      appealDeadlines,
      appealCosts,
      appealCallback,
      contributions,
      multipliers,
      activeAddress,
      totalWithdrawable,
    } = this.props;
    const { activeKey } = this.state;
    console.log(this.props);
    console.log(this.state);

    if (metaevidenceJSON && arbitratorDispute && subcourts && subcourtDetails && arbitratorDisputeDetails)
      return (
        <section className={styles.disputeDetails}>
          <DisputeTimeline period={arbitratorDispute.period} lastPeriodChange={arbitratorDispute.lastPeriodChange} subcourtID={arbitratorDispute.subcourtID} subcourt={subcourts[arbitratorDispute.subcourtID]} />
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
                  <span>{arbitratorDisputeDetails.votesLengths.slice(-1)}</span>
                </Form.Control>
              </Form.Group>
            </Col>
            <Col md={true} sm={24}>
              <Form.Group>
                <Form.Label htmlFor="court">Court</Form.Label>
                <Form.Control className={styles.spanWithSvgInside} id="court" as="span">
                  <ScalesSVG className={styles.scales} />
                  <span>{subcourtDetails[arbitratorDispute.subcourtID].name}</span>
                </Form.Control>
              </Form.Group>
            </Col>
          </Row>
          {metaevidenceJSON.rulingOptions.type == "single-select" && arbitratorDispute.period >= 3 && (
            <AlertMessage type="info" title={`Jury decision: ${currentRuling == 0 ? "refused to arbitrate" : metaevidenceJSON.rulingOptions.titles[currentRuling - 1]}`} content="This decision can be appealed within appeal period." />
          )}

          {metaevidenceJSON.rulingOptions.type == "multiple-select" && arbitratorDispute.period >= 3 && (
            <AlertMessage
              type="info"
              title={`Jury decision: ${
                currentRuling == 0
                  ? "refused to arbitrate"
                  : currentRuling == 1
                  ? "none"
                  : (currentRuling - 1)
                      .toString(2)
                      .padStart(4, "0")
                      .split("")
                      .reverse()
                      .map((bit, index) => (bit == 1 ? metaevidenceJSON.rulingOptions.titles[index] : null))
                      .join(" ")
              }`}
              content="This decision can be appealed within appeal period."
            /> // Refactor out this logic, too complicated.
          )}
          {(metaevidenceJSON.rulingOptions.type == "uint" || metaevidenceJSON.rulingOptions.type == "int" || metaevidenceJSON.rulingOptions.type == "string") && arbitratorDispute.period >= 3 && (
            <AlertMessage type="info" title={`Jury decision: ${currentRuling == 0 ? "refused to arbitrate" : currentRuling - 1}`} content="This decision can be appealed within appeal period." /> // Refactor out this logic, too complicated.
          )}
          <Accordion
            className={`mt-4 ${styles.accordion}`}
            onSelect={(e) => {
              this.setState({ activeKey: e });
            }}
          >
            <Card>
              {arbitratorDispute && arbitratorDispute.period >= 3 && contributions && (
                <>
                  <Accordion.Toggle className={activeKey == 1 ? "open" : "closed"} as={Card.Header} eventKey="1">
                    Appeal
                  </Accordion.Toggle>
                  <Accordion.Collapse eventKey="1">
                    <Card.Body>
                      <div className="h1">{arbitratorDispute.period == 3 ? "Appeal the decision" : "Withdraw crowdfunding rewards and refunds"}</div>
                      <p className="label">
                        {arbitratorDispute.period == 3
                          ? "In order to appeal the decision, you need to fully fund the crowdfunding deposit. The dispute will be sent to the jurors when the full deposit is reached. Note that if the previous round loser funds its side, the previous round winner should also fully fund its side in order not to lose the case."
                          : parseInt(totalWithdrawable) != 0
                          ? "If you have contributed to a ruling option and in the end that ruling option was the winner you are eligible for some reward. Also, if you have contributed but appeal did not happen your contribution is refunded."
                          : "You don't have any refunds of rewards or you already withdrawn it."}
                      </p>
                      {arbitratorDispute.period == 4 && parseInt(totalWithdrawable) != 0 && (
                        <Row className="mt-5">
                          <Col className="text-right">
                            <Button className="ml-auto" onClick={this.props.withdrawCallback}>
                              {`Withdraw ${BigNumber(totalWithdrawable).div(DECIMALS).toString()} ETH`}
                            </Button>
                          </Col>
                        </Row>
                      )}

                      {arbitratorDispute.period == 3 && appealDeadlines && contributions && Object.keys(appealCosts).length > 0 && (
                        <Row className="mt-3">
                          <Col className="pb-4" xl={8} lg={12} xs={24}>
                            <CrowdfundingCard
                              key={0}
                              title={"Invalid / Refused to Arbitrate"}
                              winner={currentRuling == 0}
                              fundingPercentage={contributions.hasOwnProperty(0) && appealCosts.hasOwnProperty(0) ? BigNumber(contributions[0]).div(BigNumber(appealCosts[0])).times(100).toFixed(2) : 0}
                              appealPeriodEnd={appealDeadlines && appealDeadlines.hasOwnProperty(0) && parseInt(appealDeadlines[0].end)}
                              suggestedContribution={contributions[0] ? BigNumber(appealCosts[0]).minus(BigNumber(contributions[0])).div(DECIMALS).toString() : BigNumber(appealCosts[0]).div(DECIMALS).toString()}
                              roi={this.calculateReturnOfInvestmentRatio(0).toFixed(2)}
                              appealCallback={appealCallback}
                              rulingOptionCode={0}
                            />
                          </Col>
                          {metaevidenceJSON &&
                            metaevidenceJSON.rulingOptions.type == "single-select" &&
                            Object.keys(appealDeadlines).length > 1 &&
                            metaevidenceJSON.rulingOptions.titles.map((title, index) => (
                              <Col key={index + 1} className="pb-4" xl={8} lg={12} xs={24}>
                                <CrowdfundingCard
                                  title={title}
                                  winner={currentRuling == index + 1}
                                  fundingPercentage={
                                    contributions[index + 1]
                                      ? BigNumber(contributions[index + 1])
                                          .div(BigNumber(appealCosts[index + 1]))
                                          .times(100)
                                          .toFixed(2)
                                      : 0
                                  }
                                  appealPeriodEnd={appealDeadlines && appealDeadlines[index + 1] && parseInt(appealDeadlines[index + 1].end)}
                                  roi={this.calculateReturnOfInvestmentRatio(index + 1).toFixed(2)}
                                  suggestedContribution={
                                    contributions[index + 1]
                                      ? BigNumber(appealCosts[index + 1])
                                          .minus(BigNumber(contributions[index + 1]))
                                          .div(DECIMALS)
                                          .toString()
                                      : BigNumber(appealCosts[index + 1])
                                          .div(DECIMALS)
                                          .toString()
                                  }
                                  appealCallback={appealCallback}
                                  rulingOptionCode={index + 1}
                                />
                              </Col>
                            ))}
                          {metaevidenceJSON &&
                            metaevidenceJSON.rulingOptions.type == "multiple-select" &&
                            Object.keys(appealDeadlines).length > 1 &&
                            Array.from(Array(2 ** metaevidenceJSON.rulingOptions.titles.length).keys()).map((key, index) => (
                              <Col key={index} className="pb-4" xl={8} lg={12} xs={24}>
                                <CrowdfundingCard
                                  title={
                                    index == 0
                                      ? "None"
                                      : index
                                          .toString(2)
                                          .padStart(4, "0")
                                          .split("")
                                          .reverse()
                                          .map((bit, i) => (bit == 1 ? metaevidenceJSON.rulingOptions.titles[i] : null))
                                          .join(" ")
                                          .concat(" (ruling code: " + (index + 1) + ")")
                                  }
                                  winner={currentRuling == index + 1}
                                  fundingPercentage={
                                    contributions[index + 1]
                                      ? BigNumber(contributions[index + 1])
                                          .div(BigNumber(appealCosts[index + 1]))
                                          .times(100)
                                          .toFixed(2)
                                      : 0
                                  }
                                  appealPeriodEnd={appealDeadlines && appealDeadlines[index + 1] && parseInt(appealDeadlines[index + 1].end)}
                                  roi={this.calculateReturnOfInvestmentRatio(index + 1).toFixed(2)}
                                  suggestedContribution={
                                    contributions[index + 1]
                                      ? BigNumber(appealCosts[index + 1])
                                          .minus(BigNumber(contributions[index + 1]))
                                          .div(DECIMALS)
                                          .toString()
                                      : BigNumber(appealCosts[index + 1])
                                          .div(DECIMALS)
                                          .toString()
                                  }
                                  appealCallback={appealCallback}
                                  rulingOptionCode={index + 1}
                                />
                              </Col>
                            ))}

                          {metaevidenceJSON &&
                            (metaevidenceJSON.rulingOptions.type == "uint" || metaevidenceJSON.rulingOptions.type == "int" || metaevidenceJSON.rulingOptions.type == "string") &&
                            Object.keys(contributions).map((key, value) => (
                              <Col key={key} className="pb-4" xl={8} lg={12} xs={24}>
                                <CrowdfundingCard
                                  title={key - 1}
                                  rulingOptionCode={key}
                                  winner={currentRuling == key}
                                  fundingPercentage={contributions[key] ? BigNumber(contributions[key]).div(BigNumber(appealCosts[key])).times(100).toFixed(2) : 0}
                                  suggestedContribution={BigNumber(appealCosts[key]).minus(BigNumber(contributions[key])).div(DECIMALS).toString()}
                                  appealPeriodEnd={appealDeadlines && appealDeadlines[key] && parseInt(appealDeadlines[key].end)}
                                  roi={this.calculateReturnOfInvestmentRatio(key).toFixed(2)}
                                  appealCallback={appealCallback}
                                />
                              </Col>
                            ))}
                          {metaevidenceJSON && (metaevidenceJSON.rulingOptions.type == "uint" || metaevidenceJSON.rulingOptions.type == "int" || metaevidenceJSON.rulingOptions.type == "string") && (
                            <Col className="pb-4" xl={8} lg={12} xs={24}>
                              <CrowdfundingCard
                                variable={metaevidenceJSON.rulingOptions.type}
                                winner={false}
                                fundingPercentage={0}
                                appealPeriodEnd={Math.min(...Object.values(appealDeadlines).map((item) => item.end))} // TODO
                                roi={this.calculateReturnOfInvestmentRatioForLoser().toFixed(2)}
                                suggestedContribution={BigNumber(Math.max(...Object.values(appealCosts)))
                                  .div(DECIMALS)
                                  .toString()}
                                appealCallback={appealCallback}
                              />
                            </Col>
                          )}
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
                  <p>{QuestionTypes[metaevidenceJSON.rulingOptions.type]}</p>
                  <p>{metaevidenceJSON.question}</p>
                  {metaevidenceJSON.rulingOptions.type == "single-select" ||
                    (metaevidenceJSON.rulingOptions.type == "multiple-select" && (
                      <>
                        <Dropdown>
                          <Dropdown.Toggle className="form-control" block className={styles.dropdownToggle}>
                            View Voting Options
                          </Dropdown.Toggle>

                          <Dropdown.Menu>
                            {metaevidenceJSON.rulingOptions.titles.map((title, index) => (
                              <Dropdown.Item key={index} disabled>{`Option ${index + 1}: ${title}`}</Dropdown.Item>
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
                    ))}
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
                    evidenceSubmissionEnabled={true}
                    metaevidence={metaevidenceJSON}
                    evidences={evidences}
                    dispute={disputeEvent}
                    disputePeriod={parseInt(arbitratorDispute.period)}
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
    else return <div></div>;
  }
}

export default DisputeDetails;
