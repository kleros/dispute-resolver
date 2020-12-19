import { Card, Row, Col, Form, Container, Accordion } from "react-bootstrap";
import React from "react";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { ReactComponent as AvatarSVG } from "../assets/images/avatar.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";

import DisputeTimeline from "components/disputeTimeline";
import AlertMessage from "components/alertMessage";

import styles from "components/styles/disputeDetails.module.css";

class DisputeDetails extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      activeAccordionKey: 0,
    };
  }

  componentDidMount() {}

  render() {
    const { metaevidenceJSON, ipfsGateway, interfaceValid, arbitrated, arbitratorDisputeID, arbitratorAddress, arbitratorDispute, subcourts, subcourtDetails, arbitratorDisputeDetails, currentRuling } = this.props;
    console.log(this.props);
    const { activeAccordionKey } = this.state;
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
                  <span>{arbitratorDisputeDetails.votesLengths}</span>
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
            defaultActiveKey="0"
            onSelect={(e) => {
              this.setState({ activeAccordionKey: e });
            }}
          >
            <Card>
              <Accordion.Toggle className={activeAccordionKey == 0 ? "open" : "closed"} as={Card.Header} eventKey="0">
                Appeal
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="0">
                <Card.Body>Hello! I'm the body</Card.Body>
              </Accordion.Collapse>
            </Card>
            <Card>
              <Accordion.Toggle className={activeAccordionKey == 1 ? "open" : "closed"} as={Card.Header} eventKey="1">
                Question
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="1">
                <Card.Body>Hello! I'm another body</Card.Body>
              </Accordion.Collapse>
            </Card>
            <Card>
              <Accordion.Toggle className={activeAccordionKey == 2 ? "open" : "closed"} as={Card.Header} eventKey="2">
                Evidence
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="2">
                <Card.Body>Hello! I'm another body</Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
        </section>
      );
    else return <div></div>;
  }
}

export default DisputeDetails;
