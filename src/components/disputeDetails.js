import { Card, Row, Col, Form, Container, Accordion, Dropdown } from "react-bootstrap";
import React from "react";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { ReactComponent as AvatarSVG } from "../assets/images/avatar.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as InfoSVG } from "../assets/images/info.svg";

import DisputeTimeline from "components/disputeTimeline";
import EvidenceTimeline from "components/evidenceTimeline";
import CrowdfundingCard from "components/crowdfundingCard";

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

  componentDidMount() {}

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
          <AlertMessage type="info" title={`Jury decision: ${metaevidenceJSON.rulingOptions.titles[currentRuling - 1]}`} content="This decision can be appealed within appeal period." />
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
                      <Row className="mt-3">
                        <Col className="pb-4" xl={8} lg={12} xs={24}>
                          <CrowdfundingCard key={0} title={"Invalid / Refused to Arbitrate"} winner={currentRuling == 0} fundingPercentage={8} appealPeriodEnd={appealDeadlines && parseInt(appealDeadlines[0].end)} roi={1.1} />
                        </Col>
                        {metaevidenceJSON &&
                          (metaevidenceJSON.rulingOptions.type == "single-select" || metaevidenceJSON.rulingOptions.type == "multiple-select") &&
                          metaevidenceJSON.rulingOptions.titles.map((title, index) => (
                            <Col className="pb-4" xl={8} lg={12} xs={24}>
                              <CrowdfundingCard key={index + 1} title={title} winner={currentRuling == index + 1} fundingPercentage={68} appealPeriodEnd={appealDeadlines && parseInt(appealDeadlines[index + 1].end)} roi={1.3} />
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
                            <CrowdfundingCard variable={metaevidenceJSON.rulingOptions.type} winner={currentRuling == 12345} fundingPercentage={0} appealPeriodEnd={1610000000} roi={1.3} />
                          </Col>
                        )}
                      </Row>
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
