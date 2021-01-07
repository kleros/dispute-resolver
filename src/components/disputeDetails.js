import { Card, Row, Col, Form, Container, Accordion, Dropdown } from "react-bootstrap";
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
    } else if (this.props.currentRuling == 0) {
      return shared.plus(shared).plus(divisor).div(shared.plus(divisor));
    } else {
      return winner.plus(loser).plus(divisor).div(loser.plus(divisor));
    }
  };

  getCombinations(chars) {
    var result = [];
    var f = function (prefix, chars) {
      for (var i = 0; i < chars.length; i++) {
        result.push(prefix + chars[i]);
        f(prefix + chars[i], chars.slice(i + 1));
      }
    };
    f("", chars);
    return result;
  }

  k_combinations(set, k) {
    var i, j, combs, head, tailcombs;

    // There is no way to take e.g. sets of 5 elements from
    // a set of 4.
    if (k > set.length || k <= 0) {
      return [];
    }

    // K-sized set has only one K-sized subset.
    if (k == set.length) {
      return [set];
    }

    // There is N 1-sized subsets in a N-sized set.
    if (k == 1) {
      combs = [];
      for (i = 0; i < set.length; i++) {
        combs.push([set[i]]);
      }
      return combs;
    }

    // Assert {1 < k < set.length}

    // Algorithm description:
    // To get k-combinations of a set, we want to join each element
    // with all (k-1)-combinations of the other elements. The set of
    // these k-sized sets would be the desired result. However, as we
    // represent sets with lists, we need to take duplicates into
    // account. To avoid producing duplicates and also unnecessary
    // computing, we use the following approach: each element i
    // divides the list into three: the preceding elements, the
    // current element i, and the subsequent elements. For the first
    // element, the list of preceding elements is empty. For element i,
    // we compute the (k-1)-computations of the subsequent elements,
    // join each with the element i, and store the joined to the set of
    // computed k-combinations. We do not need to take the preceding
    // elements into account, because they have already been the i:th
    // element so they are already computed and stored. When the length
    // of the subsequent list drops below (k-1), we cannot find any
    // (k-1)-combs, hence the upper limit for the iteration:
    combs = [];
    for (i = 0; i < set.length - k + 1; i++) {
      // head is a list that includes only our current element.
      head = set.slice(i, i + 1);
      // We take smaller combinations from the subsequent elements
      tailcombs = this.k_combinations(set.slice(i + 1), k - 1);
      // For each (k-1)-combination we join it with the current
      // and store it to the set of k-combinations.
      for (j = 0; j < tailcombs.length; j++) {
        combs.push(head.concat(tailcombs[j]));
      }
    }
    return combs;
  }

  combinations(set) {
    var k, i, combs, k_combs;
    combs = [];

    // Calculate all non-empty k-combinations
    for (k = 1; k <= set.length; k++) {
      k_combs = this.k_combinations(set, k);
      for (i = 0; i < k_combs.length; i++) {
        combs.push(k_combs[i]);
      }
    }
    return combs;
  }

  componentDidMount() {
    console.log("here");
  }

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
    } = this.props;
    const { activeKey } = this.state;
    console.log(this.props);
    console.log(this.state);
    console.log(combinations([0, 1, 2]));

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
          {metaevidenceJSON.rulingOptions.type == "single-select" && arbitratorDispute.period == 3 && (
            <AlertMessage type="info" title={`Jury decision: ${currentRuling == 0 ? "refused to arbitrate" : metaevidenceJSON.rulingOptions.titles[currentRuling - 1]}`} content="This decision can be appealed within appeal period." />
          )}
          {metaevidenceJSON.rulingOptions.type == "multiple-select" && arbitratorDispute.period == 3 && (
            <AlertMessage type="info" title={`Jury decision: ${currentRuling == 0 ? "refused to arbitrate" : combinations([0, 1, 2])[currentRuling - 1].map((code) => metaevidenceJSON.rulingOptions.titles[code])}`} content="This decision can be appealed within appeal period." />
          )}
          <Accordion
            className={`mt-4 ${styles.accordion}`}
            onSelect={(e) => {
              this.setState({ activeKey: e });
            }}
          >
            <Card>
              {arbitratorDispute && arbitratorDispute.period == 3 && (
                <>
                  <Accordion.Toggle className={activeKey == 1 ? "open" : "closed"} as={Card.Header} eventKey="1">
                    Appeal
                  </Accordion.Toggle>
                  <Accordion.Collapse eventKey="1">
                    <Card.Body>
                      <div className="h1">Appeal the decision</div>
                      <p className="label">
                        In order to appeal the decision, you need to fully fund the crowdfunding deposit. The dispute will be sent to the jurors when the full deposit is reached. Note that if the previous round loser funds its side, the previous round winner should also fully
                        fund its side in order not to lose the case.
                      </p>

                      <AlertMessage extraClass="mt-6" type="info" title={`Jury decision: ${metaevidenceJSON.rulingOptions.titles[currentRuling - 1]}`} content="This decision can be appealed within appeal period." />
                      {appealDeadlines && contributions && (
                        <Row className="mt-3">
                          <Col className="pb-4" xl={8} lg={12} xs={24}>
                            <CrowdfundingCard
                              key={0}
                              title={"Invalid / Refused to Arbitrate"}
                              winner={currentRuling == 0}
                              fundingPercentage={contributions[0] ? BigNumber(contributions[0]).div(BigNumber(appealCosts[0])).times(100).toFixed(2) : 0}
                              appealPeriodEnd={appealDeadlines && parseInt(appealDeadlines[0].end)}
                              suggestedContribution={contributions[0] ? BigNumber(appealCosts[0]).minus(BigNumber(contributions[0])).div(DECIMALS).toString() : BigNumber(appealCosts[0]).div(DECIMALS).toString()}
                              roi={this.calculateReturnOfInvestmentRatio(0).toFixed(2)}
                              appealCallback={appealCallback}
                              rulingOptionCode={0}
                            />
                          </Col>
                          {metaevidenceJSON &&
                            (metaevidenceJSON.rulingOptions.type == "single-select" || metaevidenceJSON.rulingOptions.type == "multiple-select") &&
                            metaevidenceJSON.rulingOptions.titles.map((title, index) => (
                              <Col className="pb-4" xl={8} lg={12} xs={24}>
                                <CrowdfundingCard
                                  key={index + 1}
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
                                  appealPeriodEnd={appealDeadlines && parseInt(appealDeadlines[index + 1].end)}
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
                            !(metaevidenceJSON.rulingOptions.type == "single-select" && metaevidenceJSON.rulingOptions.type == "multiple-select") &&
                            [].map((title, index) => (
                              <Col className="pb-4" xl={8} lg={12} xs={24}>
                                <CrowdfundingCard key={index + 1} title={title} winner={currentRuling == 12345} fundingPercentage={68} appealPeriodEnd={1610000000} roi={1.3} />
                              </Col>
                            ))}
                          {metaevidenceJSON && !(metaevidenceJSON.rulingOptions.type == "single-select" || metaevidenceJSON.rulingOptions.type == "multiple-select") && (
                            <Col className="pb-4" xl={8} lg={12} xs={24}>
                              <CrowdfundingCard
                                variable={metaevidenceJSON.rulingOptions.type}
                                winner={currentRuling == 12345}
                                fundingPercentage={contributions[123456789] ? BigNumber(contributions[123456789]).div(BigNumber(appealCosts[123456789])).times(100).toFixed(2) : 0}
                                appealPeriodEnd={appealDeadlines && parseInt(appealDeadlines[0].end)} // TODO
                                roi={this.calculateReturnOfInvestmentRatio(123456789).toFixed(2)}
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
